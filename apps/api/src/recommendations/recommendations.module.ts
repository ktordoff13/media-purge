import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Recommendation } from '../database/entities/recommendation.entity';
import { MediaItem } from '../database/entities/media-item.entity';
import { ProtectedItem } from '../database/entities/protected-item.entity';
import { Scan } from '../database/entities/scan.entity';
import { CleanupModule } from '../cleanup/cleanup.module';
import {
  ProtectedItemsController,
  RecommendationsController,
} from './recommendations.controller';
import { StatsController } from './stats.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Recommendation, MediaItem, ProtectedItem, Scan]),
    CleanupModule,
  ],
  controllers: [RecommendationsController, ProtectedItemsController, StatsController],
})
export class RecommendationsModule {}
