/**
 * Grading: pure functions from (question, answer) to a verdict. No DOM, so every question
 * type is unit-tested, and the lesson checks, practice pages and chapter tests share it.
 *
 * Feedback strings are whatever the question carries: HTML once Check.astro has rendered
 * the TeX at build time, plain text in tests.
 */

import type { Question } from '~/content.config';
import { isOpen, partQuestion } from './bagrut';

export type Dir = 'e' | 'ne' | 'n' | 'nw' | 'w' | 'sw' | 's' | 'se' | 'out' | 'in' | 'zero';

export type Answer =
  | { type: 'mc'; choice: number }
  | { type: 'multi'; choices: number[] }
  | { type: 'numeric'; value: number }
  | { type: 'vector'; dir: Dir }
  | { type: 'rank'; order: string[]; tied: boolean[] }
  | { type: 'twotier'; choice: number; reason: number };

export interface Verdict {
  correct: boolean;
  /** feedback paragraphs, most specific first */
  feedback: string[];
  /** misconception tag of the wrong answer given, if the question traces it */
  misconception: string | null;
}

/** Every misconception a question can detect: correct answers to it count as evidence against them. */
export function probesOf(q: Question): string[] {
  const tags = new Set<string>();
  const add = (t?: string) => t && tags.add(t);
  switch (q.type) {
    case 'mc':
    case 'multi':
      q.choices.forEach((c) => add(c.misconception));
      break;
    case 'twotier':
      q.choices.forEach((c) => add(c.misconception));
      q.reasons.forEach((c) => add(c.misconception));
      break;
    case 'numeric':
      q.commonWrong.forEach((w) => add(w.misconception));
      break;
    case 'vector':
      q.wrong.forEach((w) => add(w.misconception));
      break;
    case 'rank':
      break;
    case 'bagrut':
      for (const p of q.parts) if (!isOpen(p)) probesOf(partQuestion(q, p)).forEach(add);
      break;
  }
  return [...tags];
}

export function grade(q: Question, a: Answer): Verdict {
  if (q.type === 'bagrut') throw new Error(`${q.id}: grade its parts, not the whole Bagrut question`);
  if (q.type !== a.type) throw new Error(`answer type ${a.type} does not match question ${q.id} (${q.type})`);
  switch (q.type) {
    case 'mc': {
      const c = q.choices[(a as Extract<Answer, { type: 'mc' }>).choice];
      if (!c) throw new Error(`choice out of range in ${q.id}`);
      return { correct: c.correct, feedback: [c.feedback], misconception: c.correct ? null : (c.misconception ?? null) };
    }
    case 'multi': {
      const picked = new Set((a as Extract<Answer, { type: 'multi' }>).choices);
      const feedback: string[] = [];
      let misconception: string | null = null;
      let correct = true;
      q.choices.forEach((c, i) => {
        const chosen = picked.has(i);
        if (chosen !== c.correct) correct = false;
        if (chosen) {
          feedback.push(c.feedback);
          if (!c.correct && !misconception) misconception = c.misconception ?? null;
        }
      });
      const missed = q.choices.some((c, i) => c.correct && !picked.has(i));
      if (missed) feedback.push('יש עוד תשובה נכונה שלא סימנתם.');
      return { correct, feedback, misconception: correct ? null : misconception };
    }
    case 'twotier': {
      const ans = a as Extract<Answer, { type: 'twotier' }>;
      const c = q.choices[ans.choice];
      const r = q.reasons[ans.reason];
      if (!c || !r) throw new Error(`choice out of range in ${q.id}`);
      const correct = c.correct && r.correct;
      // the reason is the deeper signal: a right answer for a wrong reason is still a misconception
      const misconception = correct ? null : ((!r.correct && r.misconception) || (!c.correct && c.misconception) || null);
      return { correct, feedback: [c.feedback, r.feedback], misconception };
    }
    case 'numeric': {
      const v = (a as Extract<Answer, { type: 'numeric' }>).value;
      if (withinTolerance(v, q.answer, q.tolerance)) {
        return { correct: true, feedback: [q.correctFeedback], misconception: null };
      }
      const known = q.commonWrong.find((w) => withinTolerance(v, w.value, q.tolerance));
      if (known) return { correct: false, feedback: [known.feedback, q.wrongFeedback], misconception: known.misconception ?? null };
      const off = orderOfMagnitudeSlip(v, q.answer);
      const feedback = off ? [`התוצאה שלכם רחוקה פי ${off} מהתשובה. בדקו קידומות ויחידות (למשל cm ו-m, או ms ו-s).`, q.wrongFeedback] : [q.wrongFeedback];
      return { correct: false, feedback, misconception: null };
    }
    case 'vector': {
      const d = (a as Extract<Answer, { type: 'vector' }>).dir;
      if (d === q.answer) return { correct: true, feedback: [q.correctFeedback], misconception: null };
      const known = q.wrong.find((w) => w.dir === d);
      if (known) return { correct: false, feedback: [known.feedback], misconception: known.misconception ?? null };
      return { correct: false, feedback: [q.wrongFeedback], misconception: null };
    }
    case 'rank': {
      const ans = a as Extract<Answer, { type: 'rank' }>;
      const correct = sameGrouping(groupsOf(ans.order, ans.tied), q.order.map((g) => (Array.isArray(g) ? g : [g])));
      return { correct, feedback: [correct ? q.correctFeedback : q.wrongFeedback], misconception: null };
    }
  }
}

