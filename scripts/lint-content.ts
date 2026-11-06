/**
 * Content lint: the rules a schema cannot express, checked across lessons, question banks,
 * the misconception register, the glossary and the video list. Reports every problem, then
 * exits 1 if there were any.
 *
 *   npm run lint:content                       # the whole course (CI)
 *   npx tsx scripts/lint-content.ts --file <p> # problems in one file only (the edit hook)
 *
 * --file skips completeness checks ("≥ 3 questions per objective", "every misconception is
 * detected", "every template part is present", "10 + 2 workbook problems"): a lesson being written
 * is incomplete by design, and the hook must not block each save. CI runs the full lint.
 *
 * A chapter counts as finished once its summary (src/content/summaries/ch<N>.mdx) exists: from then
 * on every lesson in it must have 6 worked examples and a workbook. Unfinished chapters are listed.
 *
 * Objectives are declared in the course map (src/course.ts), not by the lessons, so a chapter's
 * question banks can exist before its lessons do. A written lesson must declare the map's objectives.
 * Every bank is validated against the zod schema and every student-facing string is rendered with
 * KaTeX here, so `--file` catches what the build would, without a build.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import { chapters, chapterObjectives, lessonOrder, objectiveById } from '../src/course.ts';
import { questionBank } from '../src/assessment/schema.ts';
import { tex } from '../src/lib/tex.ts';

const ROOT = join(import.meta.dirname, '..');
const CONTENT = join(ROOT, 'src/content');
const fileArg = process.argv.indexOf('--file');
const onlyFile = fileArg > 0 ? process.argv[fileArg + 1]?.replaceAll('\\', '/') : null;
const problems: string[] = [];
const fail = (where: string, msg: string, completeness = false) => {
  if (onlyFile && (completeness || !where.startsWith(onlyFile))) return;
  problems.push(`${where}: ${msg}`);
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const rel = (p: string) => relative(ROOT, p).replaceAll('\\', '/');
/** Parse a YAML file; a syntax error is reported against the file (and lint goes on) instead of crashing. */
const yamlFile = <T>(p: string): T => {
  try {
    return parse(readFileSync(p, 'utf8')) as T;
  } catch (e) {
    // the most common cause in Hebrew text: a plain scalar with ": " inside it. Quote it, or use >-
    fail(rel(p), `YAML: ${(e as Error).message.split(/\r?\n/)[0]}`);
    return undefined as T;
  }
};

/* ------------------------------------------------------------------ load */

interface Choice {
  text: string;
  correct?: boolean;
  feedback: string;
  misconception?: string;
}
interface Question {
  id: string;
  type: string;
  objectives: string[];
  qualitative?: boolean;
  prompt: string;
  choices?: Choice[];
  reasons?: Choice[];
  commonWrong?: { misconception?: string; feedback: string }[];
  wrong?: { misconception?: string; feedback: string }[];
  /** Bagrut questions: lettered parts, each a question-like object */
  parts?: Part[];
  diagram?: string;
  diagramAlt?: string;
  [k: string]: unknown;
}
interface Part extends Omit<Question, 'id' | 'parts' | 'prompt'> {
  label: string;
  prompt: string;
  points: number;
  pendingObjectives?: string[];
  rubric?: { text: string; weight?: number }[];
  solution?: { kind: string; text: string }[];
}
interface Lesson {
  file: string;
  id: string;
  objectives: string[];
  videos: string[];
  figures: string[];
  minutes: number;
  order: number;
  body: string;
  raw: string;
}

const lessons: Lesson[] = walk(join(CONTENT, 'lessons'))
  .filter((f) => f.endsWith('.mdx'))
  .map((file) => {
    const raw = readFileSync(file, 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!m) {
      fail(rel(file), 'no frontmatter');
      return null;
    }
    const fm = parse(m[1]) as { id: string; objectives: { id: string }[]; videos?: string[]; figures?: string[]; minutes: number; order: number };
    return {
      file: rel(file),
      id: fm.id,
      objectives: fm.objectives.map((o) => o.id),
      videos: fm.videos ?? [],
      figures: fm.figures ?? [],
      minutes: fm.minutes,
      order: fm.order,
      body: m[2],
      raw,
    };
  })
  .filter((l): l is Lesson => l !== null);

