import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrService } from './arr.service';

@ApiTags('integrations')
@Controller('integrations')
export class ArrController {
  constructor(private readonly arr: ArrService) {}

  @Post('radarr/test')
  @ApiOperation({ summary: 'Test the Radarr connection' })
  testRadarr() {
    return this.arr.testRadarr();
  }

  @Post('sonarr/test')
  @ApiOperation({ summary: 'Test the Sonarr connection' })
  testSonarr() {
    return this.arr.testSonarr();
  }
}
