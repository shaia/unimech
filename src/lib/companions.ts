/** Pages that accompany lessons and chapters: the lesson workbook and the chapter summary. */

import { getCollection } from 'astro:content';
import { lessonSlug } from '~/course';
import { url } from '~/lib/url';

/** Lesson ids that are written (drafts count only in dev). */
export async function writtenLessons(): Promise<Set<string>> {
  return new Set((await getCollection('lessons', (e) => !e.data.draft || import.meta.env.DEV)).map((e) => e.data.id));
}

/**
 * Where a link to a lesson goes: the lesson page once it is written, and until then the lesson's
 * comprehension ladder on the chapter practice page (`#pl-<slug>`), so a remedy or a "next step"
 * never leads to a dead page while the questions exist before the text.
 */
export async function lessonHref(): Promise<(id: string, anchor?: string) => string> {
  const written = await writtenLessons();
  return (id, anchor) =>
    written.has(id)
      ? url(`lessons/${lessonSlug(id)}/${anchor ? `#${anchor}` : ''}`)
      : url(`practice/ch${id.split('.')[0]}/#pl-${lessonSlug(id)}`);
}

/** Lesson ids ("1.5") that have a workbook page. */
export async function lessonsWithWorkbook(): Promise<Set<string>> {
  return new Set((await getCollection('workbook')).map((w) => w.data.lesson));
}

/** Chapter numbers that have a summary page. */
export async function chaptersWithSummary(): Promise<Set<number>> {
  return new Set((await getCollection('summaries')).map((s) => s.data.chapter));
}