const banks = walk(join(CONTENT, 'questions'))
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => ({ file: rel(f), data: yamlFile<{ chapter: number; questions: Question[] }>(f) }));
const questions = banks.flatMap((b) => (b.data?.questions ?? []).map((q) => ({ q, file: b.file })));

/** A per-lesson YAML folder (`misconceptions/1-5.yaml`, …): every entry, tagged with its file. */
const yamlDir = <T>(name: string): (T & { file: string })[] =>
  readdirSync(join(CONTENT, name))
    .filter((f) => f.endsWith('.yaml'))
    .flatMap((f) => (yamlFile<T[]>(join(CONTENT, name, f)) ?? []).map((e) => ({ ...e, file: `src/content/${name}/${f}` })));

interface WorkbookItem {
  id: string;
  objectives?: string[];
  qualitative?: boolean;
  level?: string;
  prompt: string;
  diagram?: string;
  diagramAlt?: string;
  answer: string;
  solution?: { kind: string; text: string }[];
  source?: { name: string; year: number; problem: string; url: string };
}
const workbookDir = join(CONTENT, 'workbook');
const workbooks = (statSync(workbookDir, { throwIfNoEntry: false }) ? walk(workbookDir) : [])
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => ({ file: rel(f), data: yamlFile<{ lesson: string; practice?: WorkbookItem[]; challenge?: WorkbookItem[] }>(f) }));
const summaryDir = join(CONTENT, 'summaries');
const summaries = (statSync(summaryDir, { throwIfNoEntry: false }) ? readdirSync(summaryDir) : [])
  .filter((f) => /^ch\d+\.mdx$/.test(f))
  .map((f) => ({ file: `src/content/summaries/${f}`, chapter: Number(f.match(/\d+/)![0]), body: readFileSync(join(summaryDir, f), 'utf8') }));

const misconceptions = yamlDir<{ id: string; remedy: { lesson: string; anchor?: string } }>('misconceptions');
const glossary = yamlDir<{ id: string; term: string; reject?: string[] }>('glossary');
const videos = yamlDir<{ id: string }>('videos');
for (const [name, list] of [['misconceptions', misconceptions], ['glossary', glossary], ['videos', videos]] as const) {
  const seen = new Map<string, string>();
  for (const e of list) {
    if (seen.has(e.id)) fail(e.file, `${name} id ${e.id} is also defined in ${seen.get(e.id)}`);
    seen.set(e.id, e.file);
  }
}

const lessonById = new Map(lessons.map((l) => [l.id, l]));
const plannedById = new Map(lessonOrder.map((l) => [l.id, l]));
const objectiveIds = new Set(objectiveById.keys());

/* ------------------------------------------------------- lessons ↔ course map */

for (const l of lessons) {
  const planned = plannedById.get(l.id);
  if (!planned) {
    fail(l.file, `lesson ${l.id} is not in the course map (src/course.ts)`);
    continue;
  }
  const want = planned.objectives.map((o) => o.id).join(', ');
  if (l.objectives.join(', ') !== want) fail(l.file, `objectives [${l.objectives.join(', ')}] differ from the course map's [${want}]`);
}

/* ------------------------------------------------------- bank schema, placement, TeX */

/** Keys whose string values are data, not student-facing text. */
const NOT_TEXT = new Set(['id', 'type', 'objectives', 'pendingObjectives', 'misconception', 'level', 'dir', 'answer', 'order', 'diagram', 'diagramAlt', 'kind']);
const texStrings = (v: unknown, path: string, out: [string, string][] = []): [string, string][] => {
  if (typeof v === 'string') out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => texStrings(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!NOT_TEXT.has(k)) texStrings(x, path ? `${path}.${k}` : k, out);
  return out;
};
for (const { file, data } of banks) {
  const parsed = questionBank.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 8)) fail(file, `schema: ${issue.path.join('.')}: ${issue.message}`);
  }
  const folder = file.match(/questions\/ch(\d+)\//)?.[1];
  if (folder === undefined) fail(file, 'a bank lives in src/content/questions/ch<N>/');
  else if (data?.chapter !== Number(folder)) fail(file, `chapter: ${data?.chapter} does not match the folder ch${folder}`);
  const base = file.split('/').pop()!.replace(/\.yaml$/, '');
  for (const q of data?.questions ?? []) {
    if (base === 'bagrut') {
      if (q.type !== 'bagrut') fail(`${file} ${q.id}`, 'bagrut.yaml holds the review problems only; single questions go in the lesson bank');
      else if (!q.id.startsWith(`Q-${folder}-bagrut-`)) fail(`${file} ${q.id}`, `a review problem of chapter ${folder} is Q-${folder}-bagrut-<n>`);
    } else if (!q.id.startsWith(`Q-${base.replace('-', '.')}-`)) {
      fail(`${file} ${q.id}`, `a question in ${base}.yaml has an id Q-${base.replace('-', '.')}-…`);
    }
    for (const [path, text] of texStrings(q, '')) {
      try {
        tex(text, path);
      } catch (e) {
        fail(`${file} ${q.id}`, (e as Error).message);
      }
    }
  }
}
const mcIds = new Set(misconceptions.map((m) => m.id));
const videoIds = new Set(videos.map((v) => v.id));
const glossaryIds = new Set(glossary.map((g) => g.id));

