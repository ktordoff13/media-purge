import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RuleConfig } from '../database/entities/rule-config.entity';
import { CustomRule } from '../database/entities/custom-rule.entity';
import { MediaItem } from '../database/entities/media-item.entity';
import { Scan } from '../database/entities/scan.entity';
import { MediaSource } from '../database/entities/media-source.entity';
import { ProvidersModule } from '../providers/providers.module';
import { RulesService } from './rules.service';
import { RulesController } from './rules.controller';
import { CustomRulesController } from './custom-rules.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([RuleConfig, CustomRule, MediaItem, Scan, MediaSource]),
    ProvidersModule,
  ],
  providers: [RulesService],
  controllers: [RulesController, CustomRulesController],
  exports: [RulesService],
})
export class RulesModule {}
