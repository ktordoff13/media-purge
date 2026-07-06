import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ActivityService } from './activity.service';
import type { ActivityType } from '../database/entities/activity-log.entity';

@ApiTags('activity')
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @ApiOperation({
    summary: 'List the activity log',
    description:
      'Append-only audit trail of everything the app did: scans, recommendations, approvals, recycle-bin moves, restores, purges, and settings changes — including why (matched rules) and bytes freed.',
  })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by activity type' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  list(
    @Query('type') type?: ActivityType,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    return this.activity.find({
      type,
      limit: Math.min(Number(limit) || 50, 500),
      offset: Number(offset) || 0,
    });
  }

  @Get('export.csv')
  @ApiOperation({ summary: 'Export the full activity log as CSV' })
  @ApiOkResponse({ description: 'CSV file', type: String })
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="media-review-activity.csv"')
  async exportCsv(): Promise<string> {
    const { items } = await this.activity.find({ limit: 100_000, offset: 0 });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = items.map((a) =>
      [a.id, a.createdAt.toISOString(), a.type, a.message, a.bytesFreed, a.dryRun, JSON.stringify(a.details ?? {})]
        .map(esc)
        .join(','),
    );
    return ['id,timestamp,type,message,bytesFreed,dryRun,details', ...rows].join('\n');
  }
}