/* ------------------------------------------------------------- questions */

const REVIEW_POINTS = 25;
const seenQ = new Set<string>();
const detected = new Set<string>();
const pending: string[] = [];
/** Every gradable unit: a question, or one part of a Bagrut question. */
const units = questions.flatMap(({ q, file }) =>
  q.type === 'bagrut'
    ? (q.parts ?? []).map((p) => ({ q: { ...p, id: `${q.id}/${p.label}`, type: p.type } as unknown as Question, file, part: p, parent: q }))
    : [{ q, file, part: null as Part | null, parent: null as Question | null }],
);
for (const { q, file } of questions) {
  if (seenQ.has(q.id)) fail(`${file} ${q.id}`, 'duplicate question id');
  seenQ.add(q.id);
}
for (const { q: bq, file } of questions.filter(({ q }) => q.type === 'bagrut')) {
  const w = `${file} ${bq.id}`;
  const parts = bq.parts ?? [];
  if (parts.length < 2) fail(w, 'a Bagrut question needs at least 2 parts');
  const labels = parts.map((p) => p.label);
  if (new Set(labels).size !== labels.length) fail(w, 'two parts share a label');
  if (bq.diagram && !bq.diagramAlt?.trim()) fail(w, 'a diagram needs diagramAlt (its accessible description)');
  if (bq.diagram && /<script|on\w+=/i.test(bq.diagram)) fail(w, 'the diagram SVG must not contain scripts or event handlers');
  if (parts.length && !parts.some((p) => p.type === 'open')) fail(w, 'a Bagrut question should have an open part (full written solution)', true);
  // the 77101 exam format is not verified yet; until /exam-map reads one, a review problem is worth 25
  const total = parts.reduce((n, p) => n + (p.points ?? 0), 0);
  if (total !== REVIEW_POINTS) fail(w, `parts add up to ${total} points; a review problem is worth ${REVIEW_POINTS}`, true);
}
for (const { q, file, part, parent } of units) {
  const w = `${file} ${q.id}`;
  const lessonOfId = q.id.match(/^Q-(\d+\.\d+)-/)?.[1];
  for (const o of q.objectives ?? []) {
    if (!objectiveIds.has(o)) fail(w, `objective ${o} is not in the course map (src/course.ts)`);
    if (lessonOfId && !o.startsWith(`OBJ-${lessonOfId}-`)) fail(w, `objective ${o} belongs to another lesson than the id prefix ${lessonOfId}`);
  }
  if (part) {
    const waiting = part.pendingObjectives ?? [];
    if ((q.objectives ?? []).length === 0 && waiting.length === 0) fail(w, 'a part needs objectives, or pendingObjectives naming the lesson it waits for');
    for (const x of waiting) pending.push(`${parent?.id}/${part.label}: ${x}`);
    if (part.type === 'open') {
      if (!part.solution?.length) fail(w, 'an open part needs a model solution');
      else if (!part.solution.some((s) => s.kind === 'result')) fail(w, 'the model solution must end in a result step (value or conclusion, with units)');
      if ((part.rubric ?? []).length < 2) fail(w, 'an open part needs a rubric of at least 2 lines');
    }
  } else if ((q.objectives ?? []).length === 0) {
    fail(w, 'no objectives');
  }
  const tags = [
    ...(q.choices ?? []),
    ...(q.reasons ?? []),
    ...(q.commonWrong ?? []),
    ...(q.wrong ?? []),
  ].flatMap((c) => (c.misconception ? [c.misconception] : []));
  for (const t of tags) {
    if (!mcIds.has(t)) fail(w, `misconception ${t} is not in the misconception register (src/content/misconceptions/)`);
    detected.add(t);
  }
  const correctCount = (cs?: Choice[]) => (cs ?? []).filter((c) => c.correct).length;
  if ((q.type === 'mc' || q.type === 'twotier') && correctCount(q.choices) !== 1) fail(w, 'needs exactly one correct choice');
  if (q.type === 'twotier' && correctCount(q.reasons) !== 1) fail(w, 'needs exactly one correct reason');
  if (q.type === 'multi' && correctCount(q.choices) < 1) fail(w, 'needs at least one correct choice');
  for (const c of [...(q.choices ?? []), ...(q.reasons ?? [])]) {
    if (!c.feedback?.trim()) fail(w, `choice "${c.text}" has no feedback`);
  }
}

