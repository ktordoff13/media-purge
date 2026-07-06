import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/api-key.guard';

@ApiTags('health')
@Controller('health')
export class AppController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness probe' })
  health() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
