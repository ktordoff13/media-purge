import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RuleConfig } from '../database/entities/rule-config.entity';
import { CustomRule } from '../database/entities/custom-rule.entity';
import { MediaItem } from '../database/entities/media-item.entity';
import { RecommendationReason } from '../database/entities/recommendation.entity';
import { ProviderCapabilities } from '../providers/media-server-provider.interface';
import { ALL_RULES } from './definitions';
import { evaluateCustomRule } from './custom-rules.engine';
import { CleanupRule } from './rule.interface';

/** Minimum aggregate score before an item becomes a recommendation. */
export const MIN_RECOMMENDATION_SCORE = 25;

/** Items carrying this label (case-insensitive) on the media server are never suggested. */
export const KEEP_LABEL = 'keep';

@Injectable()
export class RulesService implements OnModuleInit {
  readonly rules: CleanupRule[] = ALL_RULES;

  constructor(
    @InjectRepository(RuleConfig)
    private readonly configs: Repository<RuleConfig>,
    @InjectRepository(CustomRule)
    private readonly customRules: Repository<CustomRule>,
  ) {}

  async getEnabledCustomRules(): Promise<CustomRule[]> {
    return this.customRules.findBy({ enabled: true });
  }

  /** Seed config rows for any rules that don't have one yet. */
  async onModuleInit(): Promise<void> {
    const existing = new Set((await this.configs.find()).map((c) => c.key));
    const missing = this.rules
      .filter((r) => !existing.has(r.key))
      .map((r) => this.configs.create({ key: r.key, enabled: true, params: r.defaultParams }));
    if (missing.length) await this.configs.save(missing);
  }

  async getConfigs(): Promise<RuleConfig[]> {
    return this.configs.find();
  }

  async updateConfig(
    key: string,
    patch: { enabled?: boolean; params?: Record<string, number> },
  ): Promise<RuleConfig> {
    const rule = this.rules.find((r) => r.key === key);
    if (!rule) throw new NotFoundException(`Unknown rule '${key}'`);
    const config =
      (await this.configs.findOneBy({ key })) ??
      this.configs.create({ key, enabled: true, params: rule.defaultParams });
    if (patch.enabled !== undefined) config.enabled = patch.enabled;
    if (patch.params) config.params = { ...rule.defaultParams, ...patch.params };
    return this.configs.save(config);
  }

  /**
   * Evaluate all enabled rules against one item. Items protected by the
   * keep-label are handled by the caller (which also knows the protected list).
   */
  evaluateItem(
    item: MediaItem,
    capabilities: ProviderCapabilities,
    configs: Map<string, RuleConfig>,
    customRules: CustomRule[] = [],
    now = new Date(),
  ): RecommendationReason[] {
    const reasons: RecommendationReason[] = [];
    for (const rule of this.rules) {
      const config = configs.get(rule.key);
      if (config && !config.enabled) continue;
      if (rule.requires?.some((cap) => !capabilities[cap])) continue;
      const params = { ...rule.defaultParams, ...(config?.params ?? {}) } as Record<string, number>;
      const match = rule.evaluate(item, { now, capabilities, params });
      if (match) {
        reasons.push({ ruleKey: rule.key, ruleName: rule.name, points: match.points, reason: match.reason });
      }
    }
    for (const custom of customRules) {
      const match = evaluateCustomRule(custom, item, capabilities, now);
      if (match) {
        reasons.push({
          ruleKey: `custom-${custom.id}`,
          ruleName: custom.name,
          points: match.points,
          reason: match.reason,
        });
      }
    }
    return reasons;
  }
}
