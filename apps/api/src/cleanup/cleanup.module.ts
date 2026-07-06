import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Recommendation } from '../database/entities/recommendation.entity';
import { RecycleBinEntry } from '../database/entities/recycle-bin-entry.entity';
import { ArrModule } from '../arr/arr.module';
import { CleanupService } from './cleanup.service';
import { RecycleBinController } from './recycle-bin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Recommendation, RecycleBinEntry]), ArrModule],
  providers: [CleanupService],
  controllers: [RecycleBinController],
  exports: [CleanupService],
})
export class CleanupModule {}