/* ------------------------------------------------- objectives coverage */

// A chapter with any bank is held to the full ladder: every objective ≥ 3 questions with one qualitative, every
// lesson a basic, a mid and an exam-level question, and the chapter at least 3 review problems.
const LADDER = ['basic', 'mid', 'bagrut'];
const MIN_REVIEW = 3;
const chaptersWithBanks = [...new Set(banks.map((b) => b.data?.chapter))].filter((n): n is number => typeof n === 'number');
for (const n of chaptersWithBanks) {
  const where = `src/content/questions/ch${n}`;
  for (const o of chapterObjectives(n)) {
    const qs = questions.filter(({ q }) => q.type !== 'bagrut' && q.objectives.includes(o.id)).map(({ q }) => q);
    if (qs.length < 3) fail(where, `objective ${o.id} has ${qs.length} questions (needs ≥ 3)`, true);
    else if (!qs.some((q) => q.qualitative)) fail(where, `objective ${o.id} has no qualitative question`, true);
  }
  for (const l of chapters.find((c) => c.n === n)?.lessons ?? []) {
    const levels = new Set(questions.filter(({ q }) => q.type !== 'bagrut' && q.id.startsWith(`Q-${l.id}-`)).map(({ q }) => q.level ?? 'basic'));
    const missing = LADDER.filter((x) => !levels.has(x));
    if (missing.length) fail(where, `lesson ${l.id} has no question at level ${missing.join(', ')}: the ladder needs basic, mid and bagrut`, true);
  }
  const reviews = questions.filter(({ q }) => q.type === 'bagrut' && q.id.startsWith(`Q-${n}-bagrut-`)).length;
  if (reviews < MIN_REVIEW) fail(where, `${reviews} review problem(s) in bagrut.yaml (a chapter has ≥ ${MIN_REVIEW})`, true);
}

/* ------------------------------------------------------- misconceptions */

/**
 * Whether a lesson renders an element with this HTML id. <Term id> and <Watch id> name a glossary entry or a
 * video and render no id, so they don't count.
 */
const hasAnchor = (body: string, id: string) =>
  [...body.matchAll(/<(\w+)\b[^>]*?\sid="([^"]+)"/g)].some((m) => m[2] === id && m[1] !== 'Term' && m[1] !== 'Watch');

for (const m of misconceptions) {
  if (!detected.has(m.id)) fail(m.file, `${m.id} is not detected by any distractor`, true);
  const target = lessonById.get(m.remedy.lesson);
  // a remedy may point at a planned lesson: until it is written the link goes to the lesson's practice section
  if (!target) {
    if (!plannedById.has(m.remedy.lesson)) fail(m.file, `${m.id} remedy points at lesson ${m.remedy.lesson}, which is not in the course map`);
  } else if (m.remedy.anchor && !target.figures.includes(m.remedy.anchor) && !hasAnchor(target.body, m.remedy.anchor)) {
    fail(m.file, `${m.id} remedy anchor #${m.remedy.anchor} is not in lesson ${m.remedy.lesson}`, true);
  }
}

/* -------------------------------------------------------------- lessons */

