import { Controller, Get, Logger, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Scan } from '../database/entities/scan.entity';
import { MediaItem } from '../database/entities/media-item.entity';
import { MediaSource } from '../database/entities/media-source.entity';
import { Recommendation } from '../database/entities/recommendation.entity';
import { RecycleBinEntry } from '../database/entities/recycle-bin-entry.entity';
import { ActivityService } from '../activity/activity.service';
import { SettingsService } from '../settings/settings.service';

class LibraryStatDto {
  @ApiProperty() libraryName: string;
  @ApiProperty() itemCount: number;
  @ApiProperty() sizeBytes: number;
  @ApiProperty({
    description: 'Bytes flagged by open recommendations in this library.',
  })
  reclaimableBytes: number;
  @ApiProperty() openRecommendations: number;
}

class SetupStatusDto {
  @ApiProperty({ description: 'Configured media sources.' }) sources: number;
  @ApiProperty({ description: 'Completed scans so far.' })
  completedScans: number;
  @ApiProperty({ description: 'Configured path mappings.' })
  pathMappings: number;
  @ApiProperty({ description: 'Radarr has a URL and API key saved.' })
  radarrConfigured: boolean;
  @ApiProperty({ description: 'Sonarr has a URL and API key saved.' })
  sonarrConfigured: boolean;
  @ApiProperty() radarrEnabled: boolean;
  @ApiProperty() sonarrEnabled: boolean;
  @ApiProperty() dryRun: boolean;
  @ApiProperty({ nullable: true, type: String }) scanCron: string | null;
  @ApiProperty() aiEnabled: boolean;
}

