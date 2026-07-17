import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ActivityLog,
  ActivityType,
} from '../database/entities/activity-log.entity';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityLog)
    private readonly repo: Repository<ActivityLog>,
  ) {}

  async log(
    type: ActivityType,
    message: string,
    details: Record<string, unknown> | null = null,
    bytesFreed = 0,
    dryRun = false,
  ): Promise<ActivityLog> {
    return this.repo.save(
      this.repo.create({ type, message, details, bytesFreed, dryRun }),
    );
  }

  async find(opts: {
    type?: ActivityType;
    limit: number;
    offset: number;
  }): Promise<{ items: ActivityLog[]; total: number }> {
    const [items, total] = await this.repo.findAndCount({
      where: opts.type ? { type: opts.type } : {},
      order: { id: 'DESC' },
      take: opts.limit,
      skip: opts.offset,
    });
    return { items, total };
  }

  /**
   * Bytes actually freed (never dry-run), split into media purges and
   * maintenance cleanups (server cache purges), optionally from a start date.
   */
  async bytesFreed(
    since?: Date,
  ): Promise<{ media: number; maintenance: number; total: number }> {
    const qb = this.repo
      .createQueryBuilder('a')
      .select(
        "COALESCE(SUM(CASE WHEN a.type = 'maintenance.cache-purged' THEN a.bytesFreed ELSE 0 END), 0)",
        'maintenance',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN a.type != 'maintenance.cache-purged' THEN a.bytesFreed ELSE 0 END), 0)",
        'media',
      )
      .where('a.dryRun = 0')
      .andWhere(
        "a.type IN ('bin.purged', 'arr.deleted', 'maintenance.cache-purged')",
      );
    if (since) qb.andWhere('a.createdAt >= :since', { since });
    const raw = await qb.getRawOne<{ media: string; maintenance: string }>();
    const media = Number(raw?.media ?? 0);
    const maintenance = Number(raw?.maintenance ?? 0);
    return { media, maintenance, total: media + maintenance };
  }
}
