import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import {
  AiSettingsDto,
  ArrSettingsDto,
  GeneralSettingsDto,
  MaintenanceSettingsDto,
  PathMappingsDto,
  SecuritySettingsDto,
} from './settings.dto';
import { ActivityService } from '../activity/activity.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly activity: ActivityService,
  ) {}

  @Get('general')
  @ApiOperation({
    summary: 'Get general settings (dry-run, recycle bin, retention, schedule)',
  })
  @ApiOkResponse({ type: GeneralSettingsDto })
  getGeneral() {
    return this.settings.get('general');
  }

  @Put('general')
  @ApiOperation({ summary: 'Update general settings' })
  @ApiOkResponse({ type: GeneralSettingsDto })
  async putGeneral(@Body() dto: GeneralSettingsDto) {
    await this.settings.set('general', dto);
    await this.activity.log('settings.updated', 'General settings updated');
    return dto;
  }

  @Get('path-mappings')
  @ApiOperation({
    summary: 'Get path mappings',
    description:
      'Path mappings translate file paths as the media server sees them into paths inside this container. Required whenever the media server and this app mount the same storage at different paths (the norm on unraid).',
  })
  @ApiOkResponse({ type: PathMappingsDto })
  async getPathMappings(): Promise<PathMappingsDto> {
    return { mappings: await this.settings.get('pathMappings') };
  }

  @Put('path-mappings')
  @ApiOperation({ summary: 'Replace path mappings' })
  @ApiOkResponse({ type: PathMappingsDto })
  async putPathMappings(
    @Body() dto: PathMappingsDto,
  ): Promise<PathMappingsDto> {
    await this.settings.set('pathMappings', dto.mappings);
    await this.activity.log('settings.updated', 'Path mappings updated');
    return dto;
  }

  @Get('radarr')
  @ApiOperation({ summary: 'Get Radarr connection settings' })
  @ApiOkResponse({ type: ArrSettingsDto })
  getRadarr() {
    return this.settings.get('radarr');
  }

  @Put('radarr')
  @ApiOperation({ summary: 'Update Radarr connection settings' })
  @ApiOkResponse({ type: ArrSettingsDto })
  async putRadarr(@Body() dto: ArrSettingsDto) {
    await this.settings.set('radarr', dto);
    await this.activity.log('settings.updated', 'Radarr settings updated');
    return dto;
  }

  @Get('sonarr')
  @ApiOperation({ summary: 'Get Sonarr connection settings' })
  @ApiOkResponse({ type: ArrSettingsDto })
  getSonarr() {
    return this.settings.get('sonarr');
  }

  @Put('sonarr')
  @ApiOperation({ summary: 'Update Sonarr connection settings' })
  @ApiOkResponse({ type: ArrSettingsDto })
  async putSonarr(@Body() dto: ArrSettingsDto) {
    await this.settings.set('sonarr', dto);
    await this.activity.log('settings.updated', 'Sonarr settings updated');
    return dto;
  }

  @Get('maintenance')
  @ApiOperation({
    summary: 'Get maintenance settings (per-source appdata paths)',
  })
  @ApiOkResponse({ type: MaintenanceSettingsDto })
  getMaintenance() {
    return this.settings.get('maintenance');
  }

  @Put('maintenance')
  @ApiOperation({ summary: 'Update maintenance settings' })
  @ApiOkResponse({ type: MaintenanceSettingsDto })
  async putMaintenance(@Body() dto: MaintenanceSettingsDto) {
    await this.settings.set('maintenance', dto);
    await this.activity.log('settings.updated', 'Maintenance settings updated');
    return dto;
  }

  @Get('ai')
  @ApiOperation({ summary: 'Get local AI advisor settings' })
  @ApiOkResponse({ type: AiSettingsDto })
  getAi() {
    return this.settings.get('ai');
  }

  @Put('ai')
  @ApiOperation({ summary: 'Update local AI advisor settings' })
  @ApiOkResponse({ type: AiSettingsDto })
  async putAi(@Body() dto: AiSettingsDto) {
    await this.settings.set('ai', dto);
    await this.activity.log('settings.updated', 'AI advisor settings updated');
    return dto;
  }

  @Get('security')
  @ApiOperation({ summary: 'Get security settings' })
  @ApiOkResponse({ type: SecuritySettingsDto })
  getSecurity() {
    return this.settings.get('security');
  }

  @Put('security')
  @ApiOperation({ summary: 'Update security settings' })
  @ApiOkResponse({ type: SecuritySettingsDto })
  async putSecurity(@Body() dto: SecuritySettingsDto) {
    await this.settings.set('security', dto);
    await this.activity.log('settings.updated', 'Security settings updated');
    return dto;
  }
}
