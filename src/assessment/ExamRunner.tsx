/**
 * The final exam, in the format of the 77101 exam (src/assessment/exams.ts). Four phases in one island:
 *   intro    - the cover page: the rules, an optional clock;
 *   running  - every question in full, no solutions; the student marks the questions they answer (at most
 *              `answer` of `count`) and solves on paper;
 *   grading  - for each marked question, each part's model solution and its rubric; the student ticks the
 *              rubric against their own paper (gradeOpen), as in an open review part;
 *   report   - the score out of answer × points, per question and per part, and the lessons to review.
 *
 * The exam lasts hours, so its state is kept in localStorage (`unimech:exam:<id>`) and survives a reload or a
 * closed tab; the clock is a deadline, not a counter. Attempts are recorded once, on finishing the grading,
 * with kind 'test', so mastery sees the exam as evidence like a chapter test.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ExamProblem } from '~/content.config';
import { readItem, removeItem, writeItem } from '~/progress/safe-storage';
import { recordAttempt } from '~/progress/store';
import { useMounted } from '~/ui/useMounted';
import { gradeOpen, partId } from './bagrut';
import type { ExamSpec } from './exams';
import { lessonOfObjective } from './ids';
import { STEP_LABEL } from './OpenPart';
import './question.css';

interface Props {
  spec: ExamSpec;
  problems: ExamProblem[];
  lessons: Record<string, { title: string; href: string }>;
  sheetHref: string;
  meHref: string;
}

type Phase = 'intro' | 'running' | 'grading' | 'report';

interface Saved {
  phase: Phase;
  timed: boolean;
  startedAt: number | null;
  deadline: number | null;
  endedAt: number | null;
  chosen: string[];
  /** rubric ticks per part id */
  ticks: Record<string, boolean[]>;
}

const fresh = (): Saved => ({ phase: 'intro', timed: true, startedAt: null, deadline: null, endedAt: null, chosen: [], ticks: {} });

const hhmmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function load(key: string): Saved | null {
  try {
    const raw = readItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    if (!['intro', 'running', 'grading', 'report'].includes(s.phase) || !Array.isArray(s.chosen) || typeof s.ticks !== 'object') return null;
    return s;
  } catch {
    return null;
  }
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export default function ExamRunner({ spec, problems, lessons, sheetHref, meHref }: Props) {
  const key = `unimech:exam:${spec.id}`;
  const mounted = useMounted();
  const [s, setS] = useState<Saved>(fresh);
  const [now, setNow] = useState(0);
  const finishRef = useRef<() => void>(() => {});

  // restore after hydration: the server renders the cover page
  useEffect(() => {
    const saved = load(key);
    if (saved) setS(saved);
    setNow(Date.now());
  }, []);

  const update = (next: Saved) => {
    setS(next);
    writeItem(key, JSON.stringify(next));
  };

  const start = () => {
    const t = Date.now();
    setNow(t);
    update({ ...fresh(), timed: s.timed, phase: 'running', startedAt: t, deadline: s.timed ? t + spec.minutes * 60_000 : null });
    window.scrollTo(0, 0);
  };

  const submit = () => {
    const t = Date.now();
    const ticks = { ...s.ticks };
    for (const q of problems) for (const p of q.parts) ticks[partId(q, p)] ??= p.rubric.map(() => false);
    update({ ...s, phase: 'grading', endedAt: t, deadline: null, ticks });
    window.scrollTo(0, 0);
  };
  finishRef.current = submit;

  const scoreOf = (q: ExamProblem) =>
    q.parts.map((p) => {
      const v = gradeOpen(p, s.ticks[partId(q, p)] ?? []);
      return { p, fraction: v.fraction, correct: v.correct, earned: round1(p.points * v.fraction) };
    });

  const finishGrading = () => {
    for (const q of problems.filter((x) => s.chosen.includes(x.id))) {
      for (const r of scoreOf(q)) {
        recordAttempt({
          qid: partId(q, r.p),
          lesson: null,
          kind: 'test',
          objectives: r.p.objectives,
          probes: [],
          misconception: null,
          correct: r.correct,
          confident: null,
          hints: 0,
        });
      }
    }
    update({ ...s, phase: 'report' });
    window.scrollTo(0, 0);
  };

  const restart = () => {
    removeItem(key);
    setS(fresh());
    window.scrollTo(0, 0);
  };

  // the clock: a deadline, so a reload or a sleeping laptop does not stop it
  useEffect(() => {
    if (s.phase !== 'running' || s.deadline === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= (s.deadline ?? Infinity)) finishRef.current();
    }, 1000);
    return () => clearInterval(id);
  }, [s.phase, s.deadline]);

  const toggleChosen = (id: string) => {
    const has = s.chosen.includes(id);
    if (!has && s.chosen.length >= spec.answer) return;
    update({ ...s, chosen: has ? s.chosen.filter((x) => x !== id) : [...s.chosen, id] });
  };

  const tick = (pid: string, i: number) => {
    const cur = s.ticks[pid] ?? [];
    const next = [...cur];
    next[i] = !next[i];
    update({ ...s, ticks: { ...s.ticks, [pid]: next } });
  };

  const total = spec.answer * spec.points;

  /* ----------------------------------------------------------------- intro */
  if (!mounted || s.phase === 'intro') {
    return (
      <div class="exam-intro" data-phase="intro">
        <ul class="exam-rules">
          <li>
            משך המבחן: <span class="ltr">{spec.minutes / 60}</span> שעות.
          </li>
          <li>
            במבחן <span class="ltr">{spec.count}</span> שאלות. ענו על <strong>{spec.answer}</strong> מהן לבחירתכם. כל שאלה שווה{' '}
            <span class="ltr">{spec.points}</span> נקודות, והציון המרבי <span class="ltr">{total}</span>.
          </li>
          <li>יש לנמק כל תשובה: פיתוח מהחוק הכללי, תוצאה סימבולית, בדיקת גבולות ויחידות, ומספרים רק כשמבקשים.</li>
          <li>
            חומר עזר: דפי הנוסחאות שלכם (שני דפים, ארבעה עמודי A4), מחשבון, טבלת אינטגרלים. אין דף קבועים: כל מספר שצריך
            נתון בשאלה. <a href={sheetHref}>דף נוסחאות לדוגמה, להדפסה</a>.
          </li>
          <li>
            כתבו על נייר. בסוף המבחן תראו פתרון לדוגמה לכל סעיף ותבדקו את עצמכם מול רשימת בדיקה, כמו בודק של מבחן. בודק
            מחמיר עם עצמו לומד יותר.
          </li>
        </ul>
        <div class="test-options">
          <label>
            <input type="checkbox" checked={s.timed} disabled={!mounted} onChange={(e) => setS({ ...s, timed: (e.target as HTMLInputElement).checked })} />
            מבחן עם שעון (<span class="ltr">{spec.minutes}</span> דקות)
          </label>
          <p class="p-note">המבחן נשמר בדפדפן: אפשר לסגור את הדף ולחזור אליו, והשעון ממשיך לרוץ.</p>
        </div>
        <div class="p-links">
          <button type="button" class="btn primary" disabled={!mounted} onClick={start}>
            התחלת המבחן
          </button>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------- running */
  if (s.phase === 'running') {
    const left = s.deadline === null ? null : s.deadline - now;
    return (
      <div class="exam-run" data-phase="running">
        <div class="test-bar">
          <span>
            בחרתם <strong class="ltr">{s.chosen.length}</strong> מתוך <span class="ltr">{spec.answer}</span> שאלות
          </span>
          {left !== null && (
            <span class={`test-timer ${left < 10 * 60_000 ? 'low' : ''}`} role="timer" aria-label="הזמן שנשאר">
              <span class="ltr">{hhmmss(left)}</span>
            </span>
          )}
          <button type="button" class="btn primary" onClick={submit}>
            סיום המבחן
          </button>
        </div>
        {problems.map((q, i) => {
          const on = s.chosen.includes(q.id);
          return (
            <article key={q.id} class={`bagrut exam-q ${on ? 'chosen' : ''}`} data-qid={q.id}>
              <header class="bagrut-head">
                <div class="q-meta">
                  <span class="q-num">שאלה {i + 1}</span>
                  <span class="chip">
                    <span class="ltr">{spec.points}</span> נקודות
                  </span>
                </div>
                <h3>{q.title}</h3>
                <div class="q-prompt" dangerouslySetInnerHTML={{ __html: q.prompt }} />
                {q.diagram && (
                  <figure class="bagrut-diagram">
                    <div class="ltr-space" role="img" aria-label={q.diagramAlt} dangerouslySetInnerHTML={{ __html: q.diagram }} />
                  </figure>
                )}
              </header>
              <ol class="bagrut-parts">
                {q.parts.map((p) => (
                  <li key={p.label} class="b-part" data-part={p.label}>
                    <h4 class="b-part-head">
                      סעיף {p.label}
                      <span class="chip">
                        <span class="ltr">{p.points}</span> נקודות
                      </span>
                    </h4>
                    <div class="q-prompt" dangerouslySetInnerHTML={{ __html: p.prompt }} />
                  </li>
                ))}
              </ol>
              <label class={`exam-choose ${on ? 'on' : ''}`}>
                <input type="checkbox" checked={on} disabled={!on && s.chosen.length >= spec.answer} onChange={() => toggleChosen(q.id)} />
                אני עונה על שאלה {i + 1}
              </label>
            </article>
          );
        })}
        <div class="p-links">
          <button type="button" class="btn primary" onClick={submit}>
            סיום המבחן ובדיקה עצמית
          </button>
        </div>
      </div>
    );
  }

  const chosen = problems.filter((q) => s.chosen.includes(q.id));
  const used = s.startedAt !== null && s.endedAt !== null ? s.endedAt - s.startedAt : null;

  /* --------------------------------------------------------------- grading */
  if (s.phase === 'grading') {
    return (
      <div class="exam-grade" data-phase="grading">
        <p class="p-lede">
          עכשיו אתם הבודקים. לכל סעיף בשאלות שבחרתם: קראו את הפתרון לדוגמה, והשוו אליו את מה שכתבתם על הנייר. סמנו רק את
          מה שמופיע אצלכם במפורש. תוצאה נכונה בלי נימוק אינה מקבלת את השורה של הנימוק.
        </p>
        {used !== null && (
          <p class="p-note">
            הזמן שלקח לכם: <span class="ltr">{hhmmss(used)}</span>
          </p>
        )}
        {chosen.length === 0 && <p>לא סימנתם אף שאלה. אפשר לחזור ולהתחיל מבחן חדש, או לקרוא את הפתרונות שלמטה.</p>}
        {chosen.map((q) => (
          <article key={q.id} class="bagrut exam-q" data-qid={q.id}>
            <header class="bagrut-head">
              <div class="q-meta">
                <span class="q-num">שאלה {problems.indexOf(q) + 1}</span>
              </div>
              <h3>{q.title}</h3>
              <details class="exam-recall">
                <summary>נוסח השאלה</summary>
                <div class="q-prompt" dangerouslySetInnerHTML={{ __html: q.prompt }} />
                {q.diagram && (
                  <figure class="bagrut-diagram">
                    <div class="ltr-space" role="img" aria-label={q.diagramAlt} dangerouslySetInnerHTML={{ __html: q.diagram }} />
                  </figure>
                )}
              </details>
            </header>
            <ol class="bagrut-parts">
              {q.parts.map((p) => {
                const pid = partId(q, p);
                const t = s.ticks[pid] ?? [];
                const earned = round1(p.points * gradeOpen(p, t).fraction);
                return (
                  <li key={p.label} class="b-part" data-part={p.label}>
                    <h4 class="b-part-head">
                      סעיף {p.label}
                      <span class="chip">
                        <span class="ltr">
                          {earned}/{p.points}
                        </span>{' '}
                        נקודות
                      </span>
                    </h4>
                    <div class="q-prompt" dangerouslySetInnerHTML={{ __html: p.prompt }} />
                    <SolutionSteps steps={p.solution} />
                    <fieldset class="open-rubric">
                      <legend class="q-subprompt">מה מופיע בפתרון שלכם?</legend>
                      {p.rubric.map((r, i) => (
                        <label key={i} class={`q-choice ${t[i] ? 'on' : ''}`}>
                          <input type="checkbox" checked={!!t[i]} onChange={() => tick(pid, i)} />
                          <span dangerouslySetInnerHTML={{ __html: r.text }} />
                        </label>
                      ))}
                    </fieldset>
                  </li>
                );
              })}
            </ol>
          </article>
        ))}
        <div class="p-links">
          <button type="button" class="btn primary" onClick={finishGrading}>
            סיימתי לבדוק: לציון
          </button>
        </div>
        <OtherSolutions problems={problems.filter((q) => !s.chosen.includes(q.id))} all={problems} />
      </div>
    );
  }

  /* ---------------------------------------------------------------- report */
  const rows = chosen.map((q) => {
    const parts = scoreOf(q);
    return { q, parts, earned: round1(parts.reduce((a, r) => a + r.earned, 0)) };
  });
  const score = round1(rows.reduce((a, r) => a + r.earned, 0));
  const weak = [
    ...new Set(
      rows
        .flatMap((r) => r.parts.filter((x) => !x.correct))
        .flatMap((x) => x.p.objectives)
        .map((o) => lessonOfObjective(o))
        .filter((l): l is string => !!l && !!lessons[l]),
    ),
  ].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  return (
    <div class="exam-report" data-phase="report">
      <div class="test-score" role="status">
        <strong class="ltr" data-testid="score">
          {score}/{total}
        </strong>
        <span>
          הציון שנתתם לעצמכם
          {used !== null && (
            <>
              {' '}
              · זמן: <span class="ltr">{hhmmss(used)}</span>
            </>
          )}
        </span>
      </div>

      <section>
        <h2>ציון לפי שאלה</h2>
        <div class="table-scroll">
          <table class="report-table">
            <thead>
              <tr>
                <th scope="col">שאלה</th>
                <th scope="col">סעיפים</th>
                <th scope="col">ציון</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.q.id}>
                  <td>
                    <span class="ltr">{problems.indexOf(r.q) + 1}</span>. {r.q.title}
                  </td>
                  <td>
                    {r.parts.map((x, k) => (
                      <span key={x.p.label} class={`verdict-mark ${x.correct ? 'ok' : 'bad'}`}>
                        {k > 0 && ' '}
                        {x.p.label}: <span class="ltr">{x.earned}/{x.p.points}</span>
                      </span>
                    ))}
                  </td>
                  <td>
                    <span class="ltr">
                      {r.earned}/{spec.points}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length < spec.answer && (
                <tr>
                  <td colSpan={3}>
                    ענו על <span class="ltr">{rows.length}</span> שאלות מתוך <span class="ltr">{spec.answer}</span>: השאר נספרות כאפס.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>מה כדאי לחזור עליו</h2>
        {weak.length === 0 ? (
          <p>עמדתם בכל הסעיפים שבחרתם. קראו גם את הפתרונות של השאלה שלא בחרתם: במבחן האמיתי אין בחירה בשאלות שנוחות לכם.</p>
        ) : (
          <ul class="report-list">
            {weak.map((l) => (
              <li key={l}>
                <a href={lessons[l].href}>
                  שיעור <span class="ltr">{l}</span> {lessons[l].title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <OtherSolutions problems={problems} all={problems} title="הפתרונות של כל השאלות" />

      <div class="p-links">
        <button type="button" class="btn primary" onClick={restart}>
          מבחן מחדש
        </button>
        <a class="btn" href={meHref}>
          המסלול שלי
        </a>
      </div>
    </div>
  );
}

function SolutionSteps({ steps }: { steps: ExamProblem['parts'][number]['solution'] }) {
  return (
    <div class="open-model">
      <p class="kicker">פתרון לדוגמה</p>
      <ol class="open-steps">
        {steps.map((st, i) => (
          <li key={i} data-kind={st.kind}>
            <span class="open-step-kind">{STEP_LABEL[st.kind]}</span>
            <span class="open-step-text" dangerouslySetInnerHTML={{ __html: st.text }} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The questions not graded, to read: every one of them is a worked exam question. */
function OtherSolutions({ problems, all, title = 'הפתרונות של השאלות שלא בחרתם' }: { problems: ExamProblem[]; all: ExamProblem[]; title?: string }) {
  if (problems.length === 0) return null;
  return (
    <section class="report-review">
      <h2>{title}</h2>
      {problems.map((q) => (
        <details key={q.id} data-qid={q.id}>
          <summary>
            שאלה <span class="ltr">{all.indexOf(q) + 1}</span>: {q.title}
          </summary>
          <div class="q-prompt" dangerouslySetInnerHTML={{ __html: q.prompt }} />
          {q.diagram && (
            <figure class="bagrut-diagram">
              <div class="ltr-space" role="img" aria-label={q.diagramAlt} dangerouslySetInnerHTML={{ __html: q.diagram }} />
            </figure>
          )}
          {q.parts.map((p) => (
            <div key={p.label} class="exam-solution">
              <h4 class="b-part-head">סעיף {p.label}</h4>
              <div class="q-prompt" dangerouslySetInnerHTML={{ __html: p.prompt }} />
              <SolutionSteps steps={p.solution} />
            </div>
          ))}
        </details>
      ))}
    </section>
  );
}
