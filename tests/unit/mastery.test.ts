import { describe, expect, it } from 'vitest';
import { misconceptionStatus, objectiveMastery, wrongAnswerKind } from '~/progress/mastery';
import type { Attempt } from '~/progress/store';

let clock = 0;
const att = (over: Partial<Attempt>): Attempt => ({
  qid: 'Q-1.5-a',
  lesson: '1.5',
  kind: 'check',
  objectives: ['OBJ-1.5-1'],
  probes: [],
  misconception: null,
  correct: true,
  confident: null,
  hints: 0,
  at: ++clock,
  ...over,
});

describe('objective mastery', () => {
  it('is "none" without attempts', () => {
    expect(objectiveMastery([], 'OBJ-1.5-1').level).toBe('none');
  });
  it('needs three attempts with the last two correct', () => {
    const two = [att({}), att({})];
    expect(objectiveMastery(two, 'OBJ-1.5-1').level).toBe('learning');
    const three = [att({ correct: false }), att({}), att({})];
    expect(objectiveMastery(three, 'OBJ-1.5-1').level).toBe('mastered');
    const lastWrong = [att({}), att({}), att({ correct: false })];
    expect(objectiveMastery(lastWrong, 'OBJ-1.5-1').level).toBe('learning');
  });
  it('weights recent answers more and penalises hints', () => {
    const early = objectiveMastery([att({}), att({ correct: false })], 'OBJ-1.5-1').score;
    const late = objectiveMastery([att({ correct: false }), att({})], 'OBJ-1.5-1').score;
    expect(late).toBeGreaterThan(early);
    const hinted = objectiveMastery([att({ hints: 2 })], 'OBJ-1.5-1').score;
    expect(hinted).toBeLessThan(1);
  });
});

describe('misconceptions', () => {
  it('a confident wrong answer activates the misconception at once', () => {
    const s = misconceptionStatus([att({ correct: false, misconception: 'MC-x', confident: true })]);
    expect(s[0]).toMatchObject({ id: 'MC-x', active: true });
  });
  it('an unsure wrong answer needs to recur', () => {
    const once = misconceptionStatus([att({ correct: false, misconception: 'MC-x', confident: false })]);
    expect(once[0].active).toBe(false);
    const twice = misconceptionStatus([
      att({ correct: false, misconception: 'MC-x', confident: false }),
      att({ correct: false, misconception: 'MC-x', confident: false }),
    ]);
    expect(twice[0].active).toBe(true);
  });
  it('two correct answers to probing questions clear it', () => {
    const s = misconceptionStatus([
      att({ correct: false, misconception: 'MC-x', confident: true }),
      att({ probes: ['MC-x'] }),
      att({ probes: ['MC-x'] }),
    ]);
    expect(s[0].active).toBe(false);
  });
  it('wrong + sure is a misconception, wrong + unsure a gap', () => {
    expect(wrongAnswerKind(att({ correct: false, confident: true }))).toBe('misconception');
    expect(wrongAnswerKind(att({ correct: false, confident: false }))).toBe('gap');
    expect(wrongAnswerKind(att({}))).toBeNull();
  });
});
