import { Injectable, Logger } from '@nestjs/common';
import { getJson, sendJson } from '../common/http.util';
import { SettingsService } from '../settings/settings.service';
import { MediaItem } from '../database/entities/media-item.entity';
import { ConnectionTestResult } from '../providers/media-server-provider.interface';
import { ArrSettings } from '../settings/settings.types';

interface RadarrMovie {
  id: number;
  title: string;
  monitored: boolean;
  tmdbId?: number;
  imdbId?: string;
}
interface SonarrSeries {
  id: number;
  title: string;
  monitored: boolean;
  tvdbId?: number;
}

/**
 * Radarr/Sonarr integration. On approval we UNMONITOR the entry by default
 * so the *arr will not re-download the files this app moves to the recycle
 * bin — and the entry survives in case the user restores. With the opt-in
 * removeOnApproval setting the entry is deleted from the *arr instead
 * (never its files — those are already in this app's recycle bin).
 */
@Injectable()
export class ArrService {
  private readonly logger = new Logger(ArrService.name);

  constructor(private readonly settings: SettingsService) {}

  private headers(s: ArrSettings): Record<string, string> {
    return { 'X-Api-Key': s.apiKey, Accept: 'application/json' };
  }

  private url(
    s: ArrSettings,
    path: string,
    params: Record<string, string> = {},
  ): string {
    const u = new URL(
      path,
      s.baseUrl.endsWith('/') ? s.baseUrl : s.baseUrl + '/',
    );
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  async testRadarr(): Promise<ConnectionTestResult> {
    return this.testArr(await this.settings.get('radarr'), 'Radarr');
  }

  async testSonarr(): Promise<ConnectionTestResult> {
    return this.testArr(await this.settings.get('sonarr'), 'Sonarr');
  }

  private async testArr(
    s: ArrSettings,
    name: string,
  ): Promise<ConnectionTestResult> {
    if (!s.baseUrl || !s.apiKey)
      return { ok: false, message: `${name} is not configured` };
    try {
      const status = await getJson<{ appName?: string; version?: string }>(
        this.url(s, 'api/v3/system/status'),
        this.headers(s),
        15_000,
      );
      return {
        ok: true,
        message: 'Connected',
        serverName: status.appName,
        version: status.version,
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  /**
   * Unmonitor the *arr entry matching this item, if the integration is
   * enabled and a match exists. Returns a description of what happened for
   * the activity log, or null when nothing applied.
   */
  async unmonitor(item: MediaItem): Promise<string | null> {
    try {
      if (item.type === 'movie') return await this.unmonitorMovie(item);
      return await this.unmonitorSeries(item);
    } catch (err) {
      // Never block a cleanup on an *arr hiccup; surface it in the log instead.
      this.logger.warn(
        `*arr unmonitor failed for "${item.title}": ${(err as Error).message}`,
      );
      return `WARNING: failed to unmonitor in ${item.type === 'movie' ? 'Radarr' : 'Sonarr'}: ${(err as Error).message}`;
    }
  }

  private async unmonitorMovie(item: MediaItem): Promise<string | null> {
    const s = await this.settings.get('radarr');
    if (!s.enabled || !s.baseUrl) return null;
    let movies: RadarrMovie[] = [];
    if (item.externalIds.tmdb) {
      movies = await getJson<RadarrMovie[]>(
        this.url(s, 'api/v3/movie', { tmdbId: item.externalIds.tmdb }),
        this.headers(s),
      );
    }
    const movie = movies[0];
    if (!movie) return null;
    if (s.removeOnApproval) {
      await sendJson(
        'DELETE',
        this.url(s, `api/v3/movie/${movie.id}`, {
          deleteFiles: 'false',
          addImportExclusion: 'false',
        }),
        undefined,
        this.headers(s),
      );
      return `Removed "${movie.title}" from Radarr (re-add it manually if you restore)`;
    }
    if (movie.monitored) {
      await sendJson(
        'PUT',
        this.url(s, `api/v3/movie/${movie.id}`),
        { ...movie, monitored: false },
        this.headers(s),
      );
    }
    return `Unmonitored "${movie.title}" in Radarr (prevents re-download)`;
  }

  private async unmonitorSeries(item: MediaItem): Promise<string | null> {
    const s = await this.settings.get('sonarr');
    if (!s.enabled || !s.baseUrl) return null;
    if (!item.externalIds.tvdb) return null;
    const series = await getJson<SonarrSeries[]>(
      this.url(s, 'api/v3/series', { tvdbId: item.externalIds.tvdb }),
      this.headers(s),
    );
    const match = series[0];
    if (!match) return null;
    if (s.removeOnApproval) {
      await sendJson(
        'DELETE',
        this.url(s, `api/v3/series/${match.id}`, { deleteFiles: 'false' }),
        undefined,
        this.headers(s),
      );
      return `Removed "${match.title}" from Sonarr (re-add it manually if you restore)`;
    }
    if (match.monitored) {
      await sendJson(
        'PUT',
        this.url(s, `api/v3/series/${match.id}`),
        { ...match, monitored: false },
        this.headers(s),
      );
    }
    return `Unmonitored "${match.title}" in Sonarr (prevents re-download)`;
  }
}
