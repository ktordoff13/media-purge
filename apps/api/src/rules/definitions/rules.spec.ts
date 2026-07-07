import { ALL_RULES } from './index';
import { CleanupRule, RuleContext } from '../rule.interface';
import { MediaItem } from '../../database/entities/media-item.entity';

const NOW = new Date('2026-07-06T12:00:00Z');
const DAY = 86_400_000;
const GB = 1024 ** 3;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

/** A healthy, recently watched 1080p movie that should match nothing. */
function movie(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 1,
    scanId: 1,
    sourceId: 1,
    providerItemId: 'x',
    libraryId: '1',
    libraryName: 'Movies',
    type: 'movie',
    title: 'Test Movie',
    year: 2020,
    addedAt: daysAgo(30),
    lastPlayedAt: daysAgo(10),
    playCount: 3,
    ratingCritic: 8,
    ratingAudience: 8.5,
    filePaths: ['/data/movies/test.mkv'],
    sizeBytes: 4 * GB,
    resolution: '1080',
    versionCount: 1,
    externalIds: {},
    labels: [],
    seriesStatus: null,
    episodeCount: null,
    watchedEpisodeCount: null,
    lastEpisodeAddedAt: null,
    thumbPath: null,
    providerData: null,
    ...overrides,
  } as MediaItem;
}

function show(overrides: Partial<MediaItem> = {}): MediaItem {
  return movie({
    type: 'show',
    title: 'Test Show',
    episodeCount: 20,
    watchedEpisodeCount: 20,
    seriesStatus: 'continuing',
    lastEpisodeAddedAt: daysAgo(10),
    sizeBytes: 40 * GB,
    ...overrides,
  });
}

function ctxFor(rule: CleanupRule, params: Record<string, number> = {}): RuleContext {
  return {
    now: NOW,
    capabilities: { perUserHistory: true, labels: true, multiVersion: true },
    params: { ...rule.defaultParams, ...params },
  };
}

function rule(key: string): CleanupRule {
  const r = ALL_RULES.find((r) => r.key === key);
  if (!r) throw new Error(`missing rule ${key}`);
  return r;
}

