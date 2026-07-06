import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MediaItem } from './media-item.entity';
import { Scan } from './scan.entity';

export type RecommendationStatus =
  | 'open' // suggested, awaiting a decision
  | 'approved' // user approved; files moved to recycle bin (or deleted via *arr)
  | 'dismissed' // user rejected the suggestion for this scan
  | 'restored' // was approved, then restored from the recycle bin
  | 'purged'; // permanently deleted

export interface RecommendationReason {
  ruleKey: string;
  ruleName: string;
  points: number;
  reason: string;
}

/** A cleanup suggestion produced by the rule engine for one media item. */
@Entity('recommendation')
@Index(['scanId', 'status'])
export class Recommendation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  scanId: number;

  @ManyToOne(() => Scan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scanId' })
  scan: Scan;

  @Column()
  mediaItemId: number;

  @ManyToOne(() => MediaItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mediaItemId' })
  mediaItem: MediaItem;

  @Column({ type: 'varchar', default: 'open' })
  status: RecommendationStatus;

  /** Sum of points from all matched rules — higher means stronger candidate. */
  @Column({ type: 'float' })
  totalScore: number;

  @Column({ type: 'simple-json' })
  reasons: RecommendationReason[];

  @Column({ type: 'bigint', default: 0 })
  sizeBytes: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  resolvedAt: Date | null;
}