const TEMPLATE = ['Hook', 'Predict', 'Explore', 'Explain', 'Example', 'Check', 'Watch', 'Summary'];
/** A prose line of MDX: Markdown joins it with its neighbours into one paragraph. */
const prose = (s: string) => s.trim() !== '' && !/^\s*(<|\$\$|\||-|\*|#)/.test(s) && !s.includes('="') && !s.includes('$$');
for (const l of lessons) {
  // Markdown joins consecutive lines, so a part "(ב)" right after a text line, or after a sentence on the same line,
  // renders inside the previous paragraph. Twenty lessons shipped that way before this check.
  let inMath = false;
  l.body.split('\n').forEach((line, i, all) => {
    if (line.trim() === '$$') inMath = !inMath;
    if (inMath || !prose(line)) return;
    const joined = /^\s*(\([א-ח]\)|[א-ח]\.)\s/.test(line) && i > 0 && prose(all[i - 1]);
    if (joined || /[.?!:]\s+\([א-ח]\)\s/.test(line)) fail(l.file, `body line ${i + 1}: a part (א)/(ב) joins the previous paragraph; start it on its own line after a blank line`);
  });
  const blocks =[...l.body.matchAll(/<(Hook|Predict|Explore|Explain|Example|Check|Watch|Summary)\b/g)].map((m) => m[1]);
  for (const b of TEMPLATE) if (!blocks.includes(b)) fail(l.file, `lesson template: missing <${b}>`, true);
  let last = -1;
  for (const b of blocks) {
    const i = TEMPLATE.indexOf(b);
    if (i < last) fail(l.file, `lesson template: <${b}> comes after <${TEMPLATE[last]}>`);
    last = Math.max(last, i);
  }

  const spreadFigs = [...l.body.matchAll(/<Spread[\s\S]*?\bfig="([^"]+)"/g)].map((m) => m[1]);
  for (const f of spreadFigs) if (!l.figures.includes(f)) fail(l.file, `figure ${f} is not listed in frontmatter figures`);
  for (const f of l.figures) if (!spreadFigs.includes(f)) fail(l.file, `frontmatter figure ${f} has no <Spread>`, true);
  for (const m of l.body.matchAll(/<Step\s+fig="([^"]+)"/g)) {
    if (!spreadFigs.includes(m[1])) fail(l.file, `<Step fig="${m[1]}"> drives a figure that is not in this lesson`);
  }

  for (const m of l.body.matchAll(/<Watch\s+id="([^"]+)"/g)) {
    if (!videoIds.has(m[1])) fail(l.file, `<Watch id="${m[1]}">: not in videos.yaml`);
    if (!l.videos.includes(m[1])) fail(l.file, `<Watch id="${m[1]}"> is not listed in frontmatter videos`);
  }
  for (const v of l.videos) if (!videoIds.has(v)) fail(l.file, `frontmatter video ${v} is not in videos.yaml`);

  for (const m of l.body.matchAll(/<Check[\s\S]*?ids=\{\[([^\]]*)\]\}/g)) {
    for (const id of m[1].match(/'([^']+)'/g) ?? []) {
      const qid = id.slice(1, -1);
      if (!seenQ.has(qid)) fail(l.file, `<Check> asks for unknown question ${qid}`, true);
    }
  }
  // No time cap: a university lesson records its honest reading time (CLAUDE.md, "Time").
  const n = Number(l.id.split('.')[1]);
  // Lessons sort by `order`; a renumbering once changed ids and left the old orders behind.
  if (l.order !== n) fail(l.file, `order: ${l.order} does not match the lesson number ${l.id}`);
  // The course builds the limit-check habit, so every worked example shows one.
  for (const m of l.body.matchAll(/<Example\s+id="([^"]+)"[\s\S]*?<\/Example>/g)) {
    if (!m[0].includes('בדיקת גבולות')) fail(l.file, `${m[1]}: every worked example shows a **בדיקת גבולות**`);
  }
  for (const m of l.body.matchAll(/<Term\s+id="([^"]+)"/g)) {
    if (!glossaryIds.has(m[1])) fail(l.file, `<Term id="${m[1]}"> is not in glossary.yaml`);
  }

  // JS strings in MDX props turn "\f", "\v", "\t"… into control characters: TeX there must be doubled.
  // Only an unescaped backslash before a letter is a problem; "\\sqrt" is the doubled form.
  for (const m of l.body.matchAll(/=\{[\s\S]*?\}\}?/g)) {
    if (/'[^']*?(?<!\\)\\[a-z][^']*'/.test(m[0])) fail(l.file, `TeX backslash inside a JS string prop (${m[0].slice(0, 40)}…): use a "..." attribute or \\\\`);
  }
}

