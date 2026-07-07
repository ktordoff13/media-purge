import { aggregatePlexHistory } from './plex.provider';

describe('aggregatePlexHistory', () => {
  it('counts plays per item and tracks the most recent play across users', () => {
    const agg = aggregatePlexHistory([
      { ratingKey: '10', title: 'Movie A', type: 'movie', viewedAt: 100 },
      { ratingKey: '10', title: 'Movie A', type: 'movie', viewedAt: 300 }, // another user
      { ratingKey: '11', title: 'Movie B', type: 'movie', viewedAt: 200 },
    ]);
    expect(agg.byItem.get('10')).toEqual({ count: 2, last: 300 });
    expect(agg.byItem.get('11')).toEqual({ count: 1, last: 200 });
    expect(agg.byShow.size).toBe(0);
  });

  it('rolls episode plays up to the show and records watched episode keys', () => {
    const agg = aggregatePlexHistory([
      { ratingKey: '101', grandparentRatingKey: '50', title: 'S1E1', type: 'episode', viewedAt: 100 },
      { ratingKey: '102', grandparentRatingKey: '50', title: 'S1E2', type: 'episode', viewedAt: 500 },
      { ratingKey: '101', grandparentRatingKey: '50', title: 'S1E1', type: 'episode', viewedAt: 900 },
    ]);
    expect(agg.byShow.get('50')).toEqual({ count: 3, last: 900 });
    expect(agg.watchedEpisodeKeys).toEqual(new Set(['101', '102']));
  });

  it('handles empty history (endpoint unavailable fallback)', () => {
    const agg = aggregatePlexHistory([]);
    expect(agg.byItem.size).toBe(0);
    expect(agg.byShow.size).toBe(0);
    expect(agg.watchedEpisodeKeys.size).toBe(0);
  });
});
