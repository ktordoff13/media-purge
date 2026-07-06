import { ExternalIds, MediaType } from '../database/entities/media-item.entity';
import { MediaSource } from '../database/entities/media-source.entity';

/**
 * What a provider can tell us about media. Rules that need a missing
 * capability disable themselves instead of producing garbage suggestions.
 */
export interface ProviderCapabilities {
  /** Play stats are aggregated across every server user, not just the owner. */
  perUserHistory: boolean;
  /** Partial watch progress (0..1) is available. */
  watchProgress: boolean;
  /** Items can carry user labels/tags usable as a keep-list. */
  labels: boolean;
  /** An item can have multiple file versions (duplicates detectable). */
  multiVersion: boolean;
}

export interface RemoteLibrary {
  id: string;
  name: string;
  mediaType: MediaType;
}

/**
 * Provider-neutral item as fetched from a media server. Mirrors the
 * MediaItem entity minus scan bookkeeping. Providers must do their own
 * cross-user aggregation (playCount = total plays by anyone, lastPlayedAt =
 * most recent by anyone) when they support perUserHistory.
 */
export interface RemoteMediaItem {
  providerItemId: string;
  libraryId: string;
  libraryName: string;
  type: MediaType;
  title: string;
  year: number | null;
  addedAt: Date | null;
  lastPlayedAt: Date | null;
  playCount: number;
  watchProgress: number | null;
  ratingCritic: number | null;
  ratingAudience: number | null;
  filePaths: string[];
  sizeBytes: number;
  resolution: string | null;
  versionCount: number;
  externalIds: ExternalIds;
  labels: string[];
  seriesStatus: 'ended' | 'continuing' | null;
  episodeCount: number | null;
  watchedEpisodeCount: number | null;
  lastEpisodeAddedAt: Date | null;
  thumbPath: string | null;
  providerData: Record<string, unknown> | null;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  serverName?: string;
  version?: string;
}

/**
 * Contract every media server integration implements. Nothing outside the
 * provider layer may know which server it is talking to.
 */
export interface MediaServerProvider {
  /** Registry key, e.g. 'plex' or 'jellyfin'. Stored on MediaSource.type. */
  readonly type: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;

  testConnection(source: MediaSource): Promise<ConnectionTestResult>;
  listLibraries(source: MediaSource): Promise<RemoteLibrary[]>;
  fetchItems(source: MediaSource, library: RemoteLibrary): Promise<RemoteMediaItem[]>;
  /** Absolute URL for an item's poster image, for the API's image proxy. */
  imageUrl(source: MediaSource, thumbPath: string): string | null;
}

/**
 * Optional play-history enricher (e.g. Tautulli for Plex). Never required:
 * scans must produce sane results from the MediaServerProvider alone.
 */
export interface StatsProvider {
  readonly type: string;
  testConnection(): Promise<ConnectionTestResult>;
  /** Mutates items in place with richer history where available. */
  enrich(source: MediaSource, items: RemoteMediaItem[]): Promise<void>;
}
