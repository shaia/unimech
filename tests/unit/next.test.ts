import { describe, expect, it } from 'vitest';
import { nextStep, type NextInput, type NextLesson } from '~/progress/next';
import { emptyProgress, type Attempt, type ProgressState } from '~/progress/store';

const lessons: NextLesson[] = [
  { id: '1.1', title: 'א', href: '/l/1-1/', objectives: ['OBJ-1.1-1'] },
  { id: '1.2', title: 'ב', href: '/l/1-2/', objectives: ['OBJ-1.2-1'] },
];
const remedies = { 'MC-x': { title: 'ניסוי', href: '/l/1-1/#fig' } };
const base = (state: ProgressState): NextInput => ({ lessons, state, remedies, practiceHref: '/p/', testHref: '/t/' });

const att = (o: Partial<Attempt>): Attempt => ({
  qid: 'q', lesson: null, kind: 'check', objectives: ['OBJ-1.1-1'], probes: [], misconception: null,
  correct: true, confident: null, hints: 0, at: 1, ...o,
});

describe('nextStep', () => {
  it('starts the first lesson for a new learner', () => {
    expect(nextStep(base(emptyProgress()))).toMatchObject({ kind: 'start', href: '/l/1-1/' });
  });

  it('continues a lesson that was started but not finished', () => {
    const s = { ...emptyProgress(), lessons: { '1.1': { visited: 1, completed: 2 }, '1.2': { visited: 3 } } };
    expect(nextStep(base(s))).toMatchObject({ kind: 'continue', href: '/l/1-2/' });
  });

  it('sends a learner with an active misconception to its remedy first', () => {
    const wrong = (at: number) => att({ misconception: 'MC-x', correct: false, confident: true, at });
    const s = { ...emptyProgress(), attempts: [wrong(1)], lessons: { '1.1': { visited: 1 } } };
    expect(nextStep(base(s))).toMatchObject({ kind: 'remedy', href: '/l/1-1/#fig' });
  });

  it('suggests practice when every lesson is done but objectives are not mastered', () => {
    const s = { ...emptyProgress(), lessons: { '1.1': { visited: 1, completed: 2 }, '1.2': { visited: 3, completed: 4 } } };
    expect(nextStep(base(s))).toMatchObject({ kind: 'practice', href: '/p/' });
  });

  it('suggests the test once everything is mastered, then a new test', () => {
    const many = (o: string) => [1, 2, 3].map((at) => att({ objectives: [o], at }));
    const attempts = [...many('OBJ-1.1-1'), ...many('OBJ-1.2-1')];
    const done = { '1.1': { visited: 1, completed: 2 }, '1.2': { visited: 3, completed: 4 } };
    expect(nextStep(base({ ...emptyProgress(), lessons: done, attempts }))).toMatchObject({ kind: 'test', href: '/t/' });
    const after = [...attempts, att({ kind: 'test', at: 9 })];
    expect(nextStep(base({ ...emptyProgress(), lessons: done, attempts: after }))).toMatchObject({ kind: 'retest' });
  });
});
