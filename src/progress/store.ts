/**
 * The learner's progress: predictions, answer attempts, finished lessons and figure tasks.
 *
 * Lives in the browser only (localStorage via safe-storage), with a versioned schema so later
 * releases can migrate it, and JSON export/import so a learner can move devices or hand a
 * file to a teacher. The ProgressStore surface is what a future server backend would replace.
 */

import { signal } from '@preact/signals';
import { readItem, storageAvailable, writeItem } from './safe-storage';

export type AttemptKind = 'check' | 'practice' | 'test' | 'review';

export interface Attempt {
  qid: string;
  lesson: string | null;
  kind: AttemptKind;
  objectives: string[];
  /** misconceptions this question is built to detect (from its distractors) */
  probes: string[];
  /** misconception tag of the chosen distractor, when the answer was wrong */
  misconception: string | null;
  correct: boolean;
  /** "I'm sure" (true) / "not sure" (false) / not asked (null) */
  confident: boolean | null;
  hints: number;
  at: number;
}

export interface LessonRecord {
  visited?: number;
  completed?: number;
}

export interface ProgressState {
  version: 1;
  createdAt: number;
  predictions: Record<string, { choice: string; at: number }>;
  attempts: Attempt[];
  lessons: Record<string, LessonRecord>;
  tasks: Record<string, number>;
}

const KEY = 'unimech:v1';

export function emptyProgress(): ProgressState {
  return { version: 1, createdAt: Date.now(), predictions: {}, attempts: [], lessons: {}, tasks: {} };
}

/** Structural validation for anything read from storage or an imported file. */
export function parseProgress(raw: unknown): ProgressState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  const isRecord = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!isRecord(o.predictions) || !Array.isArray(o.attempts) || !isRecord(o.lessons)) return null;
  // files written by older releases may lack the later fields; only these three are required
  type StoredAttempt = Pick<Attempt, 'qid' | 'correct' | 'objectives'> & Partial<Attempt>;
  const attempts = (o.attempts as unknown[]).filter(
    (a): a is StoredAttempt =>
      !!a &&
      typeof a === 'object' &&
      typeof (a as Attempt).qid === 'string' &&
      typeof (a as Attempt).correct === 'boolean' &&
      Array.isArray((a as Attempt).objectives),
  );
  const defaults: Omit<Attempt, 'qid' | 'correct' | 'objectives'> = {
    probes: [],
    misconception: null,
    hints: 0,
    confident: null,
    lesson: null,
    kind: 'check',
    at: 0,
  };
  return {
    version: 1,
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : Date.now(),
    predictions: o.predictions as ProgressState['predictions'],
    attempts: attempts.map((a) => ({ ...defaults, ...a })),
    lessons: o.lessons as ProgressState['lessons'],
    tasks: isRecord(o.tasks) ? (o.tasks as ProgressState['tasks']) : {},
  };
}

function load(): ProgressState {
  if (typeof window === 'undefined') return emptyProgress();
  try {
    const raw = readItem(KEY);
    return (raw && parseProgress(JSON.parse(raw))) || emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export const progress = signal<ProgressState>(load());

/** False when the browser refuses storage: progress then lasts only for this tab. */
export const persistent = signal<boolean>(typeof window !== 'undefined' ? storageAvailable() : true);

function commit(next: ProgressState) {
  progress.value = next;
  writeItem(KEY, JSON.stringify(next));
  persistent.value = storageAvailable();
}

export function recordPrediction(id: string, choice: string) {
  const p = progress.value;
  if (p.predictions[id]) return; // a prediction is a commitment; it is never overwritten
  commit({ ...p, predictions: { ...p.predictions, [id]: { choice, at: Date.now() } } });
}

export function recordAttempt(a: Omit<Attempt, 'at'>) {
  const p = progress.value;
  commit({ ...p, attempts: [...p.attempts, { ...a, at: Date.now() }] });
}

export function markLesson(id: string, field: keyof LessonRecord) {
  const p = progress.value;
  const rec = p.lessons[id] ?? {};
  if (rec[field]) return;
  commit({ ...p, lessons: { ...p.lessons, [id]: { ...rec, [field]: Date.now() } } });
}

export function markTask(id: string) {
  const p = progress.value;
  if (p.tasks[id]) return;
  commit({ ...p, tasks: { ...p.tasks, [id]: Date.now() } });
}

export function exportProgress(): string {
  return JSON.stringify({ ...progress.value, exportedAt: new Date().toISOString(), app: 'unimech' }, null, 2);
}

/** Merge an imported file into the current progress; attempts are de-duplicated by (qid, at). */
export function importProgress(text: string): { ok: true } | { ok: false; error: string } {
  let parsed: ProgressState | null = null;
  try {
    parsed = parseProgress(JSON.parse(text));
  } catch {
    return { ok: false, error: 'הקובץ אינו JSON תקין.' };
  }
  if (!parsed) return { ok: false, error: 'הקובץ אינו קובץ התקדמות של הקורס.' };
  const cur = progress.value;
  const seen = new Set(cur.attempts.map((a) => `${a.qid}@${a.at}`));
  const attempts = [...cur.attempts, ...parsed.attempts.filter((a) => !seen.has(`${a.qid}@${a.at}`))].sort(
    (a, b) => a.at - b.at,
  );
  const lessons: ProgressState['lessons'] = { ...parsed.lessons };
  for (const [id, rec] of Object.entries(cur.lessons)) lessons[id] = { ...lessons[id], ...rec };
  commit({
    version: 1,
    createdAt: Math.min(cur.createdAt, parsed.createdAt),
    predictions: { ...parsed.predictions, ...cur.predictions },
    attempts,
    lessons,
    tasks: { ...parsed.tasks, ...cur.tasks },
  });
  return { ok: true };
}

export function resetProgress() {
  commit(emptyProgress());
}

if (typeof window !== 'undefined') {
  // another tab changed progress: follow it
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      const next = parseProgress(JSON.parse(e.newValue));
      if (next) progress.value = next;
    } catch {
      /* ignore */
    }
  });
}
