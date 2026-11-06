/**
 * Diagnosis from answer history. Pure functions over attempts, so they are unit-tested and
 * shared by the dashboard, the chapter test report and the teacher report.
 *
 * Mastery per objective is a recency-weighted average of credit: newer answers count more,
 * hints reduce credit. Confidence separates two kinds of wrong answer: wrong and sure points
 * to a misconception; wrong and unsure points to a knowledge gap.
 */

import type { Attempt } from './store';

export type Level = 'none' | 'learning' | 'mastered';

export interface ObjectiveMastery {
  objective: string;
  level: Level;
  /** 0..1 */
  score: number;
  attempts: number;
}

const DECAY = 0.6;

export function credit(a: Attempt): number {
  if (!a.correct) return 0;
  return a.hints > 0 ? Math.max(0.4, 1 - 0.25 * a.hints) : 1;
}

export function objectiveMastery(attempts: readonly Attempt[], objective: string): ObjectiveMastery {
  const mine = attempts.filter((a) => a.objectives.includes(objective)).sort((a, b) => a.at - b.at);
  if (mine.length === 0) return { objective, level: 'none', score: 0, attempts: 0 };
  let num = 0;
  let den = 0;
  let w = 1;
  for (let i = mine.length - 1; i >= 0; i--) {
    num += w * credit(mine[i]);
    den += w;
    w *= DECAY;
  }
  const score = num / den;
  const lastTwo = mine.slice(-2);
  const mastered = mine.length >= 3 && score >= 0.75 && lastTwo.every((a) => a.correct);
  return { objective, level: mastered ? 'mastered' : 'learning', score, attempts: mine.length };
}

export interface MisconceptionStatus {
  id: string;
  /** weighted evidence: a confident wrong answer counts 2, an unsure one 1 */
  evidence: number;
  /** correct answers to probing questions since the last time it showed up */
  clearedBy: number;
  active: boolean;
  lastSeen: number;
}

export function misconceptionStatus(attempts: readonly Attempt[]): MisconceptionStatus[] {
  const sorted = [...attempts].sort((a, b) => a.at - b.at);
  const map = new Map<string, MisconceptionStatus>();
  for (const a of sorted) {
    if (!a.correct && a.misconception) {
      const s = map.get(a.misconception) ?? {
        id: a.misconception,
        evidence: 0,
        clearedBy: 0,
        active: false,
        lastSeen: 0,
      };
      s.evidence += a.confident === true ? 2 : 1;
      s.clearedBy = 0;
      s.lastSeen = a.at;
      map.set(a.misconception, s);
    } else if (a.correct) {
      for (const p of a.probes) {
        const s = map.get(p);
        if (s) s.clearedBy += 1;
      }
    }
  }
  for (const s of map.values()) s.active = s.evidence >= 2 && s.clearedBy < 2;
  return [...map.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Wrong + sure vs wrong + unsure, the two-axis reading of a wrong answer. */
export function wrongAnswerKind(a: Attempt): 'misconception' | 'gap' | null {
  if (a.correct) return null;
  return a.confident === true ? 'misconception' : 'gap';
}
