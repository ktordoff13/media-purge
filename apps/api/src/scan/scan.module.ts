import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Scan } from '../database/entities/scan.entity';
import { MediaItem } from '../database/entities/media-item.entity';
import { MediaSource } from '../database/entities/media-source.entity';
import { Recommendation } from '../database/entities/recommendation.entity';
import { ProtectedItem } from '../database/entities/protected-item.entity';
import { ProvidersModule } from '../providers/providers.module';
import { RulesModule } from '../rules/rules.module';
import { ScanService } from './scan.service';
import { ScanSchedulerService } from './scan-scheduler.service';
import { ScanController, ItemsController } from './scan.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Scan, MediaItem, MediaSource, Recommendation, ProtectedItem]),
    ProvidersModule,
    RulesModule,
  ],
  providers: [ScanService, ScanSchedulerService],
  controllers: [ScanController, ItemsController],
  exports: [ScanService],
})
export class ScanModule {}
