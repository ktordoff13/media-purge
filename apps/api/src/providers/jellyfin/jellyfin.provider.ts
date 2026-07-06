import { Injectable, Logger } from '@nestjs/common';
import { MediaSource } from '../../database/entities/media-source.entity';
import { ExternalIds } from '../../database/entities/media-item.entity';
import { bestResolution, getJson, resolutionFromHeight } from '../../common/http.util';
import {
  ConnectionTestResult,
  MediaServerProvider,
  ProviderCapabilities,
  RemoteLibrary,
  RemoteMediaItem,
} from '../media-server-provider.interface';

/* Jellyfin API response shapes (only the fields we consume). */
interface JfUserData {
  PlayCount?: number;
  Played?: boolean;
  LastPlayedDate?: string;
  PlaybackPositionTicks?: number;
}
interface JfMediaStream {
  Type?: string;
  Height?: number;
}
interface JfMediaSource {
  Path?: string;
  Size?: number;
  MediaStreams?: JfMediaStream[];
}
interface JfItem {
  Id: string;
  Name: string;
  ProductionYear?: number;
  DateCreated?: string;
  Path?: string;
  RunTimeTicks?: number;
  CommunityRating?: number;
  /** Rotten-Tomatoes style 0..100. */
  CriticRating?: number;
  ProviderIds?: Record<string, string>;
  Tags?: string[];
  /** Series only: 'Ended' | 'Continuing'. */
  Status?: string;
  RecursiveItemCount?: number;
  SeriesId?: string;
  MediaSources?: JfMediaSource[];
  ImageTags?: Record<string, string>;
  UserData?: JfUserData;
}
interface JfItemsPage {
  Items: JfItem[];
  TotalRecordCount: number;
}
interface JfUser {
  Id: string;
  Name: string;
  Policy?: { IsDisabled?: boolean };
}
interface JfSystemInfo {
  ServerName?: string;
  Version?: string;
}
interface JfLibrary {
  Id: string;
  Name: string;
  CollectionType?: string;
}

const PAGE_SIZE = 300;
const ITEM_FIELDS = 'Path,MediaSources,DateCreated,ProviderIds,Tags,CriticRating,RecursiveItemCount';

interface PlayStats {
  playCount: number;
  lastPlayedAt: Date | null;
  watchProgress: number | null;
  playedByAnyone: boolean;
}

/**
 * Jellyfin integration. Requires an admin API key (Dashboard → API Keys) so
 * it can enumerate users and aggregate real per-user watch state — Jellyfin
 * gives us everything Plex needs Tautulli for.
 */
@Injectable()
export class JellyfinProvider implements MediaServerProvider {
  private readonly logger = new Logger(JellyfinProvider.name);

  readonly type = 'jellyfin';
  readonly displayName = 'Jellyfin';
  readonly capabilities: ProviderCapabilities = {
    perUserHistory: true,
    watchProgress: true,
    labels: true,
    multiVersion: true,
  };

