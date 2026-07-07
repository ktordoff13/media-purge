import { MediaItem } from '../database/entities/media-item.entity';
import { CustomRule, CustomRuleCondition } from '../database/entities/custom-rule.entity';
import { ProviderCapabilities } from '../providers/media-server-provider.interface';
import { daysSince, RuleMatch } from './rule.interface';

const GB = 1024 ** 3;

export type FieldType = 'number' | 'string' | 'enum' | 'labels';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Show/movie-only fields; the builder hides them for the other type. */
  appliesTo: 'movie' | 'show' | 'both';
  /** Provider capability the item's source must report for this field. */
  requires?: keyof ProviderCapabilities;
  enumValues?: string[];
  description: string;
  /** Extract the value from a snapshot item; null = unknown (never matches). */
  get(item: MediaItem, now: Date): number | string | string[] | null;
}

/**
 * Every field a user-defined rule can reference, including derived values so
 * users never do date math. Nulls are strict: a condition on an unknown value
 * does not match, so "rating < 6" can never catch an unrated item.
 */
export const CUSTOM_RULE_FIELDS: FieldDef[] = [
  { key: 'title', label: 'Title', type: 'string', appliesTo: 'both', description: 'Item title', get: (i) => i.title },
  { key: 'libraryName', label: 'Library', type: 'string', appliesTo: 'both', description: 'Library the item lives in', get: (i) => i.libraryName },
  { key: 'year', label: 'Year', type: 'number', appliesTo: 'both', description: 'Release year', get: (i) => i.year },
  { key: 'ageDays', label: 'Age (days)', type: 'number', appliesTo: 'both', description: 'Days since the item was added to the library', get: (i, now) => intOrNull(daysSince(i.addedAt, now)) },
  { key: 'idleDays', label: 'Idle (days)', type: 'number', appliesTo: 'both', description: 'Days since last play; falls back to days since added when never played', get: (i, now) => intOrNull(daysSince(i.lastPlayedAt, now) ?? daysSince(i.addedAt, now)) },
  { key: 'playCount', label: 'Play count', type: 'number', appliesTo: 'both', description: 'Total plays (all users where the server supports it)', get: (i) => i.playCount },
  { key: 'watchProgressPct', label: 'Watch progress (%)', type: 'number', appliesTo: 'both', requires: 'watchProgress', description: 'Furthest watch progress, 0–100', get: (i) => (i.watchProgress == null ? null : Math.round(i.watchProgress * 100)) },
  { key: 'ratingAudience', label: 'Audience rating', type: 'number', appliesTo: 'both', description: '0–10; unknown never matches', get: (i) => i.ratingAudience },
  { key: 'ratingCritic', label: 'Critic rating', type: 'number', appliesTo: 'both', description: '0–10; unknown never matches', get: (i) => i.ratingCritic },
  { key: 'sizeGb', label: 'Size (GB)', type: 'number', appliesTo: 'both', description: 'Total size on disk in GB', get: (i) => round1(Number(i.sizeBytes) / GB) },
  { key: 'gbPerPlay', label: 'GB per play', type: 'number', appliesTo: 'both', description: 'Size divided by plays (whole size when never played) — cost of shelf-warmers', get: (i) => round1(Number(i.sizeBytes) / GB / Math.max(i.playCount, 1)) },
  { key: 'resolution', label: 'Resolution', type: 'enum', appliesTo: 'both', enumValues: ['sd', '720', '1080', '4k'], description: 'Best available video resolution', get: (i) => i.resolution },
  { key: 'versionCount', label: 'Version count', type: 'number', appliesTo: 'both', requires: 'multiVersion', description: 'Distinct file versions of this item', get: (i) => i.versionCount },
  { key: 'labels', label: 'Labels/tags', type: 'labels', appliesTo: 'both', requires: 'labels', description: 'Labels (Plex) or tags (Jellyfin) on the item', get: (i) => i.labels },
  { key: 'seriesStatus', label: 'Series status', type: 'enum', appliesTo: 'show', enumValues: ['ended', 'continuing'], description: 'Whether the show is over (unknown on Plex)', get: (i) => i.seriesStatus },
  { key: 'episodeCount', label: 'Episode count', type: 'number', appliesTo: 'show', description: 'Episodes on disk', get: (i) => i.episodeCount },
  { key: 'watchedPct', label: 'Watched episodes (%)', type: 'number', appliesTo: 'show', description: 'Share of episodes watched, 0–100', get: (i) => (i.episodeCount ? Math.round(((i.watchedEpisodeCount ?? 0) / i.episodeCount) * 100) : null) },
  { key: 'daysSinceLastEpisode', label: 'Days since new episode', type: 'number', appliesTo: 'show', description: 'Days since an episode was last added', get: (i, now) => intOrNull(daysSince(i.lastEpisodeAddedAt, now)) },
];