/* ------------------------------------------------------------- workbooks */

const seenW = new Set<string>();
const seenSource = new Map<string, string>(); // "<url> <problem number>" or "@<page url>" -> the challenge id that uses it
const workbookOf = new Map<string, string>();
for (const { file, data } of workbooks) {
  const lesson = lessonById.get(data.lesson);
  if (!lesson) {
    fail(file, `lesson ${data.lesson} is not written`);
    continue;
  }
  if (!file.endsWith(`/${data.lesson.replace('.', '-')}.yaml`)) fail(file, `the workbook of lesson ${data.lesson} belongs in a file named ${data.lesson.replace('.', '-')}.yaml`);
  workbookOf.set(data.lesson, file);
  const practice = data.practice ?? [];
  const challenge = data.challenge ?? [];
  if (practice.length !== 10) fail(file, `${practice.length} practice problems (a workbook has 10)`, true);
  if (challenge.length !== 2) fail(file, `${challenge.length} challenge problems (a workbook has 2)`, true);
  for (const level of ['basic', 'mid', 'bagrut']) {
    const k = practice.filter((p) => p.level === level).length;
    if (k < 2) fail(file, `only ${k} practice problem(s) at level ${level} (aim for 3 basic, 4 mid, 3 bagrut)`, true);
  }
  if (practice.filter((p) => p.qualitative).length < 3) fail(file, 'fewer than 3 qualitative practice problems', true);
  for (const o of lesson.objectives) {
    if (!practice.some((p) => p.objectives?.includes(o))) fail(file, `objective ${o} has no practice problem`, true);
  }
  for (const item of [...practice, ...challenge]) {
    const w = `${file} ${item.id}`;
    if (seenW.has(item.id)) fail(w, 'duplicate workbook id');
    seenW.add(item.id);
    if (!item.id.startsWith(`W-${data.lesson}-`)) fail(w, `the id does not match lesson ${data.lesson}`);
    for (const o of item.objectives ?? []) {
      if (!lesson.objectives.includes(o)) fail(w, `objective ${o} is not an objective of lesson ${data.lesson}`);
    }
    if (item.solution?.at(-1)?.kind !== 'result') fail(w, 'the full solution must end in a result step');
    // the build renders these with the same strictness; checking here lets the edit hook catch a bad formula
    const fields: [string, unknown][] = [['prompt', item.prompt], ['answer', item.answer], ...(item.solution ?? []).map((st, i): [string, unknown] => [`solution step ${i + 1}`, st.text])];
    for (const [k, v] of fields) {
      try {
        tex(String(v ?? ''), k);
      } catch (e) {
        fail(w, (e as Error).message);
      }
    }
    if (item.source) {
      // two agents writing lessons in parallel once picked the same olympiad problem
      // In one paper, "Q27", "Question 27" and "Section 2, Q.9 and Q.10" are compared by their question numbers
      const bare = /^\s*\d+[a-z]?\s*$/i.test(item.source.problem) ? [item.source.problem.trim().toLowerCase()] : [];
      const numbers = [
        ...bare,
        ...[...item.source.problem.matchAll(/\b(?:question|problem|q)\.?\s*(\d+[a-z]?(?:\([a-z0-9]+\))*)/gi)].map((m) => m[1].toLowerCase()),
      ];
      const keys = (numbers.length ? numbers : [item.source.problem.toLowerCase().replace(/[^a-z0-9()]/g, '')]).map((n) => `${item.source!.url} ${n}`);
      // one exam is often hosted at several URLs (4.4 and 4.10 cited two PDFs of PhysicsBowl 2018 for Q37):
      // also key on the competition, the year and the question number
      const exam = item.source.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const n of numbers) keys.push(`#${exam} ${item.source.year} ${n}`);
      // a web page usually holds one problem, so a shared page URL is the same problem; a PDF holds a whole paper
      if (!/\.pdf$/i.test(item.source.url)) keys.push(`@${item.source.url}`);
      const other = keys.map((k) => seenSource.get(k)).find(Boolean);
      if (other) fail(w, `the same source problem as ${other}; a challenge problem is used once in the course`);
      for (const k of keys) seenSource.set(k, item.id);
    }
    if (item.diagram && !item.diagramAlt?.trim()) fail(w, 'a diagram needs diagramAlt (its accessible description)');
    if (item.diagram && /<script|on\w+=/i.test(item.diagram)) fail(w, 'the diagram SVG must not contain scripts or event handlers');
  }
}

