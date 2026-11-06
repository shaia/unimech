/** Question banks, at build time. Ids are unique across all banks (lint-content enforces it). */

import { getCollection } from 'astro:content';
import type { Question } from '~/content.config';
import { lessonOrder } from '~/course';
import { isOpen, partQuestion } from './bagrut';
import { lessonOfQuestion } from './ids';
import { renderQuestion } from './render';

export { lessonOfQuestion };

let cache: Map<string, Question> | null = null;

export async function allQuestions(): Promise<Map<string, Question>> {
  if (cache) return cache;
  const banks = await getCollection('questions');
  const map = new Map<string, Question>();
  for (const b of banks) {
    for (const q of b.data.questions) {
      if (map.has(q.id)) throw new Error(`duplicate question id ${q.id} (in ${b.id})`);
      map.set(q.id, q);
    }
  }
  cache = map;
  return map;
}

export async function getQuestion(id: string, where: string): Promise<Question> {
  const q = (await allQuestions()).get(id);
  if (!q) throw new Error(`${where}: unknown question id ${id}`);
  return q;
}

/** "/lessons/1-5/" (with or without a base path) → "1.5" */
export function lessonFromPath(pathname: string): string | null {
  const m = pathname.match(/\/lessons\/(\d+)-(\d+)\/?$/);
  return m ? `${m[1]}.${m[2]}` : null;
}

/* ------------------------------------------------------------------ chapter views */

/** Chapter numbers that have at least one question: the practice sheet and test exist for these. */
export async function chaptersWithQuestions(): Promise<number[]> {
  const banks = await getCollection('questions');
  return [...new Set(banks.map((b) => b.data.chapter))].sort((a, b) => a - b);
}

export interface ChapterQuestions {
  /** single-card questions grouped by lesson, in course order, bank order within a lesson */
  byLesson: { lesson: string; questions: Question[] }[];
  /** multi-part Bagrut questions, in id order */
  bagrut: Extract<Question, { type: 'bagrut' }>[];
}

/** Every question of a chapter, rendered for the browser (TeX done at build time). */
export async function chapterQuestions(chapter: number): Promise<ChapterQuestions> {
  const banks = (await getCollection('questions')).filter((b) => b.data.chapter === chapter);
  const all = banks.flatMap((b) => b.data.questions).map(renderQuestion);
  const rank = (lesson: string) => {
    const i = lessonOrder.findIndex((l) => l.id === lesson);
    return i < 0 ? 1e6 : i;
  };
  const groups = new Map<string, Question[]>();
  for (const q of all) {
    if (q.type === 'bagrut') continue;
    const lesson = lessonOfQuestion(q.id) ?? '';
    groups.set(lesson, [...(groups.get(lesson) ?? []), q]);
  }
  const byLesson = [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'en', { numeric: true }))
    .map(([lesson, questions]) => ({ lesson, questions }));
  const bagrut = all
    .filter((q): q is Extract<Question, { type: 'bagrut' }> => q.type === 'bagrut')
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  return { byLesson, bagrut };
}

/** A question the chapter test may draw: a single card, with the lesson it belongs to (if any). */
export type TestQuestion = Exclude<Question, { type: 'bagrut' }>;

/**
 * The chapter test's pool: every single-card question, plus each self-contained auto-graded
 * Bagrut part as a card of its own (scenario and diagram folded into its prompt). Open parts
 * are self-assessed, so they cannot be scored on submission and stay out.
 */
export function testPool(c: ChapterQuestions): TestQuestion[] {
  const pool: TestQuestion[] = c.byLesson.flatMap((g) => g.questions as TestQuestion[]);
  for (const q of c.bagrut) {
    for (const p of q.parts) {
      if (isOpen(p) || !p.standalone || p.objectives.length === 0) continue;
      const pq = partQuestion(q, p);
      const figure = q.diagram
        ? `<div class="test-diagram ltr-space" role="img" aria-label="${(q.diagramAlt ?? '').replace(/"/g, '&quot;')}">${q.diagram}</div>`
        : '';
      pool.push({ ...pq, prompt: `<div class="test-scenario">${q.prompt}</div>${figure}${pq.prompt}` });
    }
  }
  return pool;
}
