import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PurgeJob } from '../database/entities/purge-job.entity';
import { Recommendation } from '../database/entities/recommendation.entity';
import { CleanupService } from './cleanup.service';

export interface PurgeQueueState {
  /** True while jobs are queued or being processed. */
  active: boolean;
  /** Size of the current batch (resets when the queue drains). */
  total: number;
  done: number;
  failed: number;
  dryRun: number;
  current: { recommendationId: number; title: string } | null;
  /** Recommendation ids queued or in flight — the UI disables those rows. */
  pendingIds: number[];
  /** Message of the most recent failure in this batch, if any. */
  lastError: string | null;
}

/**
 * Server-side approval queue. Jobs are persisted so a purge batch survives
 * closed browser tabs and container restarts; they are processed strictly
 * one at a time because each may be a minutes-long file move.
 */
@Injectable()
export class PurgeJobsService implements OnModuleInit {
  private readonly logger = new Logger(PurgeJobsService.name);

  // Batch counters for progress display. A "batch" starts when jobs are
  // enqueued on an idle queue and ends when the queue drains.
  private total = 0;
  private done = 0;
  private failed = 0;
  private dryRun = 0;
  private lastError: string | null = null;
  private current: { recommendationId: number; title: string } | null = null;
  private draining = false;

  constructor(
    @InjectRepository(PurgeJob)
    private readonly jobs: Repository<PurgeJob>,
    @InjectRepository(Recommendation)
    private readonly recs: Repository<Recommendation>,
    private readonly cleanup: CleanupService,
  ) {}

  /** Resume work interrupted by a restart. */
  async onModuleInit(): Promise<void> {
    const interrupted = await this.jobs.update(
      { status: 'processing' },
      { status: 'queued' },
    );
    const pending = await this.jobs.countBy({ status: 'queued' });
    if (pending > 0) {
      this.logger.log(
        `Resuming purge queue: ${pending} job(s) pending` +
          (interrupted.affected
            ? ` (${interrupted.affected} interrupted)`
            : ''),
      );
      this.total = pending;
      void this.drain();
    }
  }

  async enqueue(recommendationIds: number[]): Promise<PurgeQueueState> {
    const pending = await this.jobs.find({
      where: { status: In(['queued', 'processing']) },
    });
    const pendingRecIds = new Set(pending.map((j) => j.recommendationId));
    const freshIds = [...new Set(recommendationIds)].filter(
      (id) => !pendingRecIds.has(id),
    );

    if (freshIds.length) {
      const recs = await this.recs.find({
        where: { id: In(freshIds), status: 'open' },
        relations: { mediaItem: true },
      });
      if (recs.length) {
        await this.jobs.save(
          recs.map((r) =>
            this.jobs.create({
              recommendationId: r.id,
              title: r.mediaItem.title,
            }),
          ),
        );
        if (this.draining) {
          this.total += recs.length;
        } else {
          this.total = recs.length;
          this.done = 0;
          this.failed = 0;
          this.dryRun = 0;
          this.lastError = null;
          void this.drain();
        }
      }
    }
    return this.state();
  }

  /**
   * Drop all still-queued jobs. The job currently moving files (if any)
   * cannot be aborted safely mid-move and is left to finish.
   */
  async cancel(): Promise<PurgeQueueState> {
    const res = await this.jobs.update(
      { status: 'queued' },
      {
        status: 'canceled',
        message: 'Canceled by user',
        finishedAt: new Date(),
      },
    );
    if (res.affected) {
      // Shrink the batch so the progress bar completes at the right place.
      this.total = Math.max(
        this.done + (this.current ? 1 : 0),
        this.total - res.affected,
      );
      this.logger.log(`Purge queue canceled: ${res.affected} job(s) dropped`);
    }
    return this.state();
  }

  async state(): Promise<PurgeQueueState> {
    const pending = await this.jobs.find({
      where: { status: In(['queued', 'processing']) },
      order: { id: 'ASC' },
    });
    return {
      active: this.draining || pending.length > 0,
      total: this.total,
      done: this.done,
      failed: this.failed,
      dryRun: this.dryRun,
      current: this.current,
      pendingIds: pending.map((j) => j.recommendationId),
      lastError: this.lastError,
    };
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      for (;;) {
        const job = await this.jobs.findOne({
          where: { status: 'queued' },
          order: { id: 'ASC' },
        });
        if (!job) break;
        this.current = {
          recommendationId: job.recommendationId,
          title: job.title,
        };
        await this.jobs.update(job.id, { status: 'processing' });
        try {
          const res = await this.cleanup.approve(job.recommendationId);
          if (res.dryRun) this.dryRun++;
          await this.jobs.update(job.id, {
            status: 'done',
            message: res.message,
            dryRun: res.dryRun,
            finishedAt: new Date(),
          });
        } catch (err) {
          const message = (err as Error).message;
          this.failed++;
          this.lastError = `"${job.title}": ${message}`;
          this.logger.warn(`Purge job for "${job.title}" failed: ${message}`);
          await this.jobs.update(job.id, {
            status: 'failed',
            message,
            finishedAt: new Date(),
          });
        }
        this.done++;
      }
    } finally {
      this.current = null;
      this.draining = false;
    }
  }
}