  private url(source: MediaSource, path: string, params: Record<string, string> = {}): string {
    const u = new URL(path, source.baseUrl.endsWith('/') ? source.baseUrl : source.baseUrl + '/');
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  private headers(source: MediaSource): Record<string, string> {
    return { 'X-Emby-Token': source.token, Accept: 'application/json' };
  }

  async testConnection(source: MediaSource): Promise<ConnectionTestResult> {
    try {
      const info = await getJson<JfSystemInfo>(
        this.url(source, 'System/Info'),
        this.headers(source),
        15_000,
      );
      return { ok: true, message: 'Connected', serverName: info.ServerName, version: info.Version };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async listLibraries(source: MediaSource): Promise<RemoteLibrary[]> {
    const res = await getJson<{ Items: JfLibrary[] }>(
      this.url(source, 'Library/MediaFolders'),
      this.headers(source),
    );
    return res.Items.filter((l) => l.CollectionType === 'movies' || l.CollectionType === 'tvshows').map(
      (l) => ({
        id: l.Id,
        name: l.Name,
        mediaType: l.CollectionType === 'movies' ? ('movie' as const) : ('show' as const),
      }),
    );
  }

  async fetchItems(source: MediaSource, library: RemoteLibrary): Promise<RemoteMediaItem[]> {
    return library.mediaType === 'movie'
      ? this.fetchMovies(source, library)
      : this.fetchShows(source, library);
  }

  imageUrl(source: MediaSource, thumbPath: string): string | null {
    const u = new URL(thumbPath.replace(/^\//, ''), source.baseUrl.endsWith('/') ? source.baseUrl : source.baseUrl + '/');
    u.searchParams.set('api_key', source.token);
    return u.toString();
  }

  private async activeUsers(source: MediaSource): Promise<JfUser[]> {
    const users = await getJson<JfUser[]>(this.url(source, 'Users'), this.headers(source));
    return users.filter((u) => !u.Policy?.IsDisabled);
  }

  private async fetchMovies(source: MediaSource, library: RemoteLibrary): Promise<RemoteMediaItem[]> {
    const users = await this.activeUsers(source);
    const base = new Map<string, JfItem>();
    const stats = new Map<string, PlayStats>();

    for (const user of users) {
      const items = await this.pagedItems(source, {
        userId: user.Id,
        ParentId: library.id,
        IncludeItemTypes: 'Movie',
        Recursive: 'true',
        Fields: ITEM_FIELDS,
      });
      for (const item of items) {
        if (!base.has(item.Id)) base.set(item.Id, item);
        this.mergeStats(stats, item.Id, item);
      }
    }

    return [...base.values()].map((item) => {
      const s = stats.get(item.Id) ?? emptyStats();
      const sources = item.MediaSources ?? [];
      let resolution: string | null = null;
      for (const ms of sources) {
        const video = (ms.MediaStreams ?? []).find((st) => st.Type === 'Video');
        resolution = bestResolution(resolution, resolutionFromHeight(video?.Height));
      }
      const filePaths = sources.map((ms) => ms.Path).filter((p): p is string => !!p);
      return {
        providerItemId: item.Id,
        libraryId: library.id,
        libraryName: library.name,
        type: 'movie' as const,
        title: item.Name,
        year: item.ProductionYear ?? null,
        addedAt: isoToDate(item.DateCreated),
        lastPlayedAt: s.lastPlayedAt,
        playCount: s.playCount,
        watchProgress: s.watchProgress,
        ratingCritic: item.CriticRating != null ? item.CriticRating / 10 : null,
        ratingAudience: item.CommunityRating ?? null,
        filePaths: filePaths.length ? filePaths : item.Path ? [item.Path] : [],
        sizeBytes: sources.reduce((sum, ms) => sum + (ms.Size ?? 0), 0),
        resolution,
        versionCount: sources.length || 1,
        externalIds: mapProviderIds(item.ProviderIds),
        labels: item.Tags ?? [],
        seriesStatus: null,
        episodeCount: null,
        watchedEpisodeCount: null,
        lastEpisodeAddedAt: null,
        thumbPath: item.ImageTags?.Primary ? `Items/${item.Id}/Images/Primary?maxWidth=400` : null,
        providerData: null,
      };
    });
  }

  /**
   * Shows: series metadata per user (status, ratings), one system-level
   * episode fetch for sizes/paths, and per-user episode fetches to build a
   * true cross-user union of watched episodes and play counts.
   */
  private async fetchShows(source: MediaSource, library: RemoteLibrary): Promise<RemoteMediaItem[]> {
    const users = await this.activeUsers(source);

    const seriesBase = new Map<string, JfItem>();
    for (const user of users) {
      const series = await this.pagedItems(source, {
        userId: user.Id,
        ParentId: library.id,
        IncludeItemTypes: 'Series',
        Recursive: 'true',
        Fields: ITEM_FIELDS,
      });
      for (const s of series) if (!seriesBase.has(s.Id)) seriesBase.set(s.Id, s);
      if (seriesBase.size > 0) break; // one user sees the full library; others add nothing
    }

    // System-level episode fetch: files, sizes, dates (no user context needed).
    const episodes = await this.pagedItems(source, {
      ParentId: library.id,
      IncludeItemTypes: 'Episode',
      Recursive: 'true',
      Fields: 'Path,MediaSources,DateCreated',
    });
    interface SeriesFiles {
      filePaths: string[];
      sizeBytes: number;
      resolution: string | null;
      episodeCount: number;
      lastEpisodeAddedAt: Date | null;
    }
    const files = new Map<string, SeriesFiles>();
    for (const ep of episodes) {
      if (!ep.SeriesId) continue;
      let f = files.get(ep.SeriesId);
      if (!f) {
        f = { filePaths: [], sizeBytes: 0, resolution: null, episodeCount: 0, lastEpisodeAddedAt: null };
        files.set(ep.SeriesId, f);
      }
      f.episodeCount += 1;
      for (const ms of ep.MediaSources ?? []) {
        if (ms.Path) f.filePaths.push(ms.Path);
        f.sizeBytes += ms.Size ?? 0;
        const video = (ms.MediaStreams ?? []).find((st) => st.Type === 'Video');
        f.resolution = bestResolution(f.resolution, resolutionFromHeight(video?.Height));
      }
      const added = isoToDate(ep.DateCreated);
      if (added && (!f.lastEpisodeAddedAt || added > f.lastEpisodeAddedAt)) {
        f.lastEpisodeAddedAt = added;
      }
    }

    // Per-user episode watch state → union of watched episodes per series.
    const watched = new Map<string, Set<string>>();
    const seriesStats = new Map<string, PlayStats>();
    for (const user of users) {
      const eps = await this.pagedItems(source, {
        userId: user.Id,
        ParentId: library.id,
        IncludeItemTypes: 'Episode',
        Recursive: 'true',
      });
      for (const ep of eps) {
        if (!ep.SeriesId || !ep.UserData) continue;
        this.mergeStats(seriesStats, ep.SeriesId, ep);
        if (ep.UserData.Played) {
          let set = watched.get(ep.SeriesId);
          if (!set) watched.set(ep.SeriesId, (set = new Set()));
          set.add(ep.Id);
        }
      }
    }

    return [...seriesBase.values()].map((series) => {
      const f = files.get(series.Id);
      const s = seriesStats.get(series.Id) ?? emptyStats();
      const episodeCount = series.RecursiveItemCount ?? f?.episodeCount ?? 0;
      const watchedEpisodeCount = watched.get(series.Id)?.size ?? 0;
      return {
        providerItemId: series.Id,
        libraryId: library.id,
        libraryName: library.name,
        type: 'show' as const,
        title: series.Name,
        year: series.ProductionYear ?? null,
        addedAt: isoToDate(series.DateCreated),
        lastPlayedAt: s.lastPlayedAt,
        playCount: s.playCount,
        watchProgress: episodeCount > 0 ? watchedEpisodeCount / episodeCount : null,
        ratingCritic: series.CriticRating != null ? series.CriticRating / 10 : null,
        ratingAudience: series.CommunityRating ?? null,
        filePaths: f?.filePaths ?? [],
        sizeBytes: f?.sizeBytes ?? 0,
        resolution: f?.resolution ?? null,
        versionCount: 1,
        externalIds: mapProviderIds(series.ProviderIds),
        labels: series.Tags ?? [],
        seriesStatus:
          series.Status === 'Ended' ? 'ended' : series.Status === 'Continuing' ? 'continuing' : null,
        episodeCount,
        watchedEpisodeCount,
        lastEpisodeAddedAt: f?.lastEpisodeAddedAt ?? null,
        thumbPath: series.ImageTags?.Primary
          ? `Items/${series.Id}/Images/Primary?maxWidth=400`
          : null,
        providerData: null,
      };
    });
  }

  /** Accumulate one user's UserData into the cross-user stats for an item. */
  private mergeStats(stats: Map<string, PlayStats>, key: string, item: JfItem): void {
    const ud = item.UserData;
    if (!ud) return;
    let s = stats.get(key);
    if (!s) stats.set(key, (s = emptyStats()));
    s.playCount += ud.PlayCount ?? 0;
    const last = isoToDate(ud.LastPlayedDate);
    if (last && (!s.lastPlayedAt || last > s.lastPlayedAt)) s.lastPlayedAt = last;
    let progress: number | null = null;
    if (ud.Played) progress = 1;
    else if (ud.PlaybackPositionTicks && item.RunTimeTicks) {
      progress = Math.min(1, ud.PlaybackPositionTicks / item.RunTimeTicks);
    }
    if (progress != null && (s.watchProgress == null || progress > s.watchProgress)) {
      s.watchProgress = progress;
    }
    s.playedByAnyone ||= !!ud.Played;
  }

  private async pagedItems(
    source: MediaSource,
    params: Record<string, string>,
  ): Promise<JfItem[]> {
    const out: JfItem[] = [];
    for (let start = 0; ; start += PAGE_SIZE) {
      const page = await getJson<JfItemsPage>(
        this.url(source, 'Items', {
          ...params,
          StartIndex: String(start),
          Limit: String(PAGE_SIZE),
        }),
        this.headers(source),
      );
      out.push(...page.Items);
      if (page.Items.length === 0 || out.length >= page.TotalRecordCount) break;
    }
    this.logger.debug(`Fetched ${out.length} Jellyfin items (${params.IncludeItemTypes})`);
    return out;
  }
}

function emptyStats(): PlayStats {
  return { playCount: 0, lastPlayedAt: null, watchProgress: null, playedByAnyone: false };
}

function isoToDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function mapProviderIds(ids: Record<string, string> | undefined): ExternalIds {
  const out: ExternalIds = {};
  for (const [k, v] of Object.entries(ids ?? {})) {
    const key = k.toLowerCase();
    if (key === 'imdb') out.imdb = v;
    if (key === 'tmdb') out.tmdb = v;
    if (key === 'tvdb') out.tvdb = v;
  }
  return out;
}
