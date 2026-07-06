import { MediaItem } from '../database/entities/media-item.entity';
import { ProviderCapabilities } from '../providers/media-server-provider.interface';

export interface RuleContext {
  now: Date;
  /** Capabilities of the provider the item came from. */
  capabilities: ProviderCapabilities;
  /** Effective params: rule defaults overridden by user config. */
  params: Record<string, number>;
}

export interface RuleMatch {
  points: number;
  /** Human-readable justification shown in the UI and stored in the audit log. */
  reason: string;
}

/**
 * A cleanup heuristic. Rules are pure functions of a media item snapshot —
 * no I/O — which keeps them trivially unit-testable.
 */
export interface CleanupRule {
  /** Stable key; changing it orphans stored configs. */
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly defaultParams: Record<string, number>;
  /** Capabilities the item's provider must have for this rule to apply. */
  readonly requires?: (keyof ProviderCapabilities)[];

  evaluate(item: MediaItem, ctx: RuleContext): RuleMatch | null;
}

export function daysSince(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return (now.getTime() - new Date(date).getTime()) / 86_400_000;
}

export function gb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1) + ' GB';
}
