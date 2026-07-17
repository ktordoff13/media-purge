import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurgeJob } from '../database/entities/purge-job.entity';
import { Recommendation } from '../database/entities/recommendation.entity';
import { RecycleBinEntry } from '../database/entities/recycle-bin-entry.entity';
import { ArrModule } from '../arr/arr.module';
import { CleanupService } from './cleanup.service';
import { PurgeJobsService } from './purge-jobs.service';
import { RecycleBinController } from './recycle-bin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurgeJob, Recommendation, RecycleBinEntry]),
    ArrModule,
  ],
  providers: [CleanupService, PurgeJobsService],
  controllers: [RecycleBinController],
  exports: [CleanupService, PurgeJobsService],
})
export class CleanupModule {}
