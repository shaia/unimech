/**
 * Bagrut-style multi-part questions: helpers shared by the grader, the renderer, the UI and the
 * chapter test. A part is either one of the auto-graded kinds (it is turned into an ordinary
 * question and graded by `grade`) or an open part, graded by the student against a model
 * solution and a rubric (`gradeOpen`).
 */

import type { AutoPart, BagrutQuestion, OpenPart, Part, Question } from '~/content.config';

/** Every question kind that a card can grade on its own: all but the multi-part wrapper. */
export type Simple = Exclude<Question, { type: 'bagrut' }>;

export const partId = (q: { id: string }, p: Part) => `${q.id}/${p.label}`;

export const isOpen = (p: Part): p is OpenPart => p.type === 'open';

/** An auto-graded part as a stand-alone question with its own id, so the engine treats it like any other. */
export function partQuestion(q: BagrutQuestion, p: AutoPart): Simple {
  return { ...p, id: partId(q, p) } as unknown as Simple;
}

/** Every objective the question's parts test (the question's own list is only a fallback). */
export function bagrutObjectives(q: BagrutQuestion): string[] {
  const set = new Set<string>(q.objectives);
  for (const p of q.parts) p.objectives.forEach((o) => set.add(o));
  return [...set];
}

export const totalPoints = (q: BagrutQuestion) => q.parts.reduce((s, p) => s + p.points, 0);

/** Each hint costs a quarter of the part's points, down to 40% of them: the same rule as mastery credit. */
export function hintFactor(hints: number): number {
  return hints > 0 ? Math.max(0.4, 1 - 0.25 * hints) : 1;
}

/** Points earned on a part: its points times the share answered right, less the price of the hints. */
export function partScore(points: number, fraction: number, hints: number): number {
  const raw = points * Math.min(1, Math.max(0, fraction)) * hintFactor(hints);
  return Math.round(raw * 10) / 10;
}

export interface OpenVerdict {
  /** share of the rubric weight the student ticked, 0..1 */
  fraction: number;
  /** meets the part's pass mark: this is what mastery sees */
  correct: boolean;
}

/** Self-assessment: `ticked[i]` says whether the student's own solution met rubric line i. */
export function gradeOpen(p: OpenPart, ticked: boolean[]): OpenVerdict {
  const total = p.rubric.reduce((s, r) => s + r.weight, 0);
  const got = p.rubric.reduce((s, r, i) => s + (ticked[i] ? r.weight : 0), 0);
  const fraction = total === 0 ? 0 : got / total;
  return { fraction, correct: fraction >= p.passMark - 1e-9 };
}
