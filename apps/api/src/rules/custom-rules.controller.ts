import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CustomRule } from '../database/entities/custom-rule.entity';
import type { CustomRuleAppliesTo, CustomRuleMatch } from '../database/entities/custom-rule.entity';
import { MediaItem } from '../database/entities/media-item.entity';
import { Scan } from '../database/entities/scan.entity';
import { MediaSource } from '../database/entities/media-source.entity';
import { ProviderRegistry } from '../providers/provider-registry.service';
import {
  CUSTOM_RULE_FIELDS,
  FIELD_BY_KEY,
  OPERATORS_BY_TYPE,
  evaluateCustomRule,
  operatorValid,
} from './custom-rules.engine';

class ConditionDto {
  @ApiProperty({ description: 'Field key from GET /custom-rules/fields', example: 'ageDays' })
  @IsString()
  field: string;

  @ApiProperty({ description: 'Operator valid for the field type', example: 'gt' })
  @IsString()
  operator: string;

  @ApiProperty({ description: 'Comparison value', example: 180, oneOf: [{ type: 'number' }, { type: 'string' }] })
  @IsDefined() // whitelist mode strips undecorated properties — keep the value!
  value: number | string;
}

class UpsertCustomRuleDto {
  @ApiProperty({ example: 'Kids shelf-warmers' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Kids library items nobody has played in 6 months' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ['movie', 'show', 'both'], default: 'both' })
  @IsIn(['movie', 'show', 'both'])
  appliesTo: CustomRuleAppliesTo;

  @ApiProperty({ enum: ['all', 'any'], description: 'Combine conditions with AND (all) or OR (any)' })
  @IsIn(['all', 'any'])
  match: CustomRuleMatch;

  @ApiProperty({ type: [ConditionDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions: ConditionDto[];

  @ApiProperty({ example: 30, description: 'Points added to the item score when the rule matches' })
  @IsNumber()
  points: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

class PreviewItemDto {
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true }) year: number | null;
  @ApiProperty() libraryName: string;
  @ApiProperty() sizeBytes: number;
  @ApiProperty({ description: 'Auto-generated explanation of the matched conditions' }) reason: string;
}

class PreviewResultDto {
  @ApiProperty({ description: 'Items in the latest scan the rule would match' }) matchCount: number;
  @ApiProperty() totalSizeBytes: number;
  @ApiProperty({ description: 'Items evaluated (latest completed scan)' }) itemCount: number;
  @ApiProperty({ type: [PreviewItemDto], description: 'Largest 20 matches' }) sample: PreviewItemDto[];
}

@ApiTags('custom-rules')
@Controller('custom-rules')
export class CustomRulesController {
  constructor(
    @InjectRepository(CustomRule) private readonly rules: Repository<CustomRule>,
    @InjectRepository(MediaItem) private readonly items: Repository<MediaItem>,
    @InjectRepository(Scan) private readonly scans: Repository<Scan>,
    @InjectRepository(MediaSource) private readonly sources: Repository<MediaSource>,
    private readonly registry: ProviderRegistry,
  ) {}

  @Get('fields')
  @ApiOperation({
    summary: 'List the fields and operators available to custom rules',
    description:
      'The UI renders the condition builder from this. Fields with a `requires` capability are skipped for items from servers that cannot report them; unknown values never match.',
  })
  fields() {
    return {
      fields: CUSTOM_RULE_FIELDS.map(({ get: _get, ...meta }) => meta),
      operators: OPERATORS_BY_TYPE,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List custom rules' })
  list() {
    return this.rules.find({ order: { id: 'ASC' } });
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom rule' })
  create(@Body() dto: UpsertCustomRuleDto) {
    this.validateConditions(dto);
    return this.rules.save(this.rules.create({ enabled: true, ...dto }));
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a custom rule' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertCustomRuleDto) {
    const rule = await this.rules.findOneBy({ id });
    if (!rule) throw new NotFoundException(`Custom rule ${id} not found`);
    this.validateConditions(dto);
    return this.rules.save({ ...rule, ...dto });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a custom rule' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.rules.delete(id);
    return { deleted: true };
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Preview a rule against the latest scan without saving it',
    description:
      'Evaluates the rule definition in the request body against every item of the latest completed scan and reports what it would match — use this before enabling a new rule.',
  })
  @ApiOkResponse({ type: PreviewResultDto })
  async preview(@Body() dto: UpsertCustomRuleDto): Promise<PreviewResultDto> {
    this.validateConditions(dto);
    const latest = await this.scans.findOne({ where: { status: 'completed' }, order: { id: 'DESC' } });
    if (!latest) {
      return { matchCount: 0, totalSizeBytes: 0, itemCount: 0, sample: [] };
    }
    const items = await this.items.findBy({ scanId: latest.id });
    const sourceRows = await this.sources.findBy({ id: In([...new Set(items.map((i) => i.sourceId))]) });
    const caps = new Map(sourceRows.map((s) => [s.id, this.registry.get(s.type).capabilities]));

    const now = new Date();
    const matches: PreviewItemDto[] = [];
    let totalSizeBytes = 0;
    for (const item of items) {
      const cap = caps.get(item.sourceId);
      if (!cap) continue;
      const match = evaluateCustomRule(dto, item, cap, now);
      if (!match) continue;
      totalSizeBytes += Number(item.sizeBytes);
      matches.push({
        title: item.title,
        year: item.year,
        libraryName: item.libraryName,
        sizeBytes: Number(item.sizeBytes),
        reason: match.reason,
      });
    }
    matches.sort((a, b) => b.sizeBytes - a.sizeBytes);
    return {
      matchCount: matches.length,
      totalSizeBytes,
      itemCount: items.length,
      sample: matches.slice(0, 20),
    };
  }

  private validateConditions(dto: UpsertCustomRuleDto): void {
    for (const cond of dto.conditions) {
      const field = FIELD_BY_KEY.get(cond.field);
      if (!field) throw new BadRequestException(`Unknown field '${cond.field}'`);
      if (!operatorValid(field, cond.operator)) {
        throw new BadRequestException(`Operator '${cond.operator}' is not valid for field '${cond.field}'`);
      }
      if (field.type === 'number' && isNaN(Number(cond.value))) {
        throw new BadRequestException(`Field '${cond.field}' needs a numeric value`);
      }
      if (field.type === 'enum' && !field.enumValues?.includes(String(cond.value))) {
        throw new BadRequestException(
          `Field '${cond.field}' accepts: ${field.enumValues?.join(', ')}`,
        );
      }
    }
  }
}
