import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Recommendation } from '../database/entities/recommendation.entity';
import {
  MovedFile,
  RecycleBinEntry,
} from '../database/entities/recycle-bin-entry.entity';
import { SettingsService } from '../settings/settings.service';
import { ActivityService } from '../activity/activity.service';
import { ArrService } from '../arr/arr.service';
import { gb } from '../rules/rule.interface';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @InjectRepository(Recommendation)
    private readonly recs: Repository<Recommendation>,
    @InjectRepository(RecycleBinEntry)
    private readonly bin: Repository<RecycleBinEntry>,
    private readonly settings: SettingsService,
    private readonly activity: ActivityService,
    private readonly arr: ArrService,
  ) {}

  /**
   * Approve a recommendation: unmonitor in Radarr/Sonarr (when configured),
   * then move the item's files into the recycle bin. In dry-run mode nothing
   * is touched — the would-be actions are logged and the recommendation
   * stays open.
   */
  async approve(
    recommendationId: number,
  ): Promise<{ dryRun: boolean; message: string }> {
    // The file move can take minutes across filesystems; a second approve for
    // the same recommendation meanwhile would copy the files again.
    if (this.approving.has(recommendationId)) {
      throw new ConflictException(
        `Recommendation ${recommendationId} is already being processed — the files are on their way to the recycle bin`,
      );
    }
    this.approving.add(recommendationId);
    try {
      return await this.doApprove(recommendationId);
    } finally {
      this.approving.delete(recommendationId);
    }
  }

  private readonly approving = new Set<number>();

  private async doApprove(
    recommendationId: number,
  ): Promise<{ dryRun: boolean; message: string }> {
    const rec = await this.recs.findOne({
      where: { id: recommendationId },
      relations: { mediaItem: true },
    });
    if (!rec)
      throw new NotFoundException(
        `Recommendation ${recommendationId} not found`,
      );
    if (rec.status !== 'open') {
      throw new BadRequestException(
        `Recommendation ${recommendationId} is already ${rec.status}`,
      );
    }

    const general = await this.settings.get('general');
    const mappings = await this.settings.get('pathMappings');
    const item = rec.mediaItem;
    const localPaths = item.filePaths.map((p) =>
      this.settings.translatePath(p, mappings),
    );

    if (general.dryRun) {
      await this.activity.log(
        'recommendation.approved',
        `[DRY RUN] Would move "${item.title}" (${gb(Number(item.sizeBytes))}, ${localPaths.length} files) to the recycle bin`,
        {
          recommendationId: rec.id,
          title: item.title,
          paths: localPaths,
          reasons: rec.reasons,
        },
        0,
        true,
      );
      return {
        dryRun: true,
        message: `Dry run: would move ${localPaths.length} file(s) to the recycle bin. Disable dry-run in Settings to act for real.`,
      };
    }

    const missing: string[] = [];
    for (const p of localPaths) {
      try {
        await fs.access(p);
      } catch {
        missing.push(p);
      }
    }
    if (missing.length === localPaths.length && localPaths.length > 0) {
      throw new BadRequestException(
        `None of the item's files are reachable from this container (checked ${missing[0]}). ` +
          'Check your path mappings in Settings and that the media share is mounted.',
      );
    }

    const arrNote = await this.arr.unmonitor(item);

    const dir = path.join(
      general.recycleBinDir,
      `${rec.id}-${item.title.replace(/[^\w.-]+/g, '_').slice(0, 60)}`,
    );
    await fs.mkdir(dir, { recursive: true });
    const moved: MovedFile[] = [];
    for (const p of localPaths) {
      if (missing.includes(p)) continue;
      const target = await this.uniquePath(path.join(dir, path.basename(p)));
      await this.moveFile(p, target);
      moved.push({ originalPath: p, binPath: target });
    }

    const purgeAfter = new Date(
      Date.now() + general.retentionDays * 86_400_000,
    );
    const entry = await this.bin.save(
      this.bin.create({
        recommendationId: rec.id,
        title: item.title,
        files: moved,
        sizeBytes: item.sizeBytes,
        purgeAfter,
      }),
    );
    await this.recs.update(rec.id, {
      status: 'approved',
      resolvedAt: new Date(),
    });
    await this.activity.log(
      'bin.moved',
      `Moved "${item.title}" (${gb(Number(item.sizeBytes))}, ${moved.length} files) to the recycle bin — purges ${purgeAfter.toISOString().slice(0, 10)}`,
      {
        recommendationId: rec.id,
        binEntryId: entry.id,
        title: item.title,
        files: moved,
        reasons: rec.reasons,
        skippedMissing: missing,
        arrNote,
      },
    );
    return {
      dryRun: false,
      message: `Moved ${moved.length} file(s) to the recycle bin.${arrNote ? ' ' + arrNote : ''}`,
    };
  }

  async dismiss(recommendationId: number): Promise<void> {
    const rec = await this.recs.findOne({
      where: { id: recommendationId },
      relations: { mediaItem: true },
    });
    if (!rec)
      throw new NotFoundException(
        `Recommendation ${recommendationId} not found`,
      );
    if (rec.status !== 'open') {
      throw new BadRequestException(
        `Recommendation ${recommendationId} is already ${rec.status}`,
      );
    }
    await this.recs.update(rec.id, {
      status: 'dismissed',
      resolvedAt: new Date(),
    });
    await this.activity.log(
      'recommendation.dismissed',
      `Dismissed suggestion for "${rec.mediaItem.title}"`,
      {
        recommendationId: rec.id,
      },
    );
  }

  async restore(binEntryId: number): Promise<void> {
    const entry = await this.mustFindBinned(binEntryId);
    for (const f of entry.files) {
      await fs.mkdir(path.dirname(f.originalPath), { recursive: true });
      await this.moveFile(f.binPath, f.originalPath);
    }
    await this.cleanupEmptyDir(entry);
    await this.bin.update(entry.id, {
      status: 'restored',
      resolvedAt: new Date(),
    });
    await this.recs.update(entry.recommendationId, {
      status: 'restored',
      resolvedAt: new Date(),
    });
    await this.activity.log(
      'bin.restored',
      `Restored "${entry.title}" (${entry.files.length} files) from the recycle bin`,
      { binEntryId: entry.id, files: entry.files },
    );
  }

  async purge(binEntryId: number): Promise<void> {
    const entry = await this.mustFindBinned(binEntryId);
    await this.purgeEntry(entry);
  }

  /** Hourly retention job: permanently delete bin entries past their date. */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpired(): Promise<void> {
    const due = await this.bin
      .createQueryBuilder('b')
      .where("b.status = 'binned'")
      .andWhere('b.purgeAfter <= :now', { now: new Date().toISOString() })
      .getMany();
    for (const entry of due) {
      try {
        await this.purgeEntry(entry);
      } catch (err) {
        this.logger.error(
          `Retention purge failed for bin entry ${entry.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  private async purgeEntry(entry: RecycleBinEntry): Promise<void> {
    for (const f of entry.files) {
      await fs.rm(f.binPath, { force: true });
    }
    await this.cleanupEmptyDir(entry);
    await this.bin.update(entry.id, {
      status: 'purged',
      resolvedAt: new Date(),
    });
    await this.recs.update(entry.recommendationId, {
      status: 'purged',
      resolvedAt: new Date(),
    });
    await this.activity.log(
      'bin.purged',
      `Permanently deleted "${entry.title}" — freed ${gb(Number(entry.sizeBytes))}`,
      { binEntryId: entry.id, files: entry.files.map((f) => f.originalPath) },
      Number(entry.sizeBytes),
    );
  }

  async listBin(): Promise<RecycleBinEntry[]> {
    return this.bin.find({ order: { id: 'DESC' } });
  }

  private async mustFindBinned(id: number): Promise<RecycleBinEntry> {
    const entry = await this.bin.findOneBy({ id });
    if (!entry)
      throw new NotFoundException(`Recycle bin entry ${id} not found`);
    if (entry.status !== 'binned') {
      throw new BadRequestException(
        `Recycle bin entry ${id} is already ${entry.status}`,
      );
    }
    return entry;
  }

  /** rename() when possible, copy+delete across filesystems (EXDEV). */
  private async moveFile(from: string, to: string): Promise<void> {
    try {
      await fs.rename(from, to);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
      await fs.copyFile(from, to);
      await fs.rm(from, { force: true });
    }
  }

  private async uniquePath(target: string): Promise<string> {
    let candidate = target;
    for (let i = 1; ; i++) {
      try {
        await fs.access(candidate);
        const ext = path.extname(target);
        candidate = target.slice(0, target.length - ext.length) + `.${i}` + ext;
      } catch {
        return candidate;
      }
    }
  }

  private async cleanupEmptyDir(entry: RecycleBinEntry): Promise<void> {
    const dirs = new Set(entry.files.map((f) => path.dirname(f.binPath)));
    for (const dir of dirs) {
      try {
        await fs.rmdir(dir);
      } catch {
        // not empty or already gone — fine
      }
    }
  }
}
