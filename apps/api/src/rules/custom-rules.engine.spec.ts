import { evaluateCustomRule } from './custom-rules.engine';
import { MediaItem } from '../database/entities/media-item.entity';
import { ProviderCapabilities } from '../providers/media-server-provider.interface';

const NOW = new Date('2026-07-07T12:00:00Z');
const DAY = 86_400_000;
const GB = 1024 ** 3;

const FULL_CAPS: ProviderCapabilities = {
  perUserHistory: true,
  labels: true,
  multiVersion: true,
};

function item(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    type: 'movie',
    title: 'Some Movie',
    year: 2018,
    libraryName: 'Movies',
    addedAt: new Date(NOW.getTime() - 400 * DAY),
    lastPlayedAt: null,
    playCount: 0,
    ratingCritic: null,
    ratingAudience: 5.5,
    filePaths: [],
    sizeBytes: 20 * GB,
    resolution: '1080',
    versionCount: 1,
    labels: ['4k-upgrade'],
    seriesStatus: null,
    episodeCount: null,
    watchedEpisodeCount: null,
    lastEpisodeAddedAt: null,
    ...overrides,
  } as MediaItem;
}

describe('evaluateCustomRule', () => {
  it('matches ALL conditions and explains with actual values', () => {
    const match = evaluateCustomRule(
      {
        appliesTo: 'both',
        match: 'all',
        points: 30,
        conditions: [
          { field: 'playCount', operator: 'eq', value: 0 },
          { field: 'ageDays', operator: 'gt', value: 180 },
          { field: 'sizeGb', operator: 'gte', value: 15 },
        ],
      },
      item(),
      FULL_CAPS,
      NOW,
    );
    expect(match?.points).toBe(30);
    expect(match?.reason).toContain('Play count: 0 = 0');
    expect(match?.reason).toContain('Age (days): 400 > 180');
    expect(match?.reason).toContain('Size (GB): 20 ≥ 15');
  });

  it('ALL fails when one condition fails; ANY succeeds on one match', () => {
    const conditions = [
      { field: 'playCount', operator: 'gt', value: 5 }, // fails (0 plays)
      { field: 'sizeGb', operator: 'gte', value: 15 }, // matches
    ];
    const base = { appliesTo: 'both' as const, points: 10, conditions };
    expect(evaluateCustomRule({ ...base, match: 'all' }, item(), FULL_CAPS, NOW)).toBeNull();
    const any = evaluateCustomRule({ ...base, match: 'any' }, item(), FULL_CAPS, NOW);
    expect(any).not.toBeNull();
    expect(any?.reason).toBe('Size (GB): 20 ≥ 15'); // only the matched condition is cited
  });

  it('unknown values never match (null semantics)', () => {
    const rule = {
      appliesTo: 'both' as const,
      match: 'all' as const,
      points: 10,
      conditions: [{ field: 'ratingCritic', operator: 'lt', value: 6 }],
    };
    // ratingCritic is null → "rating < 6" must NOT catch the unrated item
    expect(evaluateCustomRule(rule, item({ ratingCritic: null }), FULL_CAPS, NOW)).toBeNull();
    expect(evaluateCustomRule(rule, item({ ratingCritic: 4 }), FULL_CAPS, NOW)).not.toBeNull();
  });

  it('skips items from sources lacking a required capability', () => {
    const rule = {
      appliesTo: 'both' as const,
      match: 'all' as const,
      points: 10,
      conditions: [{ field: 'versionCount', operator: 'gt', value: 1 }],
    };
    const limitedCaps = { ...FULL_CAPS, multiVersion: false };
    const duped = item({ versionCount: 2 });
    expect(evaluateCustomRule(rule, duped, limitedCaps, NOW)).toBeNull();
    expect(evaluateCustomRule(rule, duped, FULL_CAPS, NOW)).not.toBeNull();
  });

  it('respects appliesTo media type', () => {
    const rule = {
      appliesTo: 'show' as const,
      match: 'all' as const,
      points: 10,
      conditions: [{ field: 'playCount', operator: 'eq', value: 0 }],
    };
    expect(evaluateCustomRule(rule, item(), FULL_CAPS, NOW)).toBeNull();
    expect(evaluateCustomRule(rule, item({ type: 'show' }), FULL_CAPS, NOW)).not.toBeNull();
  });

  it('string, enum, and label operators work case-insensitively', () => {
    const it1 = item({ libraryName: 'Kids Movies', resolution: 'sd' });
    const ok = (conditions: { field: string; operator: string; value: string | number }[]) =>
      evaluateCustomRule({ appliesTo: 'both', match: 'all', points: 5, conditions }, it1, FULL_CAPS, NOW);
    expect(ok([{ field: 'libraryName', operator: 'contains', value: 'kids' }])).not.toBeNull();
    expect(ok([{ field: 'libraryName', operator: 'startsWith', value: 'Kids' }])).not.toBeNull();
    expect(ok([{ field: 'resolution', operator: 'is', value: 'sd' }])).not.toBeNull();
    expect(ok([{ field: 'resolution', operator: 'isNot', value: '4k' }])).not.toBeNull();
    expect(ok([{ field: 'labels', operator: 'has', value: '4K-Upgrade' }])).not.toBeNull();
    expect(ok([{ field: 'labels', operator: 'lacks', value: 'keep' }])).not.toBeNull();
  });

  it('gbPerPlay uses whole size when never played', () => {
    const rule = {
      appliesTo: 'both' as const,
      match: 'all' as const,
      points: 10,
      conditions: [{ field: 'gbPerPlay', operator: 'gte', value: 10 }],
    };
    expect(evaluateCustomRule(rule, item({ playCount: 0 }), FULL_CAPS, NOW)).not.toBeNull();
    expect(evaluateCustomRule(rule, item({ playCount: 4 }), FULL_CAPS, NOW)).toBeNull(); // 5 GB/play
  });

  it('never matches with zero conditions', () => {
    expect(
      evaluateCustomRule({ appliesTo: 'both', match: 'all', points: 99, conditions: [] }, item(), FULL_CAPS, NOW),
    ).toBeNull();
  });
});
