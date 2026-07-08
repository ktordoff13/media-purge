import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Scan } from './scan.entity';
import { MediaSource } from './media-source.entity';

export type MediaType = 'movie' | 'show';

export interface ExternalIds {
  imdb?: string;
  tmdb?: string;
  tvdb?: string;
}

/**
 * Provider-neutral snapshot of a library item, captured per scan.
 * Provider-specific extras belong in providerData, never in typed columns.
 */
@Entity('media_item')
@Index(['scanId'])
@Index(['sourceId', 'providerItemId'])
export class MediaItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  scanId: number;

  @ManyToOne(() => Scan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scanId' })
  scan: Scan;

  @Column()
  sourceId: number;

  @ManyToOne(() => MediaSource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceId' })
  source: MediaSource;

  /** The item's id on the provider (Plex ratingKey, Jellyfin item id, ...). */
  @Column()
  providerItemId: string;

  @Column()
  libraryId: string;

  @Column()
  libraryName: string;

  @Column({ type: 'varchar' })
  type: MediaType;

  @Column()
  title: string;

  @Column({ type: 'int', nullable: true })
  year: number | null;

  @Column({ type: 'datetime', nullable: true })
  addedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastPlayedAt: Date | null;

  /** Play count across all users when the stats source supports it. */
  @Column({ default: 0 })
  playCount: number;

  @Column({ type: 'float', nullable: true })
  ratingCritic: number | null;

  @Column({ type: 'float', nullable: true })
  ratingAudience: number | null;

  /** All file paths as the media server reports them (its own path namespace). */
  @Column({ type: 'simple-json', default: '[]' })
  filePaths: string[];

  @Column({ type: 'bigint', default: 0 })
  sizeBytes: number;

  /** Highest available video resolution: '4k' | '1080' | '720' | 'sd'. */
  @Column({ type: 'varchar', nullable: true })
  resolution: string | null;

  /** Number of distinct media versions (duplicate copies) of this item. */
  @Column({ default: 1 })
  versionCount: number;

  @Column({ type: 'simple-json', default: '{}' })
  externalIds: ExternalIds;

  @Column({ type: 'simple-json', default: '[]' })
  labels: string[];

  /** Shows only. */
  @Column({ type: 'varchar', nullable: true })
  seriesStatus: 'ended' | 'continuing' | null;

  @Column({ type: 'int', nullable: true })
  episodeCount: number | null;

  @Column({ type: 'int', nullable: true })
  watchedEpisodeCount: number | null;

  @Column({ type: 'datetime', nullable: true })
  lastEpisodeAddedAt: Date | null;

  /** Poster/thumb URL path on the provider, proxied by the API for the UI. */
  @Column({ type: 'varchar', nullable: true })
  thumbPath: string | null;

  @Column({ type: 'simple-json', nullable: true })
  providerData: Record<string, unknown> | null;
}
