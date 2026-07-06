import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaSource } from '../database/entities/media-source.entity';
import { ProvidersModule } from '../providers/providers.module';
import { SourcesController } from './sources.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MediaSource]), ProvidersModule],
  controllers: [SourcesController],
})
export class SourcesModule {}
