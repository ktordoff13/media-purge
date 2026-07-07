import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdirSync } from 'fs';
import { AppModule, CONFIG_DIR } from './app.module';

async function bootstrap() {
  mkdirSync(CONFIG_DIR, { recursive: true });

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors(); // LAN tool; the Angular dev server runs on another port

  const config = new DocumentBuilder()
    .setTitle('Media Purge API')
    .setDescription(
      'Rule-based media cleanup for Plex and Jellyfin. Scan libraries, get explainable deletion ' +
        'recommendations, and reclaim storage through a staged pipeline: approve → recycle bin → purge. ' +
        'Every action lands in the activity log. Destructive endpoints honor the global dry-run switch ' +
        'and, when a security API key is configured, every request must carry the X-Api-Key header.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'apiKey')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Media Purge API',
    jsonDocumentUrl: 'api/docs-json',
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`Media Purge API on http://localhost:${port} (docs at /api/docs)`);
}
void bootstrap();
