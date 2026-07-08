import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ActivityType =
  | 'scan.started'
  | 'scan.completed'
  | 'scan.failed'
  | 'recommendation.created'
  | 'recommendation.approved'
  | 'recommendation.dismissed'
  | 'item.protected'
  | 'item.unprotected'
  | 'bin.moved'
  | 'bin.restored'
  | 'bin.purged'
  | 'arr.deleted'
  | 'ai.advised'
  | 'maintenance.cache-purged'
  | 'maintenance.task-run'
  | 'settings.updated';

/** Append-only audit trail: what happened, when, why, and bytes involved. */
@Entity('activity_log')
@Index(['type'])
export class ActivityLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  type: ActivityType;

  /** Human-readable one-liner, e.g. 'Deleted "Movie (2019)" — 14.2 GB'. */
  @Column()
  message: string;

  /** Structured context: item title, rule reasons, paths, ids. */
  @Column({ type: 'simple-json', nullable: true })
  details: Record<string, unknown> | null;

  @Column({ type: 'bigint', default: 0 })
  bytesFreed: number;

  /** True when the action was simulated because dry-run mode was on. */
  @Column({ default: false })
  dryRun: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
