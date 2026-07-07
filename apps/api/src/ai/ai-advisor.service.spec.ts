import { parseAdvisories } from './ai-advisor.service';

describe('parseAdvisories', () => {
  it('parses a clean JSON array', () => {
    const out = parseAdvisories('[{"id": 3, "note": "Cult classic — future you will cry."}]');
    expect(out).toEqual([{ id: 3, note: 'Cult classic — future you will cry.' }]);
  });

  it('tolerates markdown fences and surrounding prose', () => {
    const out = parseAdvisories(
      'Sure! Here are my picks:\n```json\n[{"id": 1, "note": "An Oscar winner!"}]\n```\nEnjoy!',
    );
    expect(out).toEqual([{ id: 1, note: 'An Oscar winner!' }]);
  });

  it('drops malformed entries but keeps valid ones', () => {
    const out = parseAdvisories(
      '[{"id": 1, "note": "keep me"}, {"id": "two", "note": "bad id"}, {"id": 3}, {"id": 4, "note": "  "}]',
    );
    expect(out).toEqual([{ id: 1, note: 'keep me' }]);
  });

  it('returns empty on garbage, empty arrays, and non-arrays', () => {
    expect(parseAdvisories('I could not find anything noteworthy.')).toEqual([]);
    expect(parseAdvisories('[]')).toEqual([]);
    expect(parseAdvisories('{"id": 1, "note": "object not array"}')).toEqual([]);
    expect(parseAdvisories('[{broken json')).toEqual([]);
  });
});
