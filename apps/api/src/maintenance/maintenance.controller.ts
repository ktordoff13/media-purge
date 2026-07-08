import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { MaintenanceService } from './maintenance.service';

class RunOperationDto {
  @ApiProperty({ example: 'photo-transcoder-cache' })
  @IsString()
  operation: string;
}

@ApiTags('maintenance')
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get(':sourceId/operations')
  @ApiOperation({
    summary: 'List maintenance operations for a media source',
    description:
      'ImageMaid-style appdata housekeeping: cache purges (need the appdata dir mounted + configured) and server-side tasks like Clean Bundles / Optimize Database (API-only, always available).',
  })
  operations(@Param('sourceId', ParseIntPipe) sourceId: number) {
    return this.maintenance.operations(sourceId);
  }

  @Post(':sourceId/run')
  @ApiOperation({
    summary: 'Run a maintenance operation',
    description:
      'Filesystem operations honor dry-run mode and report bytes freed.',
  })
  run(
    @Param('sourceId', ParseIntPipe) sourceId: number,
    @Body() dto: RunOperationDto,
  ) {
    return this.maintenance.run(sourceId, dto.operation);
  }
}
