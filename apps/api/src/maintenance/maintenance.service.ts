import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
import { MediaSource } from '../database/entities/media-source.entity';
import { SettingsService } from '../settings/settings.service';
import { ActivityService } from '../activity/activity.service';
import { getJson, sendJson } from '../common/http.util';
import { gb } from '../rules/rule.interface';

export interface MaintenanceOperation {
  key: string;
  name: string;
  description: string;
  /** True when the op deletes files from a mounted appdata dir (dry-run aware). */
  filesystem: boolean;
  available: boolean;
  unavailableReason?: string;
}

interface JfTask {
  Id: string;
  Key: string;
  Name: string;
}

const PLEX_PHOTO_TRANSCODER = 'Cache/PhotoTranscoder';

/**
 * ImageMaid-style server maintenance: shrink the media server's appdata by
 * clearing regenerable image caches and triggering the server's own
 * housekeeping tasks. API-based ops need no filesystem access; cache purges
 * need the server's appdata dir mounted and configured in Settings.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    @InjectRepository(MediaSource) private readonly sources: Repository<MediaSource>,
    private readonly settings: SettingsService,
    private readonly activity: ActivityService,
  ) {}

  async operations(sourceId: number): Promise<MaintenanceOperation[]> {
    const source = await this.mustFind(sourceId);
    const appdata = (await this.settings.get('maintenance')).appdataPaths[String(sourceId)];
    const needsAppdata = (op: Omit<MaintenanceOperation, 'available' | 'unavailableReason'>) => ({
      ...op,
      available: !!appdata,
      unavailableReason: appdata
        ? undefined
        : 'Set this source’s appdata path in Settings → Maintenance to enable.',
    });

    if (source.type === 'plex') {
      return [
        needsAppdata({
          key: 'photo-transcoder-cache',
          name: 'Purge PhotoTranscoder cache',
          description:
            'Deletes Cache/PhotoTranscoder — regenerated thumbnails/posters that routinely bloat to tens or hundreds of GB. Plex rebuilds what it needs.',
          filesystem: true,
        }),
        { key: 'clean-bundles', name: 'Clean bundles', description: 'Asks Plex to delete orphaned metadata bundles (posters, art, extras of removed items).', filesystem: false, available: true },
        { key: 'optimize-db', name: 'Optimize database', description: 'Runs Plex’s built-in database optimization/vacuum.', filesystem: false, available: true },
        { key: 'empty-trash', name: 'Empty trash', description: 'Empties the trash in every library section.', filesystem: false, available: true },
      ];
    }
    // Jellyfin: everything runs through its own scheduled-tasks API.
    return [
      { key: 'clean-cache', name: 'Clean cache', description: 'Runs Jellyfin’s "Clean Cache Directory" task (transcoded images, temp metadata).', filesystem: false, available: true },
      { key: 'clean-transcodes', name: 'Clean transcode directory', description: 'Runs Jellyfin’s "Clean Transcode Directory" task.', filesystem: false, available: true },
      { key: 'optimize-db', name: 'Optimize database', description: 'Runs Jellyfin’s database optimization/vacuum task.', filesystem: false, available: true },
    ];
  }

  async run(sourceId: number, operation: string): Promise<{ message: string; bytesFreed: number; dryRun: boolean }> {
    const source = await this.mustFind(sourceId);
    const ops = await this.operations(sourceId);
    const op = ops.find((o) => o.key === operation);
    if (!op) throw new BadRequestException(`Unknown operation '${operation}' for ${source.type}`);
    if (!op.available) throw new BadRequestException(op.unavailableReason);

    if (source.type === 'plex') return this.runPlex(source, operation);
    return this.runJellyfin(source, operation);
  }

  private async runPlex(source: MediaSource, operation: string) {
    const token = `X-Plex-Token=${encodeURIComponent(source.token)}`;
    const base = source.baseUrl.replace(/\/$/, '');
    switch (operation) {
      case 'photo-transcoder-cache': {
        const appdata = (await this.settings.get('maintenance')).appdataPaths[String(source.id)];
        return this.purgeDirectory(source, path.join(appdata, PLEX_PHOTO_TRANSCODER), 'PhotoTranscoder cache');
      }
      case 'clean-bundles':
        await sendJson('PUT', `${base}/library/clean/bundles?${token}`, undefined);
        return this.logApiOp(source, 'Triggered Plex "Clean Bundles"');
      case 'optimize-db':
        await sendJson('PUT', `${base}/library/optimize?${token}`, undefined);
        return this.logApiOp(source, 'Triggered Plex "Optimize Database"');
      case 'empty-trash': {
        const libs = await getJson<{ MediaContainer: { Directory?: { key: string }[] } }>(
          `${base}/library/sections?${token}`,
          { Accept: 'application/json' },
        );
        for (const dir of libs.MediaContainer.Directory ?? []) {
          await sendJson('PUT', `${base}/library/sections/${dir.key}/emptyTrash?${token}`, undefined);
        }
        return this.logApiOp(source, 'Emptied trash in all Plex libraries');
      }
      default:
        throw new BadRequestException(`Unhandled Plex operation '${operation}'`);
    }
  }

  private async runJellyfin(source: MediaSource, operation: string) {
    const keyByOp: Record<string, string> = {
      'clean-cache': 'DeleteCacheFiles',
      'clean-transcodes': 'DeleteTranscodeFiles',
      'optimize-db': 'OptimizeDatabase',
    };
    const taskKey = keyByOp[operation];
    if (!taskKey) throw new BadRequestException(`Unhandled Jellyfin operation '${operation}'`);
    const headers = { 'X-Emby-Token': source.token, Accept: 'application/json' };
    const base = source.baseUrl.replace(/\/$/, '');
    const tasks = await getJson<JfTask[]>(`${base}/ScheduledTasks`, headers);
    const task = tasks.find((t) => t.Key === taskKey);
    if (!task) throw new NotFoundException(`Jellyfin scheduled task '${taskKey}' not found on the server`);
    await sendJson('POST', `${base}/ScheduledTasks/Running/${task.Id}`, undefined, headers);
    return this.logApiOp(source, `Triggered Jellyfin "${task.Name}" task`);
  }

  /** Delete every entry inside dir (never dir itself). Honors dry-run. */
  private async purgeDirectory(source: MediaSource, dir: string, label: string) {
    let stat;
    try {
      stat = await fs.stat(dir);
    } catch {
      throw new BadRequestException(
        `${dir} is not reachable from this container — check the appdata path in Settings → Maintenance and your volume mounts.`,
      );
    }
    if (!stat.isDirectory()) throw new BadRequestException(`${dir} is not a directory`);

    const bytes = await this.directorySize(dir);
    const { dryRun } = await this.settings.get('general');
    if (dryRun) {
      await this.activity.log(
        'maintenance.cache-purged',
        `[DRY RUN] Would purge ${label} on ${source.name} — ${gb(bytes)}`,
        { sourceId: source.id, dir, bytes },
        0,
        true,
      );
      return { message: `Dry run: would free ${gb(bytes)} from ${label}.`, bytesFreed: 0, dryRun: true };
    }

    for (const entry of await fs.readdir(dir)) {
      await fs.rm(path.join(dir, entry), { recursive: true, force: true });
    }
    await this.activity.log(
      'maintenance.cache-purged',
      `Purged ${label} on ${source.name} — freed ${gb(bytes)}`,
      { sourceId: source.id, dir },
      bytes,
    );
    return { message: `Freed ${gb(bytes)} from ${label}.`, bytesFreed: bytes, dryRun: false };
  }

  private async logApiOp(source: MediaSource, message: string) {
    await this.activity.log('maintenance.task-run', `${message} on ${source.name}`, {
      sourceId: source.id,
    });
    return { message, bytesFreed: 0, dryRun: false };
  }

  private async directorySize(dir: string): Promise<number> {
    let total = 0;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) total += await this.directorySize(full);
      else if (entry.isFile()) total += (await fs.stat(full)).size;
    }
    return total;
  }

  private async mustFind(id: number): Promise<MediaSource> {
    const source = await this.sources.findOneBy({ id });
    if (!source) throw new NotFoundException(`Media source ${id} not found`);
    return source;
  }
}
