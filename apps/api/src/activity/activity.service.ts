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

  async totalBytesFreed(): Promise<number> {
    const raw = await this.repo
      .createQueryBuilder('a')
      .select('COALESCE(SUM(a.bytesFreed), 0)', 'sum')
      .where('a.dryRun = 0')
      .andWhere("a.type IN ('bin.purged', 'arr.deleted')")
      .getRawOne<{ sum: string }>();
    return Number(raw?.sum ?? 0);
  }
}
