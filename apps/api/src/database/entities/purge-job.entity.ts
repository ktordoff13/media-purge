import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PurgeJobStatus =
  'queued' | 'processing' | 'done' | 'failed' | 'canceled';

/**
 * A queued recommendation approval. Approvals run server-side one at a time
 * (file moves can take minutes), so the queue survives closed browser tabs
 * and container restarts.
 */
@Entity('purge_job')
@Index(['status'])
export class PurgeJob {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  recommendationId: number;

  @Column()
  title: string;

  @Column({ type: 'varchar', default: 'queued' })
  status: PurgeJobStatus;

  /** Result or error message once the job finished. */
  @Column({ type: 'varchar', nullable: true })
  message: string | null;

  @Column({ default: false })
  dryRun: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date | null;
}
