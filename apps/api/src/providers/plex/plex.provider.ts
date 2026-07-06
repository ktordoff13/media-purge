import { Injectable, Logger } from '@nestjs/common';
import { MediaSource } from '../../database/entities/media-source.entity';
import { ExternalIds } from '../../database/entities/media-item.entity';
import { bestResolution, getJson } from '../../common/http.util';
import {
  ConnectionTestResult,
  MediaServerProvider,
  ProviderCapabilities,
  RemoteLibrary,
  RemoteMediaItem,
} from '../media-server-provider.interface';

/* Plex API response shapes (only the fields we consume). */
interface PlexPart {
  file?: string;
  size?: number;
}
interface PlexMedia {
  videoResolution?: string;
  Part?: PlexPart[];
}
interface PlexGuid {
  id?: string;
}
interface PlexTag {
  tag?: string;
}
interface PlexMetadata {
  ratingKey: string;
  title: string;
  year?: number;
  type: string;
  addedAt?: number;
  lastViewedAt?: number;
  viewCount?: number;
  viewOffset?: number;
  duration?: number;
  rating?: number;
  audienceRating?: number;
  leafCount?: number;
  viewedLeafCount?: number;
  grandparentRatingKey?: string;
  thumb?: string;
  Media?: PlexMedia[];
  Guid?: PlexGuid[];
  Label?: PlexTag[];
}
interface PlexContainer<T = PlexMetadata> {
  MediaContainer: {
    size?: number;
    totalSize?: number;
    friendlyName?: string;
    version?: string;
    Metadata?: T[];
    Directory?: { key: string; title: string; type: string }[];
  };
}

const PAGE_SIZE = 200;

/**
 * Plex Media Server integration. Play stats reflect the account that owns the
 * token (Plex's /library API does not aggregate managed/shared users — that is
 * what the optional Tautulli enricher adds), hence perUserHistory: false.
 */
@Injectable()
export class PlexProvider implements MediaServerProvider {
  private readonly logger = new Logger(PlexProvider.name);

  readonly type = 'plex';
  readonly displayName = 'Plex';
  readonly capabilities: ProviderCapabilities = {
    perUserHistory: false,
    watchProgress: true,
    labels: true,
    multiVersion: true,
  };

  private url(source: MediaSource, path: string, params: Record<string, string> = {}): string {
    const u = new URL(path, source.baseUrl.endsWith('/') ? source.baseUrl : source.baseUrl + '/');
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set('X-Plex-Token', source.token);
    return u.toString();
  }

  private get headers(): Record<string, string> {
    return { Accept: 'application/json' };
  }