describe('rule engine definitions', () => {
  it('a healthy, recently watched item matches no rule', () => {
    for (const r of ALL_RULES) {
      expect(r.evaluate(movie(), ctxFor(r))).toBeNull();
    }
  });

  describe('never-watched', () => {
    const r = rule('never-watched');
    it('matches an unplayed item older than the threshold', () => {
      const m = movie({ playCount: 0, addedAt: daysAgo(400) });
      expect(r.evaluate(m, ctxFor(r))?.points).toBe(40);
    });
    it('ignores unplayed items younger than the threshold', () => {
      expect(r.evaluate(movie({ playCount: 0, addedAt: daysAgo(100) }), ctxFor(r))).toBeNull();
    });
    it('ignores items with plays and items without addedAt', () => {
      expect(r.evaluate(movie({ playCount: 2, addedAt: daysAgo(400) }), ctxFor(r))).toBeNull();
      expect(r.evaluate(movie({ playCount: 0, addedAt: null }), ctxFor(r))).toBeNull();
    });
    it('respects a tuned threshold', () => {
      const m = movie({ playCount: 0, addedAt: daysAgo(100) });
      expect(r.evaluate(m, ctxFor(r, { minAgeDays: 90 }))).not.toBeNull();
    });
  });

  describe('watched-long-ago', () => {
    const r = rule('watched-long-ago');
    it('matches items whose last play is beyond the threshold', () => {
      const m = movie({ playCount: 1, lastPlayedAt: daysAgo(800) });
      expect(r.evaluate(m, ctxFor(r))).not.toBeNull();
    });
    it('ignores never-played items (that is never-watched territory)', () => {
      expect(r.evaluate(movie({ playCount: 0, lastPlayedAt: null }), ctxFor(r))).toBeNull();
    });
  });

  describe('big-and-unloved', () => {
    const r = rule('big-and-unloved');
    it('matches a large file with one play', () => {
      const m = movie({ sizeBytes: 20 * GB, playCount: 1 });
      expect(r.evaluate(m, ctxFor(r))).not.toBeNull();
    });
    it('ignores well-loved large files and small files', () => {
      expect(r.evaluate(movie({ sizeBytes: 20 * GB, playCount: 5 }), ctxFor(r))).toBeNull();
      expect(r.evaluate(movie({ sizeBytes: 2 * GB, playCount: 0, addedAt: daysAgo(10) }), ctxFor(r))).toBeNull();
    });
  });

  describe('duplicate-versions', () => {
    const r = rule('duplicate-versions');
    it('matches items with more than one version', () => {
      expect(r.evaluate(movie({ versionCount: 2 }), ctxFor(r))?.reason).toContain('2 copies');
    });
    it('declares the multiVersion capability requirement', () => {
      expect(r.requires).toContain('multiVersion');
    });
  });

  describe('low-quality-obsolete', () => {
    const r = rule('low-quality-obsolete');
    it('matches an idle SD copy', () => {
      const m = movie({ resolution: 'sd', lastPlayedAt: daysAgo(400) });
      expect(r.evaluate(m, ctxFor(r))).not.toBeNull();
    });
    it('falls back to age when the item was never played', () => {
      const m = movie({ resolution: '720', playCount: 0, lastPlayedAt: null, addedAt: daysAgo(400) });
      expect(r.evaluate(m, ctxFor(r))).not.toBeNull();
    });
    it('ignores 1080p/4k copies', () => {
      expect(r.evaluate(movie({ resolution: '4k', lastPlayedAt: daysAgo(900) }), ctxFor(r))).toBeNull();
    });
  });

  describe('ended-finished-series', () => {
    const r = rule('ended-finished-series');
    it('matches an ended, fully watched, long-idle show', () => {
      const s = show({ seriesStatus: 'ended', lastPlayedAt: daysAgo(400) });
      expect(r.evaluate(s, ctxFor(r))).not.toBeNull();
    });
    it('treats a show with no new episodes in 2x threshold as ended when status is unknown (Plex)', () => {
      const s = show({ seriesStatus: null, lastPlayedAt: daysAgo(400), lastEpisodeAddedAt: daysAgo(800) });
      expect(r.evaluate(s, ctxFor(r))).not.toBeNull();
    });
    it('ignores partially watched or recently watched shows', () => {
      expect(r.evaluate(show({ seriesStatus: 'ended', watchedEpisodeCount: 5, lastPlayedAt: daysAgo(400) }), ctxFor(r))).toBeNull();
      expect(r.evaluate(show({ seriesStatus: 'ended', lastPlayedAt: daysAgo(30) }), ctxFor(r))).toBeNull();
    });
  });

  describe('poorly-rated-unwatched', () => {
    const r = rule('poorly-rated-unwatched');
    it('matches a low-rated never-played item', () => {
      const m = movie({ playCount: 0, ratingAudience: 4.2 });
      expect(r.evaluate(m, ctxFor(r))?.reason).toContain('4.2');
    });
    it('falls back to critic rating and ignores unrated items', () => {
      expect(r.evaluate(movie({ playCount: 0, ratingAudience: null, ratingCritic: 3 }), ctxFor(r))).not.toBeNull();
      expect(r.evaluate(movie({ playCount: 0, ratingAudience: null, ratingCritic: null }), ctxFor(r))).toBeNull();
    });
  });

  describe('stale-growing-series', () => {
    const r = rule('stale-growing-series');
    it('matches a still-growing show nobody watches', () => {
      const s = show({ lastPlayedAt: daysAgo(400), lastEpisodeAddedAt: daysAgo(5), watchedEpisodeCount: 3 });
      expect(r.evaluate(s, ctxFor(r))).not.toBeNull();
    });
    it('uses addedAt when the show was never played at all', () => {
      const s = show({ playCount: 0, lastPlayedAt: null, addedAt: daysAgo(500), lastEpisodeAddedAt: daysAgo(5) });
      expect(r.evaluate(s, ctxFor(r))).not.toBeNull();
    });
    it('ignores shows that stopped growing or are actively watched', () => {
      expect(r.evaluate(show({ lastPlayedAt: daysAgo(400), lastEpisodeAddedAt: daysAgo(200) }), ctxFor(r))).toBeNull();
      expect(r.evaluate(show({ lastPlayedAt: daysAgo(30), lastEpisodeAddedAt: daysAgo(5) }), ctxFor(r))).toBeNull();
    });
  });
});
