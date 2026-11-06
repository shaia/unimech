/**
 * "המסלול שלי": the learner's own page. Everything here is read from the progress record in
 * this browser: the mastery map (chapter, lesson, objective), the misconceptions that keep
 * coming back with their remedies, the stamp passport, one suggestion for what to do next,
 * and export / import of the whole record.
 */

import { useRef, useState } from 'preact/hooks';
import { misconceptionStatus, objectiveMastery, type Level } from '~/progress/mastery';
import { nextStep } from '~/progress/next';
import { exportProgress, importProgress, persistent, progress } from '~/progress/store';
import { useMounted } from './useMounted';
import './stamp.css';

export interface MyPathChapter {
  n: number;
  title: string;
  lessons: { id: string; title: string; href: string; objectives: { id: string; text: string }[] }[];
}

interface Props {
  chapters: MyPathChapter[];
  misconceptions: Record<string, { title: string; truth: string; href: string; label: string }>;
  /** practice and test pages that exist, per chapter number */
  practice: { n: number; title: string; practiceHref: string; testHref: string }[];
}

const LEVEL_LABEL: Record<Level, string> = { none: '○ עוד לא התחלתם', learning: '◐ בלמידה', mastered: '● שליטה' };

export default function MyPath({ chapters, misconceptions, practice }: Props) {
  const mounted = useMounted();
  const state = mounted ? progress.value : null;
  const attempts = state?.attempts ?? [];
  const lessons = chapters.flatMap((c) => c.lessons);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = misconceptionStatus(attempts).filter((m) => m.active);
  const objectives = lessons.flatMap((l) => l.objectives);
  const masteredCount = objectives.filter((o) => objectiveMastery(attempts, o.id).level === 'mastered').length;
  const completed = lessons.filter((l) => state?.lessons[l.id]?.completed);

  const first = practice[0];
  const next =
    state && first
      ? nextStep({
          lessons: lessons.map((l) => ({ ...l, objectives: l.objectives.map((o) => o.id) })),
          state,
          remedies: misconceptions,
          practiceHref: first.practiceHref,
          testHref: first.testHref,
        })
      : null;

  const download = () => {
    const blob = new Blob([exportProgress()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `unimech-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMessage({ ok: true, text: 'הקובץ הורד. שמרו אותו במקום בטוח.' });
  };

  const upload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const before = progress.value.attempts.length;
    const res = importProgress(await file.text());
    input.value = '';
    if (res.ok) {
      const added = progress.value.attempts.length - before;
      setMessage({ ok: true, text: `ההתקדמות מהקובץ מוזגה לשלכם. נוספו ${added} ניסיונות.` });
    } else {
      setMessage({ ok: false, text: res.error });
    }
  };

  return (
    <div class="me-grid" data-ready={mounted ? '1' : '0'}>
      <section aria-labelledby="me-next">
        <h2 id="me-next">מה הלאה</h2>
        {next ? (
          <div class="next-step" data-kind={next.kind}>
            <p>
              <strong>{next.label}</strong>
            </p>
            <p>{next.reason}</p>
            <p>
              <a class="btn primary" href={next.href}>
                {next.kind === 'practice' || next.kind === 'test' || next.kind === 'retest' ? 'מתחילים' : 'ממשיכים'}
              </a>
            </p>
          </div>
        ) : (
          <p>טוענים את ההתקדמות שלכם…</p>
        )}
        {practice.length > 0 && (
          <p class="p-links">
            {practice.map((c) => (
              <span key={c.n} class="p-links">
                <a class="btn" href={c.practiceHref}>
                  דף תרגול · פרק {c.n}
                </a>
                <a class="btn" href={c.testHref}>
                  מבחן פרק {c.n}
                </a>
              </span>
            ))}
          </p>
        )}
      </section>

      <section aria-labelledby="me-map">
        <h2 id="me-map">מפת השליטה</h2>
        <p class="p-lede">
          שליטה במטרה נבנית מכמה תשובות נכונות, בלי רמזים, ובימים שונים. עד <span class="ltr">{objectives.length}</span> מטרות, שלטתם עד עכשיו ב-
          <span class="ltr" data-testid="mastered-count">
            {masteredCount}
          </span>
          .
        </p>
        {chapters.map((c) => (
          <div key={c.n} class="mastery-chapter">
            <h3>
              פרק <span class="ltr">{c.n}</span>: {c.title}
            </h3>
            {c.lessons.map((l) => (
              <div key={l.id} class="mastery-lesson" data-lesson={l.id}>
                <h4>
                  <span class="ltr">{l.id}</span>
                  <a href={l.href}>{l.title}</a>
                </h4>
                <ul>
                  {l.objectives.map((o) => {
                    const m = objectiveMastery(attempts, o.id);
                    return (
                      <li key={o.id} data-objective={o.id} data-level={m.level}>
                        <span>{o.text}</span>
                        <span class={`level ${m.level}`}>{LEVEL_LABEL[m.level]}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section aria-labelledby="me-mc">
        <h2 id="me-mc">טעויות מושגיות שחוזרות</h2>
        {!mounted ? (
          <p>טוענים…</p>
        ) : active.length === 0 ? (
          <p data-testid="no-misconceptions">אין כרגע טעות מושגית פעילה. טעות נחשבת פעילה אחרי שתי הצטברויות של תשובה שגויה, ונסגרת אחרי שתי תשובות נכונות על שאלות שבודקות אותה.</p>
        ) : (
          <ul class="report-list" data-testid="misconceptions">
            {active.map((a) => {
              const m = misconceptions[a.id];
              return (
                <li key={a.id} data-misconception={a.id}>
                  <strong>{m?.title ?? a.id}</strong>
                  {m && <p>{m.truth}</p>}
                  {m && (
                    <a class="btn" href={m.href}>
                      {m.label}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="me-pass">
        <h2 id="me-pass">דרכון החותמות</h2>
        <p class="p-lede">
          חותמת מקבלים בסוף שיעור, בלחיצה על „סיימתי את השיעור”. סיימתם <span class="ltr">{completed.length}</span> מתוך{' '}
          <span class="ltr">{lessons.length}</span>.
        </p>
        <div class="passport">
          {lessons.map((l) => {
            const done = state?.lessons[l.id]?.completed;
            const date = done ? new Date(done).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }) : '';
            return (
              <div key={l.id} class="passport-slot" data-lesson={l.id} data-done={done ? '1' : '0'}>
                {done ? (
                  <div class="stamp" role="img" aria-label={`חותמת: שיעור ${l.id} הושלם ב-${date}`}>
                    <span class="stamp-top">הושלם</span>
                    <span class="stamp-id ltr">{l.id}</span>
                    <span class="stamp-date">{date}</span>
                  </div>
                ) : (
                  <div class="passport-empty" role="img" aria-label={`שיעור ${l.id} עוד לא הושלם`}>
                    <span class="ltr">{l.id}</span>
                  </div>
                )}
                <a href={l.href}>{l.title}</a>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="me-save">
        <h2 id="me-save">שמירה והעברה</h2>
        <p class="local-note" role="note">
          ההתקדמות נשמרת <strong>רק בדפדפן הזה, במחשב או בטלפון הזה</strong>. אין חשבון ואין שרת. אם תנקו את נתוני האתר, תעברו מכשיר או תפתחו חלון גלישה
          פרטית, היא לא תהיה שם. כדי לא לאבד אותה, ייצאו קובץ מדי פעם.
          {mounted && !persistent.value && <> <strong>הדפדפן הזה חוסם שמירה, ולכן ההתקדמות תישמר רק עד שתסגרו את הלשונית.</strong></>}
        </p>
        <div class="io-row">
          <button type="button" class="btn primary" onClick={download}>
            ייצוא ההתקדמות לקובץ
          </button>
          <label class="btn">
            ייבוא מקובץ
            <input ref={fileRef} type="file" accept=".json,application/json" class="sr-only" onChange={upload} />
          </label>
        </div>
        <p class="p-note">ייבוא ממזג את הקובץ עם מה ששמור כאן. שום דבר לא נמחק, וניסיונות שכבר קיימים לא נספרים פעמיים.</p>
        {message && (
          <p class={`io-msg ${message.ok ? 'ok' : 'bad'}`} role="status">
            {message.text}
          </p>
        )}
      </section>
    </div>
  );
}