  async testConnection(source: MediaSource): Promise<ConnectionTestResult> {
    try {
      const res = await getJson<PlexContainer>(this.url(source, ''), this.headers, 15_000);
      return {
        ok: true,
        message: 'Connected',
        serverName: res.MediaContainer.friendlyName,
        version: res.MediaContainer.version,
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async listLibraries(source: MediaSource): Promise<RemoteLibrary[]> {
    const res = await getJson<PlexContainer>(this.url(source, 'library/sections'), this.headers);
    return (res.MediaContainer.Directory ?? [])
      .filter((d) => d.type === 'movie' || d.type === 'show')
      .map((d) => ({
        id: d.key,
        name: d.title,
        mediaType: d.type === 'movie' ? ('movie' as const) : ('show' as const),
      }));
  }

  async fetchItems(source: MediaSource, library: RemoteLibrary): Promise<RemoteMediaItem[]> {
    return library.mediaType === 'movie'
      ? this.fetchMovies(source, library)
      : this.fetchShows(source, library);
  }

  imageUrl(source: MediaSource, thumbPath: string): string | null {
    return this.url(source, thumbPath.replace(/^\//, ''));
  }

  private async fetchMovies(source: MediaSource, library: RemoteLibrary): Promise<RemoteMediaItem[]> {
    const items = await this.pagedMetadata(source, `library/sections/${library.id}/all`, {
      type: '1',
      includeGuids: '1',
    });
    return items.map((m) => this.mapMovie(m, library));
  }

  /**
   * Shows need two fetches: the show listing (watch counts, ratings, labels)
   * plus every episode (file paths/sizes) aggregated by grandparentRatingKey.
   */
  private async fetchShows(source: MediaSource, library: RemoteLibrary): Promise<RemoteMediaItem[]> {
    const [shows, episodes] = await Promise.all([
      this.pagedMetadata(source, `library/sections/${library.id}/all`, {
        type: '2',
        includeGuids: '1',
      }),
      this.pagedMetadata(source, `library/sections/${library.id}/all`, { type: '4' }),
    ]);

    const byShow = new Map<string, PlexMetadata[]>();
    for (const ep of episodes) {
      const key = ep.grandparentRatingKey;
      if (!key) continue;
      const list = byShow.get(key) ?? [];
      list.push(ep);
      byShow.set(key, list);
    }

    return shows.map((show) => {
      const eps = byShow.get(show.ratingKey) ?? [];
      let sizeBytes = 0;
      let resolution: string | null = null;
      let lastEpisodeAddedAt: number | undefined;
      let lastPlayedAt: number | undefined = show.lastViewedAt;
      let playCount = 0;
      const filePaths: string[] = [];
      for (const ep of eps) {
        for (const media of ep.Media ?? []) {
          resolution = bestResolution(resolution, normalizeResolution(media.videoResolution));
          for (const part of media.Part ?? []) {
            if (part.file) filePaths.push(part.file);
            sizeBytes += part.size ?? 0;
          }
        }
        playCount += ep.viewCount ?? 0;
        if (ep.lastViewedAt && (!lastPlayedAt || ep.lastViewedAt > lastPlayedAt)) {
          lastPlayedAt = ep.lastViewedAt;
        }
        if (ep.addedAt && (!lastEpisodeAddedAt || ep.addedAt > lastEpisodeAddedAt)) {
          lastEpisodeAddedAt = ep.addedAt;
        }
      }

      const episodeCount = show.leafCount ?? eps.length;
      const watchedEpisodeCount =
        show.viewedLeafCount ?? eps.filter((e) => (e.viewCount ?? 0) > 0).length;

      return {
        providerItemId: show.ratingKey,
        libraryId: library.id,
        libraryName: library.name,
        type: 'show' as const,
        title: show.title,
        year: show.year ?? null,
        addedAt: epochToDate(show.addedAt),
        lastPlayedAt: epochToDate(lastPlayedAt),
        playCount,
        watchProgress: episodeCount > 0 ? watchedEpisodeCount / episodeCount : null,
        ratingCritic: show.rating ?? null,
        ratingAudience: show.audienceRating ?? null,
        filePaths,
        sizeBytes,
        resolution,
        versionCount: 1,
        externalIds: mapGuids(show.Guid),
        labels: (show.Label ?? []).map((l) => l.tag).filter((t): t is string => !!t),
        // Plex does not expose ended/continuing; rules fall back to
        // lastEpisodeAddedAt to judge whether a show is still growing.
        seriesStatus: null,
        episodeCount,
        watchedEpisodeCount,
        lastEpisodeAddedAt: epochToDate(lastEpisodeAddedAt),
        thumbPath: show.thumb ?? null,
        providerData: null,
      };
    });
  }

  private mapMovie(m: PlexMetadata, library: RemoteLibrary): RemoteMediaItem {
    const media = m.Media ?? [];
    const parts = media.flatMap((md) => md.Part ?? []);
    let resolution: string | null = null;
    for (const md of media) {
      resolution = bestResolution(resolution, normalizeResolution(md.videoResolution));
    }
    const viewCount = m.viewCount ?? 0;
    let watchProgress: number | null = viewCount > 0 ? 1 : null;
    if (m.viewOffset && m.duration) watchProgress = Math.min(1, m.viewOffset / m.duration);

    return {
      providerItemId: m.ratingKey,
      libraryId: library.id,
      libraryName: library.name,
      type: 'movie',
      title: m.title,
      year: m.year ?? null,
      addedAt: epochToDate(m.addedAt),
      lastPlayedAt: epochToDate(m.lastViewedAt),
      playCount: viewCount,
      watchProgress,
      ratingCritic: m.rating ?? null,
      ratingAudience: m.audienceRating ?? null,
      filePaths: parts.map((p) => p.file).filter((f): f is string => !!f),
      sizeBytes: parts.reduce((sum, p) => sum + (p.size ?? 0), 0),
      resolution,
      versionCount: media.length || 1,
      externalIds: mapGuids(m.Guid),
      labels: (m.Label ?? []).map((l) => l.tag).filter((t): t is string => !!t),
      seriesStatus: null,
      episodeCount: null,
      watchedEpisodeCount: null,
      lastEpisodeAddedAt: null,
      thumbPath: m.thumb ?? null,
      providerData: null,
    };
  }

  private async pagedMetadata(
    source: MediaSource,
    path: string,
    params: Record<string, string>,
  ): Promise<PlexMetadata[]> {
    const out: PlexMetadata[] = [];
    for (let start = 0; ; start += PAGE_SIZE) {
      const res = await getJson<PlexContainer>(
        this.url(source, path, {
          ...params,
          'X-Plex-Container-Start': String(start),
          'X-Plex-Container-Size': String(PAGE_SIZE),
        }),
        this.headers,
      );
      const mc = res.MediaContainer;
      const batch = mc.Metadata ?? [];
      out.push(...batch);
      const total = mc.totalSize ?? batch.length;
      if (batch.length === 0 || out.length >= total) break;
    }
    this.logger.debug(`Fetched ${out.length} items from Plex ${path}`);
    return out;
  }
}

function epochToDate(epochSeconds: number | undefined): Date | null {
  return epochSeconds ? new Date(epochSeconds * 1000) : null;
}

function normalizeResolution(res: string | undefined): string | null {
  if (!res) return null;
  const r = res.toLowerCase();
  if (r === '4k' || r === '2160') return '4k';
  if (r === '1080') return '1080';
  if (r === '720') return '720';
  return 'sd';
}

function mapGuids(guids: PlexGuid[] | undefined): ExternalIds {
  const ids: ExternalIds = {};
  for (const g of guids ?? []) {
    const [scheme, value] = (g.id ?? '').split('://');
    if (scheme === 'imdb') ids.imdb = value;
    if (scheme === 'tmdb') ids.tmdb = value;
    if (scheme === 'tvdb') ids.tvdb = value;
  }
  return ids;
}
