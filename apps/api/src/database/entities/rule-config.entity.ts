import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Per-rule enablement and user-tuned parameters. Seeded from rule defaults. */
@Entity('rule_config')
export class RuleConfig {
  /** Stable rule key, e.g. 'never-watched'. */
  @PrimaryColumn()
  key: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'simple-json', default: '{}' })
  params: Record<string, number | string | boolean>;
}