export function withinTolerance(v: number, target: number, rel: number): boolean {
  if (!Number.isFinite(v)) return false;
  if (target === 0) return Math.abs(v) < 1e-12;
  return Math.abs(v - target) <= rel * Math.abs(target);
}

/** 10, 100, 1000… when v is off from target by a clean power of ten (a prefix or unit slip). */
function orderOfMagnitudeSlip(v: number, target: number): number | null {
  if (v === 0 || target === 0 || Math.sign(v) !== Math.sign(target)) return null;
  const r = Math.log10(Math.abs(v / target));
  const n = Math.round(r);
  if (n === 0 || Math.abs(r - n) > 0.02) return null;
  return 10 ** Math.abs(n);
}

/** Split a ranked list into tie groups: tied[i] joins order[i] with order[i+1]. */
export function groupsOf(order: string[], tied: boolean[]): string[][] {
  const groups: string[][] = [];
  order.forEach((id, i) => {
    if (i > 0 && tied[i - 1]) groups[groups.length - 1].push(id);
    else groups.push([id]);
  });
  return groups;
}

function sameGrouping(a: string[][], b: string[][]): boolean {
  if (a.length !== b.length) return false;
  return a.every((g, i) => g.length === b[i].length && g.every((id) => b[i].includes(id)));
}

/**
 * Read a number the way students type it: "2.5", "2,5", "2.5e-3", "2.5*10^-3", "2.5·10^-3",
 * "2.5x10^-3", "10^5", with optional spaces and a leading minus (ASCII or U+2212).
 */
export function parseNumber(input: string): number | null {
  let s = input.trim().replace(/\s+/g, '').replace(/−/g, '-').replace(/,/g, '.');
  let sign = 1;
  if (s.startsWith('-') || s.startsWith('+')) {
    if (s[0] === '-') sign = -1;
    s = s.slice(1);
  }
  if (s === '') return null;
  // trailing superscript exponent, as copied from the course text: 10⁻³ → 10^-3
  const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+$/, (sup) => '^' + [...sup].map((c) => (c === '⁻' ? '-' : String(SUPS.indexOf(c)))).join(''));
  const pow = s.match(/^(?:(\d*\.?\d+)[*·x×]?)?10\^\(?([-+]?\d+)\)?$/i);
  if (pow) {
    const mant = pow[1] === undefined ? 1 : Number(pow[1]);
    return sign * mant * 10 ** Number(pow[2]);
  }
  if (/^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return sign * Number(s);
  return null;
}
