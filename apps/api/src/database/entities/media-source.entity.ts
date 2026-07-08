import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** A configured media server connection (Plex today; Jellyfin/Emby later). */
@Entity('media_source')
export class MediaSource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  /** Provider type key registered in the ProviderRegistry, e.g. 'plex'. */
  @Column()
  type: string;

  @Column()
  baseUrl: string;

  @Column()
  token: string;

  @Column({ default: true })
  enabled: boolean;

  /** Library ids excluded from scanning, as reported by the provider. */
  @Column({ type: 'simple-json', default: '[]' })
  excludedLibraryIds: string[];

  @CreateDateColumn()
  createdAt: Date;
}
