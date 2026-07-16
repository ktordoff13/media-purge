import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/api-key.guard';

@ApiTags('health')
@Controller('health')
export class AppController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness probe with build info' })
  health() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      // Baked into the Docker image by CI; 'dev' outside a container build.
      version: process.env.APP_VERSION || 'dev',
      build: process.env.BUILD_SHA ? process.env.BUILD_SHA.slice(0, 7) : null,
    };
  }
}
