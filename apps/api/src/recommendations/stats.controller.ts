import { Controller, Get } from '@nestjs/common';
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
import { ActivityService } from '../activity/activity.service';
import { SettingsService } from '../settings/settings.service';

class LibraryStatDto {
  @ApiProperty() libraryName: string;
  @ApiProperty() itemCount: number;
  @ApiProperty() sizeBytes: number;
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
  @ApiProperty({ description: 'Bytes actually freed by purges since install.' })
  spaceSavedBytes: number;
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
    private readonly activity: ActivityService,
    private readonly settings: SettingsService,
  ) {}

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
      }));
    }
    return {
      lastScan,
      openRecommendations,
      reclaimableBytes,
      spaceSavedBytes: await this.activity.totalBytesFreed(),
      libraries,
    };
  }
}
