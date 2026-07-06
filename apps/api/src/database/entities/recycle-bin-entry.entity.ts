import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Recommendation } from './recommendation.entity';

export type RecycleBinStatus = 'binned' | 'restored' | 'purged';

export interface MovedFile {
  /** Absolute path where the file lived, in this container's namespace. */
  originalPath: string;
  /** Absolute path inside the recycle bin directory. */
  binPath: string;
}

/** Files moved to the recycle bin, pending purge after the retention window. */
@Entity('recycle_bin_entry')
@Index(['status'])
export class RecycleBinEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  recommendationId: number;

  @ManyToOne(() => Recommendation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recommendationId' })
  recommendation: Recommendation;

  @Column()
  title: string;

  @Column({ type: 'simple-json' })
  files: MovedFile[];

  @Column({ type: 'bigint', default: 0 })
  sizeBytes: number;

  @Column({ type: 'varchar', default: 'binned' })
  status: RecycleBinStatus;

  @CreateDateColumn()
  movedAt: Date;

  @Column({ type: 'datetime' })
  purgeAfter: Date;

  @Column({ type: 'datetime', nullable: true })
  resolvedAt: Date | null;
}
