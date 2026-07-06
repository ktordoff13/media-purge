import { CleanupRule, daysSince, gb, RuleContext, RuleMatch } from '../rule.interface';
import { MediaItem } from '../../database/entities/media-item.entity';

const neverWatched: CleanupRule = {
  key: 'never-watched',
  name: 'Never watched, aging',
  description:
    'Nobody has ever played this and it has been in the library longer than the threshold. The core dead-weight detector.',
  defaultParams: { minAgeDays: 365, points: 40 },
  evaluate(item: MediaItem, ctx: RuleContext): RuleMatch | null {
    const age = daysSince(item.addedAt, ctx.now);
    if (item.playCount > 0 || age == null || age < ctx.params.minAgeDays) return null;
    return {
      points: ctx.params.points,
      reason: `Never played in ${Math.floor(age)} days since it was added`,
    };
  },
};

const watchedLongAgo: CleanupRule = {
  key: 'watched-long-ago',
  name: 'Watched long ago, never rewatched',
  description: 'It was watched, but the last play is older than the threshold — unlikely to be rewatched.',
  defaultParams: { minDaysSincePlay: 730, points: 25 },
  evaluate(item, ctx) {
    if (item.playCount === 0) return null;
    const idle = daysSince(item.lastPlayedAt, ctx.now);
    if (idle == null || idle < ctx.params.minDaysSincePlay) return null;
    return {
      points: ctx.params.points,
      reason: `Last played ${Math.floor(idle)} days ago and never rewatched`,
    };
  },
};

const abandonedWatch: CleanupRule = {
  key: 'abandoned-watch',
  name: 'Started but abandoned',
  description:
    'Someone started it, got less than the threshold through, and has not come back — you tried it and gave up.',
  defaultParams: { maxProgressPct: 50, minIdleDays: 180, points: 20 },
  requires: ['watchProgress'],
  evaluate(item, ctx) {
    if (item.watchProgress == null || item.watchProgress <= 0) return null;
    if (item.watchProgress * 100 >= ctx.params.maxProgressPct) return null;
    const idle = daysSince(item.lastPlayedAt, ctx.now);
    if (idle == null || idle < ctx.params.minIdleDays) return null;
    return {
      points: ctx.params.points,
      reason: `Abandoned at ${Math.round(item.watchProgress * 100)}% watched, idle for ${Math.floor(idle)} days`,
    };
  },
};

const bigAndUnloved: CleanupRule = {
  key: 'big-and-unloved',
  name: 'Big and unloved',
  description:
    'A large file with at most one play. Surfaces the huge remuxes where deleting a single item frees serious space.',
  defaultParams: { minSizeGb: 15, maxPlays: 1, points: 20 },
  evaluate(item, ctx) {
    if (item.sizeBytes < ctx.params.minSizeGb * 1024 ** 3) return null;
    if (item.playCount > ctx.params.maxPlays) return null;
    return {
      points: ctx.params.points,
      reason: `${gb(item.sizeBytes)} with ${item.playCount === 0 ? 'no plays' : 'only one play'}`,
    };
  },
};

const duplicateVersions: CleanupRule = {
  key: 'duplicate-versions',
  name: 'Duplicate versions',
  description:
    'The server holds multiple file versions of this item; all but the best copy are pure overhead.',
  defaultParams: { points: 30 },
  requires: ['multiVersion'],
  evaluate(item, ctx) {
    if (item.versionCount < 2) return null;
    return {
      points: ctx.params.points,
      reason: `${item.versionCount} copies on disk — keep the best, drop the rest`,
    };
  },
};

const lowQualityObsolete: CleanupRule = {
  key: 'low-quality-obsolete',
  name: 'Low quality, unwatched',
  description:
    'SD/720p copy nobody has played in the threshold window — delete, or re-acquire in better quality.',
  defaultParams: { minIdleDays: 365, points: 15 },
  evaluate(item, ctx) {
    if (item.resolution !== 'sd' && item.resolution !== '720') return null;
    const idle = daysSince(item.lastPlayedAt, ctx.now);
    const age = daysSince(item.addedAt, ctx.now);
    const relevant = idle ?? age;
    if (relevant == null || relevant < ctx.params.minIdleDays) return null;
    return {
      points: ctx.params.points,
      reason: `${item.resolution === 'sd' ? 'SD' : '720p'} quality and untouched for ${Math.floor(relevant)} days`,
    };
  },
};

const endedFinishedSeries: CleanupRule = {
  key: 'ended-finished-series',
  name: 'Ended & fully watched series',
  description:
    'The show is over, you finished it, and nobody has returned since the threshold. (Where the server does not report ended/continuing, a show with no new episodes in twice the threshold counts as ended.)',
  defaultParams: { minIdleDays: 365, minWatchedPct: 90, points: 25 },
  evaluate(item, ctx) {
    if (item.type !== 'show' || item.episodeCount == null || item.episodeCount === 0) return null;
    const watchedPct = ((item.watchedEpisodeCount ?? 0) / item.episodeCount) * 100;
    if (watchedPct < ctx.params.minWatchedPct) return null;
    const idle = daysSince(item.lastPlayedAt, ctx.now);
    if (idle == null || idle < ctx.params.minIdleDays) return null;
    const ended =
      item.seriesStatus === 'ended' ||
      (item.seriesStatus == null &&
        (daysSince(item.lastEpisodeAddedAt, ctx.now) ?? 0) > ctx.params.minIdleDays * 2);
    if (!ended) return null;
    return {
      points: ctx.params.points,
      reason: `Series is over, ${Math.round(watchedPct)}% watched, last played ${Math.floor(idle)} days ago`,
    };
  },
};

const poorlyRatedUnwatched: CleanupRule = {
  key: 'poorly-rated-unwatched',
  name: 'Poorly rated, never watched',
  description: 'Rated below the threshold and nobody ever pressed play. Cut your losses.',
  defaultParams: { maxRating: 6, points: 15 },
  evaluate(item, ctx) {
    if (item.playCount > 0) return null;
    const rating = item.ratingAudience ?? item.ratingCritic;
    if (rating == null || rating >= ctx.params.maxRating) return null;
    return {
      points: ctx.params.points,
      reason: `Rated ${rating.toFixed(1)}/10 and never played`,
    };
  },
};

const staleGrowingSeries: CleanupRule = {
  key: 'stale-growing-series',
  name: 'Growing series nobody watches',
  description:
    'New episodes keep landing but nobody has watched the show within the threshold — dead weight that keeps getting bigger.',
  defaultParams: { minIdleDays: 365, maxDaysSinceNewEpisode: 90, points: 30 },
  evaluate(item, ctx) {
    if (item.type !== 'show') return null;
    const newEp = daysSince(item.lastEpisodeAddedAt, ctx.now);
    if (newEp == null || newEp > ctx.params.maxDaysSinceNewEpisode) return null;
    const idle = daysSince(item.lastPlayedAt, ctx.now) ?? daysSince(item.addedAt, ctx.now);
    if (idle == null || idle < ctx.params.minIdleDays) return null;
    return {
      points: ctx.params.points,
      reason: `Still growing (episode added ${Math.floor(newEp)} days ago) but unwatched for ${Math.floor(idle)} days`,
    };
  },
};

/** All shipped rules, in display order. */
export const ALL_RULES: CleanupRule[] = [
  neverWatched,
  watchedLongAgo,
  abandonedWatch,
  bigAndUnloved,
  duplicateVersions,
  lowQualityObsolete,
  endedFinishedSeries,
  poorlyRatedUnwatched,
  staleGrowingSeries,
];
