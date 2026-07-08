import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArrayNotEmpty, IsArray, IsIn } from 'class-validator';
import { Recommendation } from '../database/entities/recommendation.entity';
import type { RecommendationStatus } from '../database/entities/recommendation.entity';
import { MediaItem } from '../database/entities/media-item.entity';
import { ProtectedItem } from '../database/entities/protected-item.entity';
import { CleanupService } from '../cleanup/cleanup.service';
import { ActivityService } from '../activity/activity.service';

class BulkActionDto {
  @ApiProperty({ type: [Number], example: [1, 2, 3] })
  @IsArray()
  @ArrayNotEmpty()
  ids: number[];

  @ApiProperty({ enum: ['approve', 'dismiss'] })
  @IsIn(['approve', 'dismiss'])
  action: 'approve' | 'dismiss';
}

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(
    @InjectRepository(Recommendation)
    private readonly recs: Repository<Recommendation>,
    @InjectRepository(ProtectedItem)
    private readonly protectedItems: Repository<ProtectedItem>,
    @InjectRepository(MediaItem) private readonly items: Repository<MediaItem>,
    private readonly cleanup: CleanupService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List cleanup recommendations',
    description:
      'Each recommendation carries the media item snapshot it was computed from plus the matched rules ("reasons"). Sort by score to see the strongest candidates or by size to see the biggest wins.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['open', 'approved', 'dismissed', 'restored', 'purged'],
  })
  @ApiQuery({
    name: 'scanId',
    required: false,
    type: Number,
    description: 'Defaults to the latest scan.',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['score', 'size'],
    description: 'Descending. Default: score.',
  })
  @ApiQuery({
    name: 'library',
    required: false,
    description: 'Filter by library name.',
  })
  async list(
    @Query('status') status: RecommendationStatus = 'open',
    @Query('scanId') scanId?: string,
    @Query('sort') sort: 'score' | 'size' = 'score',
    @Query('library') library?: string,
  ) {
    let effectiveScanId = scanId ? Number(scanId) : undefined;
    if (!effectiveScanId) {
      const latest = await this.recs
        .createQueryBuilder('r')
        .select('MAX(r.scanId)', 'max')
        .getRawOne<{ max: number }>();
      effectiveScanId = latest?.max ?? 0;
    }
    const qb = this.recs
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.mediaItem', 'item')
      .where('r.scanId = :scanId', { scanId: effectiveScanId })
      .andWhere('r.status = :status', { status });
    if (library) qb.andWhere('item.libraryName = :library', { library });
    qb.orderBy(
      sort === 'size' ? 'r.sizeBytes' : 'r.totalScore',
      'DESC',
    ).addOrderBy('r.sizeBytes', 'DESC');
    return qb.getMany();
  }

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve a recommendation',
    description:
      'Unmonitors the item in Radarr/Sonarr (when configured) and moves its files to the recycle bin, where they wait out the retention window before permanent deletion. Honors dry-run mode.',
  })
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.cleanup.approve(id);
  }

  @Post(':id/dismiss')
  @ApiOperation({
    summary: 'Dismiss a recommendation',
    description:
      'Rejects the suggestion. Future scans will not re-suggest this item.',
  })
  async dismiss(@Param('id', ParseIntPipe) id: number) {
    await this.cleanup.dismiss(id);
    return { dismissed: true };
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Approve or dismiss many recommendations at once' })
  async bulk(@Body() dto: BulkActionDto) {
    const results: { id: number; ok: boolean; message?: string }[] = [];
    for (const id of dto.ids) {
      try {
        if (dto.action === 'approve') await this.cleanup.approve(id);
        else await this.cleanup.dismiss(id);
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, message: (err as Error).message });
      }
    }
    return { results };
  }

  @Post(':id/protect')
  @ApiOperation({
    summary: 'Protect the underlying item',
    description:
      'Adds the item to the protected list ("never suggest deleting this") and dismisses the current recommendation.',
  })
  async protect(@Param('id', ParseIntPipe) id: number) {
    const rec = await this.recs.findOne({
      where: { id },
      relations: { mediaItem: true },
    });
    if (!rec) throw new NotFoundException(`Recommendation ${id} not found`);
    const item = rec.mediaItem;
    const exists = await this.protectedItems.findOneBy({
      sourceId: item.sourceId,
      providerItemId: item.providerItemId,
    });
    if (!exists) {
      await this.protectedItems.save(
        this.protectedItems.create({
          sourceId: item.sourceId,
          providerItemId: item.providerItemId,
          title: item.title,
        }),
      );
    }
    if (rec.status === 'open') {
      await this.recs.update(rec.id, {
        status: 'dismissed',
        resolvedAt: new Date(),
      });
    }
    await this.activity.log(
      'item.protected',
      `Protected "${item.title}" — it will never be suggested again`,
    );
    return { protected: true };
  }
}

@ApiTags('protected')
@Controller('protected-items')
export class ProtectedItemsController {
  constructor(
    @InjectRepository(ProtectedItem)
    private readonly protectedItems: Repository<ProtectedItem>,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List protected items (never suggested for deletion)',
  })
  list() {
    return this.protectedItems.find({ order: { id: 'DESC' } });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove protection from an item' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    const item = await this.protectedItems.findOneBy({ id });
    if (item) {
      await this.protectedItems.delete(id);
      await this.activity.log(
        'item.unprotected',
        `Removed protection from "${item.title}"`,
      );
    }
    return { deleted: true };
  }
}