class DashboardDto {
  @ApiProperty({ nullable: true }) lastScan: Scan | null;
  @ApiProperty() openRecommendations: number;
  @ApiProperty({
    description: 'Bytes reclaimable if all open recommendations were approved.',
  })
  reclaimableBytes: number;
  @ApiProperty({
    description:
      'Bytes actually freed (media purges + maintenance cleanups) since the counter was last reset.',
  })
  spaceSavedBytes: number;
  @ApiProperty({ description: 'Portion freed by purged media.' })
  spaceSavedMediaBytes: number;
  @ApiProperty({
    description: 'Portion freed by maintenance cleanups (server caches).',
  })
  spaceSavedMaintenanceBytes: number;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'ISO date the reclaimed counter accumulates from; null = all time.',
  })
  spaceSavedSince: string | null;
  @ApiProperty({
    description:
      'Bytes sitting in the recycle bin awaiting the retention window.',
  })
  binPendingBytes: number;
  @ApiProperty({ type: [LibraryStatDto] }) libraries: LibraryStatDto[];
}

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(
    @InjectRepository(Scan) private readonly scans: Repository<Scan>,
    @InjectRepository(MediaItem) private readonly items: Repository<MediaItem>,
    @InjectRepository(MediaSource)
    private readonly sources: Repository<MediaSource>,
    @InjectRepository(Recommendation)
    private readonly recs: Repository<Recommendation>,
    @InjectRepository(RecycleBinEntry)
    private readonly bin: Repository<RecycleBinEntry>,
    private readonly activity: ActivityService,
    private readonly settings: SettingsService,
  ) {}

  private readonly logger = new Logger(StatsController.name);

  @Get('setup')
  @ApiOperation({
    summary: 'Setup progress for the first-run checklist',
    description:
      'What is configured so far — the UI uses this to guide new installs through source, path-mapping, *arr, and first-scan setup.',
  })
  @ApiOkResponse({ type: SetupStatusDto })
  async setup(): Promise<SetupStatusDto> {
    const [sources, completedScans, general, mappings, radarr, sonarr, ai] =
      await Promise.all([
        this.sources.count(),
        this.scans.countBy({ status: 'completed' }),
        this.settings.get('general'),
        this.settings.get('pathMappings'),
        this.settings.get('radarr'),
        this.settings.get('sonarr'),
        this.settings.get('ai'),
      ]);
    return {
      sources,
      completedScans,
      pathMappings: mappings.length,
      radarrConfigured: !!(radarr.baseUrl && radarr.apiKey),
      sonarrConfigured: !!(sonarr.baseUrl && sonarr.apiKey),
      radarrEnabled: radarr.enabled,
      sonarrEnabled: sonarr.enabled,
      dryRun: general.dryRun,
      scanCron: general.scanCron,
      aiEnabled: ai.enabled,
    };
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Aggregate numbers for the dashboard' })
  @ApiOkResponse({ type: DashboardDto })
  async dashboard(): Promise<DashboardDto> {
    const lastScan = await this.scans.findOne({
      where: {},
      order: { id: 'DESC' },
    });
    let openRecommendations = 0;
    let reclaimableBytes = 0;
    let libraries: LibraryStatDto[] = [];
    if (lastScan) {
      const open = await this.recs
        .createQueryBuilder('r')
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(r.sizeBytes), 0)', 'bytes')
        .where('r.scanId = :id AND r.status = :status', {
          id: lastScan.id,
          status: 'open',
        })
        .getRawOne<{ count: string; bytes: string }>();
      openRecommendations = Number(open?.count ?? 0);
      reclaimableBytes = Number(open?.bytes ?? 0);
      const openByLibrary = new Map(
        (
          await this.recs
            .createQueryBuilder('r')
            .innerJoin('r.mediaItem', 'mi')
            .select('mi.libraryName', 'libraryName')
            .addSelect('COUNT(*)', 'count')
            .addSelect('COALESCE(SUM(r.sizeBytes), 0)', 'bytes')
            .where('r.scanId = :id AND r.status = :status', {
              id: lastScan.id,
              status: 'open',
            })
            .groupBy('mi.libraryName')
            .getRawMany<{ libraryName: string; count: string; bytes: string }>()
        ).map((row) => [
          row.libraryName,
          { count: Number(row.count), bytes: Number(row.bytes) },
        ]),
      );
      libraries = (
        await this.items
          .createQueryBuilder('i')
          .select('i.libraryName', 'libraryName')
          .addSelect('COUNT(*)', 'itemCount')
          .addSelect('COALESCE(SUM(i.sizeBytes), 0)', 'sizeBytes')
          .where('i.scanId = :id', { id: lastScan.id })
          .groupBy('i.libraryName')
          .orderBy('sizeBytes', 'DESC')
          .getRawMany<{
            libraryName: string;
            itemCount: string;
            sizeBytes: string;
          }>()
      ).map((row) => ({
        libraryName: row.libraryName,
        itemCount: Number(row.itemCount),
        sizeBytes: Number(row.sizeBytes),
        reclaimableBytes: openByLibrary.get(row.libraryName)?.bytes ?? 0,
        openRecommendations: openByLibrary.get(row.libraryName)?.count ?? 0,
      }));
    }
    const counters = await this.settings.get('counters');
    const since = counters.reclaimedSince
      ? new Date(counters.reclaimedSince)
      : undefined;
    const freed = await this.activity.bytesFreed(since);
    const binPending = await this.bin
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.sizeBytes), 0)', 'bytes')
      .where("b.status = 'binned'")
      .getRawOne<{ bytes: string }>();

    return {
      lastScan,
      openRecommendations,
      reclaimableBytes,
      spaceSavedBytes: freed.total,
      spaceSavedMediaBytes: freed.media,
      spaceSavedMaintenanceBytes: freed.maintenance,
      spaceSavedSince: counters.reclaimedSince,
      binPendingBytes: Number(binPending?.bytes ?? 0),
      libraries,
    };
  }

  @Post('reclaimed/reset')
  @ApiOperation({
    summary: 'Reset the reclaimed-storage counter',
    description:
      'The dashboard counter starts accumulating from now. History in the activity log is unaffected.',
  })
  async resetReclaimed(): Promise<{ reclaimedSince: string }> {
    const reclaimedSince = new Date().toISOString();
    await this.settings.set('counters', { reclaimedSince });
    this.logger.log('Reclaimed-storage counter reset');
    return { reclaimedSince };
  }
}