/* ------------------------------------------------------------- chapter summaries */

const SUMMARY_SECTIONS = ['הרעיון הגדול', 'מה חייבים לזכור', 'טעויות נפוצות', 'איך פותרים', 'רשימת בדיקה לפני מבחן'];
const unfinished: string[] = [];
const chaptersWithLessons = [...new Set(lessons.map((l) => Number(l.id.split('.')[0])))].sort((a, b) => a - b);
for (const sm of summaries) {
  if (!chaptersWithLessons.includes(sm.chapter)) fail(sm.file, `chapter ${sm.chapter} has no written lessons`);
  const headings = [...sm.body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  SUMMARY_SECTIONS.forEach((h, i) => {
    const at = headings.indexOf(h);
    if (at < 0) fail(sm.file, `missing the section "## ${h}"`);
    else if (at < headings.indexOf(SUMMARY_SECTIONS[i - 1] ?? h)) fail(sm.file, `"## ${h}" is out of order`);
  });
  for (const m of sm.body.matchAll(/<LessonLink\s+id="([^"]+)"(?:\s+anchor="([^"]+)")?/g)) {
    const target = lessonById.get(m[1]);
    if (!target) fail(sm.file, `<LessonLink id="${m[1]}">: lesson not written`);
    else if (m[2] && !hasAnchor(target.body, m[2])) fail(sm.file, `<LessonLink id="${m[1]}" anchor="${m[2]}">: no such id in the lesson`);
  }
}
for (const ch of chaptersWithLessons) {
  const done = summaries.some((sm) => sm.chapter === ch);
  for (const l of lessons.filter((x) => x.id.startsWith(`${ch}.`))) {
    const examples = (l.body.match(/<Example\b/g) ?? []).length;
    const missing = [examples < 6 && `${examples}/6 worked examples`, !workbookOf.has(l.id) && 'no workbook'].filter(Boolean);
    if (!missing.length) continue;
    if (done) fail(l.file, `chapter ${ch} has a summary, so the lesson needs 6 worked examples and a workbook: ${missing.join(', ')}`, true);
    else unfinished.push(`${l.id}: ${missing.join(', ')}`);
  }
}

/* ------------------------------------------------------------- glossary */

const texts = [
  ...lessons.map((l) => ({ where: l.file, text: l.body })),
  ...questions.map(({ q, file }) => ({ where: `${file} ${q.id}`, text: JSON.stringify(q) })),
  ...workbooks.map(({ file, data }) => ({ where: file, text: JSON.stringify(data) })),
  ...summaries.map((sm) => ({ where: sm.file, text: sm.body })),
];
/** A rejected phrase also matches in the definite form, where every word may take ה ("המטען האלמנטרי"). */
const rejectPattern = (bad: string) =>
  new RegExp(bad.trim().split(/\s+/).map((w) => `ה?${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).join('\\s+'));
for (const g of glossary) {
  for (const bad of g.reject ?? []) {
    const re = rejectPattern(bad);
    for (const t of texts) if (re.test(t.text)) fail(t.where, `"${bad}": the course spells this "${g.term}"`);
  }
}

/* --------------------------------------------------------------- report */

if (pending.length) {
  console.log(`lint-content: ${pending.length} Bagrut part(s) wait for objectives of lessons not written yet:
`);
  for (const p of pending) console.log(`  • ${p}`);
  console.log('');
}
if (unfinished.length && !onlyFile) {
  console.log(`lint-content: ${unfinished.length} lesson(s) in chapters without a summary still lack worked examples or a workbook:
`);
  for (const u of unfinished) console.log(`  • ${u}`);
  console.log('');
}
if (problems.length) {
  console.error(`lint-content: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`lint-content: ok${onlyFile ? ` for ${onlyFile}` : ''} (${lessons.length} lessons, ${questions.length} questions, ${misconceptions.length} misconceptions, ${glossary.length} terms, ${videos.length} videos, ${workbooks.length} workbooks, ${summaries.length} chapter summaries)`);
