import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type CustomRuleMatch = 'all' | 'any';
export type CustomRuleAppliesTo = 'movie' | 'show' | 'both';

export interface CustomRuleCondition {
  /** Field key from the custom-rule field registry, e.g. 'ageDays'. */
  field: string;
  /** Operator valid for the field's type, e.g. 'gt' or 'contains'. */
  operator: string;
  value: number | string;
}

/**
 * A user-defined cleanup rule: conditions over the scan snapshot combined
 * with ALL/ANY, contributing points to the same scoring pipeline as the
 * built-in rules. Pure data — no code is ever evaluated.
 */
@Entity('custom_rule')
export class CustomRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', default: 'both' })
  appliesTo: CustomRuleAppliesTo;

  @Column({ type: 'varchar', default: 'all' })
  match: CustomRuleMatch;

  @Column({ type: 'simple-json' })
  conditions: CustomRuleCondition[];

  @Column({ type: 'float', default: 25 })
  points: number;

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
