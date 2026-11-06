/**
 * The chapter test. Three phases in one island:
 *   intro   - what the test is, an optional timer;
 *   running - questions drawn by buildTest (every objective at least once), no feedback;
 *   report  - score, per-objective mastery, misconceptions with their remedies, what to review.
 *
 * Attempts are recorded only on submission, with kind 'test', so the answer history that
 * mastery reads is the same as for practice.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { objectiveMastery, type Level } from '~/progress/mastery';
import { progress, recordAttempt } from '~/progress/store';
import { grade, probesOf, type Verdict } from './check';
import { lessonOfObjective, lessonOfQuestion } from './ids';
import { emptyDraft, toAnswer, AnswerArea, type Draft } from './QuestionCard';
import type { Simple } from './bagrut';
import { buildTest } from './test-builder';
import './question.css';

interface Props {
  pool: Simple[];
  objectives: { id: string; text: string }[];
  lessons: Record<string, { title: string; href: string }>;
  misconceptions: Record<string, { title: string; truth: string; href: string; label: string }>;
  practiceHref: string;
  meHref: string;
}

interface Result {
  q: Simple;
  answered: boolean;
  verdict: Verdict | null;
  correct: boolean;
}

const LEVEL_LABEL: Record<Level, string> = { none: '○ עוד לא נבחנתם', learning: '◐ בלמידה', mastered: '● שליטה' };
const DEFAULT_MINUTES = 30;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export default function TestRunner({ pool, objectives, lessons, misconceptions, practiceHref, meHref }: Props) {
  const [phase, setPhase] = useState<'intro' | 'running' | 'report'>('intro');
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [seed, setSeed] = useState(0);
  const [questions, setQuestions] = useState<Simple[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [sure, setSure] = useState<Record<string, boolean>>({});
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const submitRef = useRef<() => void>(() => {});

  const start = (explicitSeed?: number) => {
    const fromUrl = new URLSearchParams(location.search).get('seed');
    const s = explicitSeed ?? (fromUrl && /^\d+$/.test(fromUrl) ? Number(fromUrl) : Math.floor(Math.random() * 1_000_000));
    const { ids } = buildTest(pool, objectives.map((o) => o.id), s);
    const picked = ids.map((id) => pool.find((p) => p.id === id)!);
    setSeed(s);
    setQuestions(picked);
    setDrafts(Object.fromEntries(picked.map((q) => [q.id, emptyDraft(q)])));
    setSure({});
    const t = Date.now();
    setNow(t);
    setDeadline(timed ? t + minutes * 60_000 : null);
    setPhase('running');
    window.scrollTo(0, 0);
  };

  const submit = () => {
    const rs: Result[] = questions.map((q) => {
      const a = toAnswer(drafts[q.id]);
      const ready = a !== null && !('error' in a);
      const verdict = ready ? grade(q, a) : null;
      const correct = verdict?.correct === true;
      recordAttempt({
        qid: q.id,
        lesson: lessonOfQuestion(q.id),
        kind: 'test',
        objectives: q.objectives,
        probes: probesOf(q),
        misconception: verdict?.misconception ?? null,
        correct,
        confident: ready ? (sure[q.id] ?? false) : false,
        hints: 0,
      });
      return { q, answered: ready, verdict, correct };
    });
    setResults(rs);
    setDeadline(null);
    setPhase('report');
    window.scrollTo(0, 0);
  };
  submitRef.current = submit;

  // the clock: ticks once a second and submits when time is up
  useEffect(() => {
    if (phase !== 'running' || deadline === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) submitRef.current();
    }, 1000);
    return () => clearInterval(id);
  }, [phase, deadline]);

  if (phase === 'intro') {
    return (
      <div class="test-intro" data-phase="intro">
        <p class="p-lede">
          המבחן נבחר מתוך שאלות הפרק, ומכסה את כל <span class="ltr">{objectives.length}</span> המטרות לפחות פעם אחת. אין משוב עד ההגשה: עונים, מגישים,
          ורק אז רואים את הדוח. השאלות מסודרות מהקל לקשה.
        </p>
        <div class="test-options">
          <label>
            <input type="checkbox" checked={timed} onChange={(e) => setTimed((e.target as HTMLInputElement).checked)} />
            מבחן עם שעון
          </label>
          {timed && (
            <label>
              משך המבחן בדקות
              <input
                type="number"
                min={5}
                max={180}
                value={minutes}
                onInput={(e) => setMinutes(Math.min(180, Math.max(5, Number((e.target as HTMLInputElement).value) || DEFAULT_MINUTES)))}
              />
            </label>
          )}
          <p class="p-note">בלי שעון אפשר לקחת כמה זמן שרוצים. במבחן של הקורס עובדים מול שעון, ולכן כדאי לנסות גם עם שעון.</p>
        </div>
        <div class="p-links">
          <button type="button" class="btn primary" onClick={() => start()}>
            התחלת המבחן
          </button>
          <a class="btn" href={practiceHref}>
            קודם לתרגל
          </a>
        </div>
      </div>
    );
  }

  if (phase === 'running') {
    const answered = questions.filter((q) => {
      const a = toAnswer(drafts[q.id]);
      return a !== null && !('error' in a);
    }).length;
    const left = deadline === null ? null : deadline - now;
    return (
      <div class="test-run" data-phase="running">
        <div class="test-bar">
          <span>
            ענו על <strong class="ltr">{answered}</strong> מתוך <span class="ltr">{questions.length}</span>
          </span>
          {left !== null && (
            <span class={`test-timer ${left < 60_000 ? 'low' : ''}`} role="timer" aria-label="הזמן שנשאר">
              <span class="ltr">{mmss(left)}</span>
            </span>
          )}
          <button type="button" class="btn primary" onClick={submit}>
            הגשה וקבלת דוח
          </button>
        </div>
        {questions.map((q, i) => (
          <div key={q.id} class="test-q" data-qid={q.id} data-type={q.type}>
            <div class="test-q-head">
              <span class="q-num">שאלה {i + 1}</span>
            </div>
            <div class="q-prompt" dangerouslySetInnerHTML={{ __html: q.prompt }} />
            <AnswerArea q={q} draft={drafts[q.id]} setDraft={(d) => setDrafts({ ...drafts, [q.id]: d })} locked={false} verdict={null} />
            {q.confidence && (
              <label class="test-sure">
                <input
                  type="checkbox"
                  checked={sure[q.id] ?? false}
                  onChange={(e) => setSure({ ...sure, [q.id]: (e.target as HTMLInputElement).checked })}
                />
                בטוחים בתשובה
              </label>
            )}
          </div>
        ))}
        <div class="p-links">
          <button type="button" class="btn primary" onClick={submit}>
            הגשה וקבלת דוח
          </button>
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------------------- report */
  const right = results.filter((r) => r.correct).length;
  const pct = results.length ? Math.round((100 * right) / results.length) : 0;
  const attempts = progress.value.attempts;
  const objRows = objectives
    .map((o) => {
      const mine = results.filter((r) => r.q.objectives.includes(o.id));
      return { o, n: mine.length, right: mine.filter((r) => r.correct).length, level: objectiveMastery(attempts, o.id).level };
    })
    .filter((r) => r.n > 0);
  const found = [...new Set(results.flatMap((r) => (!r.correct && r.verdict?.misconception ? [r.verdict.misconception] : [])))];
  const review = [
    ...new Set(
      objRows
        .filter((r) => r.right < r.n)
        .map((r) => lessonOfObjective(r.o.id))
        .filter((l): l is string => !!l && !!lessons[l]),
    ),
  ];

  return (
    <div class="test-report" data-phase="report">
      <div class="test-score" role="status">
        <strong class="ltr" data-testid="score">
          {right}/{results.length}
        </strong>
        <span>
          תשובות נכונות ({pct}%). מספר המבחן: <span class="ltr">{seed}</span>
        </span>
      </div>

      <section>
        <h2>שליטה לפי מטרה</h2>
        <div class="table-scroll">
          <table class="report-table">
            <thead>
              <tr>
                <th scope="col">מטרה</th>
                <th scope="col">במבחן</th>
                <th scope="col">מצב כולל</th>
              </tr>
            </thead>
            <tbody>
              {objRows.map((r) => (
                <tr key={r.o.id}>
                  <td>
                    <span class="ltr">{r.o.id}</span> {r.o.text}
                  </td>
                  <td>
                    <span class="ltr">
                      {r.right}/{r.n}
                    </span>
                  </td>
                  <td>
                    <span class={`level ${r.level}`}>{LEVEL_LABEL[r.level]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>טעויות מושגיות שזוהו</h2>
        {found.length === 0 ? (
          <p>לא זוהתה בתשובות טעות מושגית מוכרת.</p>
        ) : (
          <ul class="report-list">
            {found.map((id) => {
              const m = misconceptions[id];
              return (
                <li key={id}>
                  <strong>{m?.title ?? id}</strong>
                  {m && <p>{m.truth}</p>}
                  {m && (
                    <a href={m.href} class="btn">
                      {m.label}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2>מה כדאי לחזור עליו</h2>
        {review.length === 0 ? (
          <p>ענו נכון על כל המטרות שנבחנו. המשיכו לדף התרגול כדי לשמור על הידע.</p>
        ) : (
          <ul class="report-list">
            {review.map((l) => (
              <li key={l}>
                <a href={lessons[l].href}>
                  שיעור <span class="ltr">{l}</span> {lessons[l].title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="report-review">
        <h2>סקירת השאלות</h2>
        {results.map((r, i) => (
          <details key={r.q.id} data-qid={r.q.id}>
            <summary>
              שאלה {i + 1}:{' '}
              <span class={`verdict-mark ${r.correct ? 'ok' : 'bad'}`}>{r.correct ? 'נכון' : r.answered ? 'לא נכון' : 'לא נענתה'}</span>
            </summary>
            <div class="q-prompt" dangerouslySetInnerHTML={{ __html: r.q.prompt }} />
            {r.verdict?.feedback.filter(Boolean).map((f, k) => <p key={k} dangerouslySetInnerHTML={{ __html: f }} />)}
            {!r.correct && r.q.explanation && <div dangerouslySetInnerHTML={{ __html: r.q.explanation }} />}
          </details>
        ))}
      </section>

      <div class="p-links">
        <button type="button" class="btn primary" onClick={() => start(Math.floor(Math.random() * 1_000_000))}>
          מבחן חדש
        </button>
        <a class="btn" href={practiceHref}>
          לדף התרגול
        </a>
        <a class="btn" href={meHref}>
          המסלול שלי
        </a>
      </div>
    </div>
  );
}
