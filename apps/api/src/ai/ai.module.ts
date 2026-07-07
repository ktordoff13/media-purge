import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Recommendation } from '../database/entities/recommendation.entity';
import { AiAdvisorService } from './ai-advisor.service';
import { AiController } from './ai.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Recommendation])],
  providers: [AiAdvisorService],
  controllers: [AiController],
  exports: [AiAdvisorService],
})
export class AiModule {}
