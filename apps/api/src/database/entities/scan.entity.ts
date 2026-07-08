import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ScanStatus = 'running' | 'completed' | 'failed';

/** One scan run across all enabled media sources. */
@Entity('scan')
export class Scan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', default: 'running' })
  status: ScanStatus;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;

  @Column({ default: 0 })
  itemCount: number;

  @Column({ type: 'bigint', default: 0 })
  totalSizeBytes: number;

  @Column({ default: 0 })
  recommendationCount: number;

  @Column({ type: 'bigint', default: 0 })
  reclaimableBytes: number;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date | null;
}
