import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaSource } from '../database/entities/media-source.entity';
import { ProviderRegistry } from '../providers/provider-registry.service';
import {
  ConnectionTestResultDto,
  CreateSourceDto,
  ProviderTypeDto,
  RemoteLibraryDto,
  UpdateSourceDto,
} from './sources.dto';

@ApiTags('sources')
@Controller('sources')
export class SourcesController {
  constructor(
    @InjectRepository(MediaSource)
    private readonly repo: Repository<MediaSource>,
    private readonly registry: ProviderRegistry,
  ) {}

  @Get('provider-types')
  @ApiOperation({ summary: 'List supported media server types and their capabilities' })
  @ApiOkResponse({ type: [ProviderTypeDto] })
  providerTypes(): ProviderTypeDto[] {
    return this.registry.list().map((p) => ({
      type: p.type,
      displayName: p.displayName,
      capabilities: { ...p.capabilities },
    }));
  }

  @Get()
  @ApiOperation({ summary: 'List configured media sources' })
  list() {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  @Post()
  @ApiOperation({ summary: 'Add a media source (Plex or Jellyfin server)' })
  create(@Body() dto: CreateSourceDto) {
    this.registry.get(dto.type); // validates the type is registered
    return this.repo.save(this.repo.create({ excludedLibraryIds: [], enabled: true, ...dto }));
  }

  @Post('test')
  @ApiOperation({
    summary: 'Test a connection without saving',
    description: 'Used by the add-source form to validate URL and token before the source exists.',
  })
  @ApiOkResponse({ type: ConnectionTestResultDto })
  testUnsaved(@Body() dto: CreateSourceDto): Promise<ConnectionTestResultDto> {
    const source = this.repo.create({ excludedLibraryIds: [], enabled: true, ...dto });
    return this.registry.get(dto.type).testConnection(source);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a media source' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSourceDto) {
    const source = await this.mustFind(id);
    this.registry.get(dto.type);
    return this.repo.save({ ...source, ...dto });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a media source and its scan snapshots' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.repo.delete(id);
    return { deleted: true };
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test connectivity to a media source' })
  @ApiOkResponse({ type: ConnectionTestResultDto })
  async test(@Param('id', ParseIntPipe) id: number): Promise<ConnectionTestResultDto> {
    const source = await this.mustFind(id);
    return this.registry.get(source.type).testConnection(source);
  }

  @Get(':id/libraries')
  @ApiOperation({ summary: 'List libraries on a media source (for scan exclusions)' })
  @ApiOkResponse({ type: [RemoteLibraryDto] })
  async libraries(@Param('id', ParseIntPipe) id: number): Promise<RemoteLibraryDto[]> {
    const source = await this.mustFind(id);
    return this.registry.get(source.type).listLibraries(source);
  }

  private async mustFind(id: number): Promise<MediaSource> {
    const source = await this.repo.findOneBy({ id });
    if (!source) throw new NotFoundException(`Media source ${id} not found`);
    return source;
  }
}
