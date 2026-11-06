import { describe, expect, it } from 'vitest';
import { seededShuffle } from '~/assessment/shuffle';

describe('seededShuffle', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  it('is a permutation and leaves the input untouched', () => {
    const out = seededShuffle(items, 'Q-1.5-x:choices');
    expect([...out].sort()).toEqual(items);
    expect(items).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('gives the same order for the same key, every time', () => {
    expect(seededShuffle(items, 'k')).toEqual(seededShuffle(items, 'k'));
  });
  it('moves the first item off the first place for most keys', () => {
    // authors put the correct choice first; over many questions it must not stay there
    const keys = Array.from({ length: 200 }, (_, i) => `Q-1.${i}-q:choices`);
    const stayed = keys.filter((k) => seededShuffle(items, k)[0] === 'a').length;
    expect(stayed / keys.length).toBeLessThan(0.35);
  });
});
