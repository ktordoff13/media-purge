import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiPropertyOptional, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional } from 'class-validator';
import { RulesService } from './rules.service';

class UpdateRuleDto {
  @ApiPropertyOptional({ description: 'Enable or disable this rule.' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Rule parameters; unknown keys are ignored, omitted keys keep their defaults.',
    example: { minAgeDays: 365, points: 40 },
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, number>;
}

class RuleDto {
  @ApiProperty({ example: 'never-watched' })
  key: string;

  @ApiProperty({ example: 'Never watched, aging' })
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ example: { minAgeDays: 365, points: 40 } })
  defaultParams: Record<string, number>;

  @ApiProperty({ description: 'Provider capabilities this rule needs.', example: ['multiVersion'] })
  requires: string[];

  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ description: 'Effective parameters (defaults merged with user overrides).' })
  params: Record<string, number>;
}

@ApiTags('rules')
@Controller('rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  @ApiOperation({
    summary: 'List all cleanup rules with their configuration',
    description:
      'Every recommendation is explained by the rules that matched it. Each rule can be disabled or re-tuned here; changes apply from the next scan.',
  })
  @ApiOkResponse({ type: [RuleDto] })
  async list(): Promise<RuleDto[]> {
    const configs = new Map((await this.rules.getConfigs()).map((c) => [c.key, c]));
    return this.rules.rules.map((r) => {
      const c = configs.get(r.key);
      return {
        key: r.key,
        name: r.name,
        description: r.description,
        defaultParams: r.defaultParams,
        requires: r.requires ?? [],
        enabled: c?.enabled ?? true,
        params: { ...r.defaultParams, ...(c?.params ?? {}) } as Record<string, number>,
      };
    });
  }

  @Put(':key')
  @ApiOperation({ summary: 'Enable/disable a rule or tune its parameters' })
  update(@Param('key') key: string, @Body() dto: UpdateRuleDto) {
    return this.rules.updateConfig(key, dto);
  }
}
