import { describe, expect, it } from 'vitest';
import { seededShuffle } from '~/assessment/shuffle';
import { renderQuestion } from '~/assessment/render';
import { grade } from '~/assessment/check';
import type { Question } from '~/content.config';

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

describe('rank questions', () => {
  // authors list the items in the key's order; the learner starts from the rendered order
  const rank = (id: string, shuffle = true) =>
    ({
      id,
      type: 'rank',
      objectives: ['OBJ-1.1-1'],
      level: 'mid',
      prompt: 'p',
      hints: [],
      confidence: true,
      shuffle,
      items: ['A', 'B', 'C'].map((x) => ({ id: x, label: x })),
      order: ['A', 'B', 'C'],
      correctFeedback: 'c',
      wrongFeedback: 'w',
    }) as unknown as Question;
  const startOrder = (q: Question) => (renderQuestion(q) as Extract<Question, { type: 'rank' }>).items.map((i) => i.id);

  it('never start on the key, whatever the seed or the shuffle flag', () => {
    for (let i = 0; i < 200; i++) expect(startOrder(rank(`Q-3.1-r${i}`))).not.toEqual(['A', 'B', 'C']);
    expect(startOrder(rank('Q-3.1-fixed', false))).not.toEqual(['A', 'B', 'C']);
  });
  it('still grade the key as correct after the shuffle', () => {
    const q = renderQuestion(rank('Q-3.1-r7'));
    expect(grade(q, { type: 'rank', order: ['A', 'B', 'C'], tied: [false, false] }).correct).toBe(true);
  });
});
