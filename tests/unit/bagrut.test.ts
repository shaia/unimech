import { describe, expect, it } from 'vitest';
import { bagrutObjectives, gradeOpen, hintFactor, partId, partQuestion, partScore, totalPoints } from '~/assessment/bagrut';
import { grade, probesOf } from '~/assessment/check';
import { renderQuestion } from '~/assessment/render';
import type { BagrutQuestion, OpenPart } from '~/content.config';

const open: OpenPart = {
  type: 'open',
  label: 'ב',
  points: 8,
  standalone: true,
  objectives: ['OBJ-1.5-3'],
  pendingObjectives: [],
  prompt: 'חשבו $E$.',
  qualitative: false,
  level: 'basic',
  hints: ['רמז'],
  confidence: true,
  shuffle: true,
  solution: [{ kind: 'formula', text: '$E = kQ/r^2$' }],
  rubric: [
    { text: 'נוסחה', weight: 1 },
    { text: 'הצבה', weight: 1 },
    { text: 'תוצאה', weight: 2 },
  ],
  passMark: 0.75,
};

const q: BagrutQuestion = {
  id: 'Q-1-bagrut-9',
  type: 'bagrut',
  title: 'כותרת',
  prompt: 'תרחיש $Q$',
  qualitative: false,
  level: 'bagrut',
  hints: [],
  confidence: true,
  shuffle: true,
  objectives: [],
  parts: [
    {
      type: 'numeric',
      label: 'א',
      points: 6,
      standalone: true,
      objectives: ['OBJ-1.5-3'],
      pendingObjectives: [],
      prompt: 'מה $E$?',
      qualitative: false,
      level: 'basic',
      hints: [],
      confidence: true,
      shuffle: true,
      answer: 100,
      unit: 'N/C',
      tolerance: 0.03,
      correctFeedback: 'נכון',
      wrongFeedback: 'לא',
      commonWrong: [{ value: 10, feedback: 'שכחתם ריבוע', misconception: 'MC-field-linear-in-r' }],
    },
    open,
  ],
};

describe('bagrut parts', () => {
  it('grades an auto part as the question it wraps, under its own id', () => {
    const p = q.parts[0];
    if (p.type === 'open') throw new Error('part א should be numeric');
    const pq = partQuestion(q, p);
    expect(pq.id).toBe('Q-1-bagrut-9/א');
    expect(grade(pq, { type: 'numeric', value: 101 }).correct).toBe(true);
    expect(grade(pq, { type: 'numeric', value: 10 })).toMatchObject({ correct: false, misconception: 'MC-field-linear-in-r' });
  });

  it('refuses to grade the whole multi-part question at once', () => {
    expect(() => grade(q, { type: 'mc', choice: 0 })).toThrow(/parts/);
  });

  it('collects the objectives and probes of every part', () => {
    expect(bagrutObjectives(q)).toEqual(['OBJ-1.5-3']);
    expect(probesOf(q)).toEqual(['MC-field-linear-in-r']);
    expect(totalPoints(q)).toBe(14);
    expect(partId(q, open)).toBe('Q-1-bagrut-9/ב');
  });
});

describe('open part self-assessment', () => {
  it('weights the rubric and applies the pass mark', () => {
    expect(gradeOpen(open, [true, true, true])).toEqual({ fraction: 1, correct: true });
    expect(gradeOpen(open, [false, false, true])).toMatchObject({ fraction: 0.5, correct: false });
    expect(gradeOpen(open, [true, false, true])).toMatchObject({ fraction: 0.75, correct: true });
    expect(gradeOpen(open, [false, false, false])).toMatchObject({ fraction: 0, correct: false });
  });
});

describe('hints cost credit', () => {
  it('takes a quarter per hint down to 40%, as mastery does', () => {
    expect([0, 1, 2, 3, 4].map(hintFactor)).toEqual([1, 0.75, 0.5, 0.4, 0.4]);
    expect(partScore(8, 1, 0)).toBe(8);
    expect(partScore(8, 1, 1)).toBe(6);
    expect(partScore(8, 0.5, 2)).toBe(2);
    expect(partScore(8, 2, 0)).toBe(8);
  });
});

describe('build-time rendering', () => {
  it('renders TeX in the scenario, every part and the open part solution', () => {
    const r = renderQuestion(q);
    if (r.type !== 'bagrut') throw new Error('type changed');
    expect(r.prompt).toContain('katex');
    expect(r.parts[0].prompt).toContain('katex');
    const o = r.parts[1];
    if (o.type !== 'open') throw new Error('part ב should be open');
    expect(o.solution[0].text).toContain('katex');
    expect(o.prompt).toContain('katex');
    expect(o.rubric[0].text).toBe('נוסחה');
  });

  it('fails the build on broken TeX in a part, naming the part', () => {
    const bad = { ...q, parts: [{ ...q.parts[0], prompt: '$\frac{1$' }, open] } as BagrutQuestion;
    expect(() => renderQuestion(bad)).toThrow(/Q-1-bagrut-9\/א/);
  });
});
