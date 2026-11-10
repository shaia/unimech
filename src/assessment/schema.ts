/**
 * The question-bank schema, shared by the content collection (src/content.config.ts) and by
 * scripts/lint-content.ts, which validates each bank with it so a YAML file can be checked
 * without a build (parallel authors share one dist/).
 */

import { z } from 'astro/zod';

const choice = z.object({
  text: z.string(),
  correct: z.boolean().default(false),
  feedback: z.string(),
  misconception: z.string().optional(),
});

const common = {
  id: z.string().regex(/^Q-\d+\.\d+-[\w-]+$/),
  objectives: z.array(z.string()).min(1),
  prompt: z.string(),
  /** qualitative questions: reasoning without a number, the core of the comprehension ladder */
  qualitative: z.boolean().default(false),
  /** the comprehension ladder: basic (בסיס) → mid (בינוני) → bagrut (רמת מבחן) */
  level: z.enum(['basic', 'mid', 'bagrut']).default('basic'),
  hints: z.array(z.string()).default([]),
  /** worked explanation shown after answering, whatever the answer */
  explanation: z.string().optional(),
  /** ask "sure / not sure" before checking: separates misconceptions from gaps */
  confidence: z.boolean().default(true),
  /** show mc/multi/twotier choices and rank items in a fixed shuffled order; false keeps a deliberate order
   *  (a rank question never starts on its key either way) */
  shuffle: z.boolean().default(true),
};

const directions = ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se', 'out', 'in', 'zero'] as const;

/** The type-specific fields of each auto-graded kind, shared by stand-alone questions and Bagrut parts. */
const bodies = {
  mc: { type: z.literal('mc'), choices: z.array(choice).min(2) },
  multi: { type: z.literal('multi'), choices: z.array(choice).min(2) },
  numeric: {
    type: z.literal('numeric'),
    answer: z.number(),
    unit: z.string(),
    /** relative tolerance */
    tolerance: z.number().positive().max(0.2).default(0.03),
    correctFeedback: z.string(),
    wrongFeedback: z.string(),
    /** recognisable wrong numbers, each traced to a misconception */
    commonWrong: z
      .array(z.object({ value: z.number(), feedback: z.string(), misconception: z.string().optional() }))
      .default([]),
  },
  vector: {
    type: z.literal('vector'),
    answer: z.enum(directions),
    /** figure drawn above the rose: an SVG snippet name from src/assessment/diagrams */
    diagram: z.string().optional(),
    allowOutIn: z.boolean().default(false),
    correctFeedback: z.string(),
    wrong: z
      .array(z.object({ dir: z.enum(directions), feedback: z.string(), misconception: z.string().optional() }))
      .default([]),
    wrongFeedback: z.string(),
  },
  rank: {
    type: z.literal('rank'),
    items: z.array(z.object({ id: z.string(), label: z.string() })).min(2),
    /** correct order, largest first; ties as nested arrays */
    order: z.array(z.union([z.string(), z.array(z.string())])),
    correctFeedback: z.string(),
    wrongFeedback: z.string(),
  },
  twotier: {
    type: z.literal('twotier'),
    choices: z.array(choice).min(2),
    reasonPrompt: z.string().default('ומה הנימוק?'),
    reasons: z.array(choice).min(2),
  },
};

const mc = z.object({ ...common, ...bodies.mc });
const multi = z.object({ ...common, ...bodies.multi });
const numeric = z.object({ ...common, ...bodies.numeric });
const vector = z.object({ ...common, ...bodies.vector });
const rank = z.object({ ...common, ...bodies.rank });
const twotier = z.object({ ...common, ...bodies.twotier });

/*
 * ---- Review problem (שאלת חזרה): a scenario with lettered parts (א, ב, ג…), graded easy → hard ----
 * The type key and the id pattern `Q-<chapter>-bagrut-<n>` are inherited from emlab, whose multi-part
 * questions are Bagrut questions; renaming them would fork the engine for no gain. In this course
 * the level `bagrut` means "exam level" (רמת מבחן).
 */

const { id: _commonId, ...commonFields } = common;
const partCommon = {
  ...commonFields,
  /** a part may list no objective only while it waits for the lesson that owns it (pendingObjectives) */
  objectives: z.array(z.string()).default([]),
  /** the Hebrew letter that heads the part: א, ב, ג… */
  label: z.string().min(1).max(3),
  points: z.number().int().min(1).max(20),
  /** false when the part needs an answer from an earlier part: the chapter test then leaves it out */
  standalone: z.boolean().default(true),
  /** objectives of lessons not written yet, as free text; the engine ignores them and lint lists them */
  pendingObjectives: z.array(z.string()).default([]),
};

/** A part answered in free text and graded by the student against a model solution and a rubric. */
const openBody = {
  type: z.literal('open'),
  /** the model solution in the course format (law → derivation → result → limit → units), one step per entry */
  solution: z
    .array(z.object({ kind: z.enum(['formula', 'law', 'manipulation', 'substitution', 'limit', 'units', 'result']), text: z.string() }))
    .min(1),
  /** the checklist the student ticks against their own work */
  rubric: z.array(z.object({ text: z.string(), weight: z.number().positive().default(1) })).min(2),
  /** fraction of the rubric weight that counts as "correct" for mastery evidence */
  passMark: z.number().min(0.5).max(1).default(0.75),
};

const part = z.discriminatedUnion('type', [
  z.object({ ...partCommon, ...bodies.mc }),
  z.object({ ...partCommon, ...bodies.multi }),
  z.object({ ...partCommon, ...bodies.numeric }),
  z.object({ ...partCommon, ...bodies.vector }),
  z.object({ ...partCommon, ...bodies.rank }),
  z.object({ ...partCommon, ...bodies.twotier }),
  z.object({ ...partCommon, ...openBody }),
]);

const bagrut = z.object({
  ...commonFields,
  id: z.string().regex(/^Q-\d+-bagrut-\d+$/),
  type: z.literal('bagrut'),
  title: z.string(),
  /** the scenario that all parts share */
  prompt: z.string(),
  /** inline SVG markup drawn under the scenario (physics space, LTR) */
  diagram: z.string().optional(),
  /** accessible description of the diagram: required when there is one */
  diagramAlt: z.string().optional(),
  /** filled from the parts when omitted; see bagrutObjectives() */
  objectives: z.array(z.string()).default([]),
  level: z.literal('bagrut').default('bagrut'),
  parts: z.array(part).min(2).max(6),
});

export const question = z.discriminatedUnion('type', [mc, multi, numeric, vector, rank, twotier, bagrut]);
export type Question = z.infer<typeof question>;
export type BagrutQuestion = Extract<Question, { type: 'bagrut' }>;
export type Part = BagrutQuestion['parts'][number];
export type OpenPart = Extract<Part, { type: 'open' }>;
export type AutoPart = Exclude<Part, OpenPart>;

export const questionBank = z.object({ chapter: z.number().int(), questions: z.array(question) });
