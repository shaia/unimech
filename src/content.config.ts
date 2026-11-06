import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { readdir, readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { questionBank } from './assessment/schema';

/**
 * A collection kept as one YAML list per lesson (`<dir>/1-5.yaml`, …), merged into one collection.
 * Per-lesson files let lessons be written in parallel without editing a shared file; a duplicate id
 * across files fails the build.
 */
function yamlDir(dir: string) {
  return async () => {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.yaml')).sort();
    const seen = new Map<string, string>();
    const entries: { id: string }[] = [];
    for (const f of files) {
      const list = (parse(await readFile(`${dir}/${f}`, 'utf8')) ?? []) as { id: string }[];
      for (const e of list) {
        if (seen.has(e.id)) throw new Error(`${dir}: id "${e.id}" appears in both ${seen.get(e.id)} and ${f}`);
        seen.set(e.id, f);
        entries.push(e);
      }
    }
    return entries;
  };
}

const objective = z.object({ id: z.string().regex(/^OBJ-\d+\.\d+-\d+$/), text: z.string() });

const lessons = defineCollection({
  loader: glob({ base: './src/content/lessons', pattern: '**/*.mdx' }),
  schema: z.object({
    id: z.string().regex(/^\d+\.\d+$/),
    chapter: z.number().int().min(0).max(10),
    order: z.number().int().min(1),
    title: z.string(),
    subtitle: z.string().optional(),
    // a university lesson has no time cap: `minutes` is its honest reading time (see CLAUDE.md)
    minutes: z.number().int().min(5).max(180),
    objectives: z.array(objective).min(1),
    prerequisites: z.array(z.string()).default([]),
    videos: z.array(z.string()).default([]),
    figures: z.array(z.string()).default([]),
    /** lessons whose place in the 77101 syllabus is unverified are marked enrichment (as in src/course.ts) */
    enrichment: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

export { question } from './assessment/schema';
export type { Question, BagrutQuestion, Part, OpenPart, AutoPart } from './assessment/schema';

const questions = defineCollection({
  loader: glob({ base: './src/content/questions', pattern: '**/*.yaml' }),
  schema: questionBank,
});

const misconceptions = defineCollection({
  loader: yamlDir('src/content/misconceptions'),
  schema: z.object({
    id: z.string().regex(/^MC-[\w-]+$/),
    title: z.string(),
    belief: z.string(),
    truth: z.string(),
    /** where to go to unlearn it: a lesson id plus an anchor or figure */
    remedy: z.object({ lesson: z.string(), anchor: z.string().optional(), label: z.string() }),
  }),
});

const glossary = defineCollection({
  loader: yamlDir('src/content/glossary'),
  schema: z.object({
    id: z.string(),
    term: z.string(),
    en: z.string(),
    definition: z.string(),
    symbol: z.string().optional(),
    unit: z.string().optional(),
    /** spellings that must not appear in course text */
    reject: z.array(z.string()).default([]),
    lesson: z.string().optional(),
  }),
});

const videos = defineCollection({
  loader: yamlDir('src/content/videos'),
  schema: z.object({
    id: z.string(),
    youtubeId: z.string().regex(/^[\w-]{11}$/),
    title: z.string(),
    channel: z.string(),
    lang: z.enum(['he', 'en']),
    captions: z.array(z.enum(['he', 'en'])).default([]),
    start: z.number().int().min(0).default(0),
    end: z.number().int().optional(),
    minutes: z.number(),
    why: z.string(),
    verified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
});

/* ---- Lesson workbook: open practice problems and sourced challenge problems, answers hidden ---- */

/**
 * One step of a written solution; the last one is the `result`. The course format is general law (`law`) →
 * derivation (`manipulation`) → symbolic result → limit check (`limit`) → unit check (`units`) → numbers.
 */
const solutionStep = z.object({
  kind: z.enum(['given', 'formula', 'law', 'manipulation', 'substitution', 'reasoning', 'limit', 'units', 'result']),
  text: z.string(),
});
const workbookItem = {
  objectives: z.array(z.string()).min(1),
  prompt: z.string(),
  /** inline SVG markup drawn under the prompt (physics space, LTR) */
  diagram: z.string().optional(),
  /** accessible description of the diagram: required when there is one */
  diagramAlt: z.string().optional(),
  /** the short final answer: value with units and direction, or a one-line decision */
  answer: z.string(),
  solution: z.array(solutionStep).min(1),
};
const workbook = defineCollection({
  loader: glob({ base: './src/content/workbook', pattern: '**/*.yaml' }),
  schema: z.object({
    lesson: z.string().regex(/^\d+\.\d+$/),
    practice: z.array(
      z.object({
        id: z.string().regex(/^W-\d+\.\d+-\d{2}$/),
        level: z.enum(['basic', 'mid', 'bagrut']),
        qualitative: z.boolean().default(false),
        ...workbookItem,
      }),
    ),
    challenge: z.array(
      z.object({
        id: z.string().regex(/^W-\d+\.\d+-c\d$/),
        /** 1 = hard (entrance-exam level), 2 = very hard (olympiad level) */
        stars: z.union([z.literal(1), z.literal(2)]),
        ...workbookItem,
        /** where the problem comes from; only a source actually opened and read is cited */
        source: z.object({
          name: z.string(),
          year: z.number().int().min(1900),
          problem: z.string(),
          url: z.string().url(),
          /** the day the source was opened; an unquoted YAML date arrives as a Date */
          verified: z.union([
            z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            z.date().transform((d) => d.toISOString().slice(0, 10)),
          ]),
          /** numbers or constants changed (to the formula sheet's), wording paraphrased */
          adapted: z.boolean().default(true),
        }),
      }),
    ),
  }),
});

/** End-of-chapter summary: what to remember and how to solve the chapter's problems. */
const summaries = defineCollection({
  loader: glob({ base: './src/content/summaries', pattern: '*.mdx' }),
  schema: z.object({ chapter: z.number().int().min(0).max(10), title: z.string() }),
});

export const collections = { lessons, questions, misconceptions, glossary, videos, workbook, summaries };
