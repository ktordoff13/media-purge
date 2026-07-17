import { Module, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { LoggerModule } from 'nestjs-pino';
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

export const CONFIG_DIR =
  process.env.CONFIG_DIR ?? join(process.cwd(), 'config');

/** Built Angular app, served in the production container. */
const webDist =
  process.env.WEB_DIST ??
  join(__dirname, '..', '..', 'web', 'dist', 'web', 'browser');

@Module({
  imports: [
    // Pino logger for the whole app: LOG_LEVEL (default 'info', set 'debug'
    // for request traces) and LOG_FORMAT=json for machine-readable output
    // (default is pretty single-line for `docker logs`).
    LoggerModule.forRoot({
      // nestjs-pino's default is the legacy '*' path, which Nest 11 only
      // supports via a noisy auto-conversion warning at boot.
      forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.LOG_FORMAT === 'json'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                  translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                  messageFormat: '{if context}[{context}] {end}{msg}',
                  ignore: 'pid,hostname,context,req,res,responseTime',
                },
              },
        // Successful GETs (incl. the queue poll) only appear at debug level;
        // mutations log at info, 4xx at warn, 5xx at error.
        customProps: () => ({ context: 'HTTP' }),
        autoLogging: {
          ignore: (req) => req.url === '/api/v1/health',
        },
        customLogLevel: (req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return req.method === 'GET' ? 'debug' : 'info';
        },
        customSuccessMessage: (req, res, responseTime) =>
          `${req.method} ${req.url} → ${res.statusCode} (${responseTime}ms)`,
        customErrorMessage: (req, res) =>
          `${req.method} ${req.url} → ${res.statusCode}`,
      },
    }),
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
      ? [
          ServeStaticModule.forRoot({
            rootPath: webDist,
            exclude: ['/api/{*any}'],
          }),
        ]
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
