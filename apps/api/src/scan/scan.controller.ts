import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { ScanService } from './scan.service';
import { Public } from '../common/api-key.guard';
import { MediaItem } from '../database/entities/media-item.entity';
import { MediaSource } from '../database/entities/media-source.entity';
import { ProviderRegistry } from '../providers/provider-registry.service';

@ApiTags('scans')
@Controller('scans')
export class ScanController {
  constructor(private readonly scan: ScanService) {}

  @Post()
  @ApiOperation({
    summary: 'Start a scan',
    description:
      'Snapshots every enabled media source (read-only against the media servers), then runs the rule engine to produce cleanup recommendations. Returns immediately; poll GET /scans/latest for progress.',
  })
  start() {
    return this.scan.start();
  }

  @Get()
  @ApiOperation({ summary: 'List recent scans' })
  list() {
    return this.scan.list();
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get the most recent scan and its status' })
  async latest() {
    return { scan: await this.scan.latest(), running: this.scan.isRunning };
  }
}

@ApiTags('items')
@Controller('items')
export class ItemsController {
  constructor(
    @InjectRepository(MediaItem) private readonly items: Repository<MediaItem>,
    @InjectRepository(MediaSource)
    private readonly sources: Repository<MediaSource>,
    private readonly registry: ProviderRegistry,
  ) {}

  @Get(':id/poster')
  @Public()
  @ApiOperation({
    summary: "Proxy an item's poster image from its media server",
    description:
      'Keeps server tokens off the browser; the UI loads posters through this endpoint.',
  })
  @ApiOkResponse({ description: 'Image bytes' })
  async poster(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const item = await this.items.findOneBy({ id });
    if (!item?.thumbPath)
      throw new NotFoundException('No poster for this item');
    const source = await this.sources.findOneBy({ id: item.sourceId });
    if (!source) throw new NotFoundException('Source gone');
    const url = this.registry.get(source.type).imageUrl(source, item.thumbPath);
    if (!url) throw new NotFoundException('No poster URL');
    const upstream = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!upstream.ok) throw new NotFoundException('Poster fetch failed');
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') ?? 'image/jpeg',
    );
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  }
}