export const FIELD_BY_KEY = new Map(CUSTOM_RULE_FIELDS.map((f) => [f.key, f]));

export const OPERATORS_BY_TYPE: Record<FieldType, { key: string; label: string }[]> = {
  number: [
    { key: 'eq', label: '=' },
    { key: 'neq', label: '≠' },
    { key: 'lt', label: '<' },
    { key: 'lte', label: '≤' },
    { key: 'gt', label: '>' },
    { key: 'gte', label: '≥' },
  ],
  string: [
    { key: 'is', label: 'is' },
    { key: 'contains', label: 'contains' },
    { key: 'startsWith', label: 'starts with' },
  ],
  enum: [
    { key: 'is', label: 'is' },
    { key: 'isNot', label: 'is not' },
  ],
  labels: [
    { key: 'has', label: 'has' },
    { key: 'lacks', label: 'lacks' },
  ],
};

export function operatorValid(field: FieldDef, operator: string): boolean {
  return OPERATORS_BY_TYPE[field.type].some((o) => o.key === operator);
}

interface ConditionResult {
  matched: boolean;
  /** Human summary with the actual value, e.g. 'Age (days): 212 > 180'. */
  summary: string;
}

function evaluateCondition(cond: CustomRuleCondition, item: MediaItem, now: Date): ConditionResult {
  const field = FIELD_BY_KEY.get(cond.field);
  if (!field) return { matched: false, summary: `unknown field '${cond.field}'` };
  const actual = field.get(item, now);
  if (actual == null) return { matched: false, summary: `${field.label} unknown` };

  let matched = false;
  switch (field.type) {
    case 'number': {
      const a = Number(actual);
      const v = Number(cond.value);
      matched =
        (cond.operator === 'eq' && a === v) ||
        (cond.operator === 'neq' && a !== v) ||
        (cond.operator === 'lt' && a < v) ||
        (cond.operator === 'lte' && a <= v) ||
        (cond.operator === 'gt' && a > v) ||
        (cond.operator === 'gte' && a >= v);
      break;
    }
    case 'string': {
      const a = String(actual).toLowerCase();
      const v = String(cond.value).toLowerCase();
      matched =
        (cond.operator === 'is' && a === v) ||
        (cond.operator === 'contains' && a.includes(v)) ||
        (cond.operator === 'startsWith' && a.startsWith(v));
      break;
    }
    case 'enum': {
      matched =
        (cond.operator === 'is' && actual === cond.value) ||
        (cond.operator === 'isNot' && actual !== cond.value);
      break;
    }
    case 'labels': {
      const list = (actual as string[]).map((l) => l.toLowerCase());
      const has = list.includes(String(cond.value).toLowerCase());
      matched = cond.operator === 'has' ? has : !has;
      break;
    }
  }

  const opLabel =
    OPERATORS_BY_TYPE[field.type].find((o) => o.key === cond.operator)?.label ?? cond.operator;
  const actualText = Array.isArray(actual) ? `[${actual.join(', ')}]` : String(actual);
  return { matched, summary: `${field.label}: ${actualText} ${opLabel} ${cond.value}` };
}

/**
 * Evaluate one custom rule against one item. Returns null when the rule does
 * not apply (wrong media type, missing capability, no conditions) or did not
 * match; otherwise the points and an auto-generated reason listing the
 * conditions that matched.
 */
export function evaluateCustomRule(
  rule: Pick<CustomRule, 'appliesTo' | 'match' | 'conditions' | 'points'>,
  item: MediaItem,
  capabilities: ProviderCapabilities,
  now: Date,
): RuleMatch | null {
  if (rule.conditions.length === 0) return null;
  if (rule.appliesTo !== 'both' && item.type !== rule.appliesTo) return null;
  for (const cond of rule.conditions) {
    const field = FIELD_BY_KEY.get(cond.field);
    if (!field) return null;
    if (field.requires && !capabilities[field.requires]) return null;
  }

  const results = rule.conditions.map((c) => evaluateCondition(c, item, now));
  const matched = rule.match === 'all' ? results.every((r) => r.matched) : results.some((r) => r.matched);
  if (!matched) return null;

  const reason = results
    .filter((r) => r.matched)
    .map((r) => r.summary)
    .join('; ');
  return { points: rule.points, reason };
}

function intOrNull(v: number | null): number | null {
  return v == null ? null : Math.floor(v);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
