import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Scan } from '../database/entities/scan.entity';
import { MediaItem } from '../database/entities/media-item.entity';
import { Recommendation } from '../database/entities/recommendation.entity';
import { ActivityService } from '../activity/activity.service';

class LibraryStatDto {
  @ApiProperty() libraryName: string;
  @ApiProperty() itemCount: number;
  @ApiProperty() sizeBytes: number;
}

class DashboardDto {
  @ApiProperty({ nullable: true }) lastScan: Scan | null;
  @ApiProperty() openRecommendations: number;
  @ApiProperty({ description: 'Bytes reclaimable if all open recommendations were approved.' })
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
    @InjectRepository(Recommendation) private readonly recs: Repository<Recommendation>,
    private readonly activity: ActivityService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Aggregate numbers for the dashboard' })
  @ApiOkResponse({ type: DashboardDto })
  async dashboard(): Promise<DashboardDto> {
    const lastScan = await this.scans.findOne({ where: {}, order: { id: 'DESC' } });
    let openRecommendations = 0;
    let reclaimableBytes = 0;
    let libraries: LibraryStatDto[] = [];
    if (lastScan) {
      const open = await this.recs
        .createQueryBuilder('r')
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(r.sizeBytes), 0)', 'bytes')
        .where('r.scanId = :id AND r.status = :status', { id: lastScan.id, status: 'open' })
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
          .getRawMany<{ libraryName: string; itemCount: string; sizeBytes: string }>()
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
