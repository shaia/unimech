/**
 * "What next" on the learner's page: a single suggestion from where the learner stands.
 * Pure over the progress record, so the order of the rules is unit-tested.
 *
 *   1. an active misconception → go to its remedy;
 *   2. a lesson started but not finished → continue it;
 *   3. the first lesson not started → start it;
 *   4. every lesson done but an objective not yet mastered → practice;
 *   5. everything mastered, no chapter test taken → the test;
 *   6. otherwise → the test again.
 */

import { objectiveMastery, misconceptionStatus } from './mastery';
import type { ProgressState } from './store';

export interface NextLesson {
  id: string;
  title: string;
  href: string;
  objectives: string[];
}

export interface NextInput {
  /** written lessons in course order */
  lessons: readonly NextLesson[];
  state: ProgressState;
  /** remedies of misconceptions by id: where to go to unlearn each */
  remedies: Record<string, { title: string; href: string }>;
  practiceHref: string;
  testHref: string;
}

export interface NextStep {
  kind: 'remedy' | 'continue' | 'start' | 'practice' | 'test' | 'retest';
  label: string;
  href: string;
  /** one sentence saying why this is the suggestion */
  reason: string;
}

export function nextStep({ lessons, state, remedies, practiceHref, testHref }: NextInput): NextStep {
  const active = misconceptionStatus(state.attempts).find((m) => m.active && remedies[m.id]);
  if (active) {
    const r = remedies[active.id];
    return { kind: 'remedy', label: r.title, href: r.href, reason: 'טעות מושגית שחוזרת אצלכם. הניסוי הזה מפריך אותה.' };
  }
  const started = lessons.find((l) => state.lessons[l.id]?.visited && !state.lessons[l.id]?.completed);
  if (started) {
    return { kind: 'continue', label: `${started.id} ${started.title}`, href: started.href, reason: 'התחלתם את השיעור ולא סיימתם אותו.' };
  }
  const fresh = lessons.find((l) => !state.lessons[l.id]?.visited && !state.lessons[l.id]?.completed);
  if (fresh) {
    return { kind: 'start', label: `${fresh.id} ${fresh.title}`, href: fresh.href, reason: 'השיעור הבא במסלול.' };
  }
  const objectives = lessons.flatMap((l) => l.objectives);
  const unmastered = objectives.some((o) => objectiveMastery(state.attempts, o).level !== 'mastered');
  if (unmastered) {
    return { kind: 'practice', label: 'דף התרגול של הפרק', href: practiceHref, reason: 'יש מטרות שעוד לא הגעתם בהן לשליטה.' };
  }
  const tested = state.attempts.some((a) => a.kind === 'test');
  return tested
    ? { kind: 'retest', label: 'מבחן פרק חדש', href: testHref, reason: 'הכול נשלט. מבחן חדש ישמור על הידע חד.' }
    : { kind: 'test', label: 'מבחן הפרק', href: testHref, reason: 'סיימתם את כל השיעורים ושלטתם במטרות. הגיע הזמן לבחון את עצמכם.' };
}
