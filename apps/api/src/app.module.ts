import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppController } from './app.controller';
import { ActivityModule } from './activity/activity.module';
import { SettingsModule } from './settings/settings.module';
import { ProvidersModule } from './providers/providers.module';
import { SourcesModule } from './sources/sources.module';
import { ScanModule } from './scan/scan.module';
import { RulesModule } from './rules/rules.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { ArrModule } from './arr/arr.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { AiModule } from './ai/ai.module';
import { ApiKeyGuard } from './common/api-key.guard';

export const CONFIG_DIR = process.env.CONFIG_DIR ?? join(process.cwd(), 'config');

/** Built Angular app, served in the production container. */
const webDist = process.env.WEB_DIST ?? join(__dirname, '..', '..', 'web', 'dist', 'web', 'browser');

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: join(CONFIG_DIR, 'media-purge.db'),
      autoLoadEntities: true,
      // v1 ships with synchronize on SQLite; swap for generated migrations
      // once the schema stabilizes.
      synchronize: true,
    }),
    ScheduleModule.forRoot(),
    ...(existsSync(webDist)
      ? [ServeStaticModule.forRoot({ rootPath: webDist, exclude: ['/api/{*any}'] })]
      : []),
    ActivityModule,
    SettingsModule,
    ProvidersModule,
    SourcesModule,
    ScanModule,
    RulesModule,
    CleanupModule,
    RecommendationsModule,
    ArrModule,
    MaintenanceModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
