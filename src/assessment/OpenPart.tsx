/**
 * An open Bagrut part: the student writes a solution, reveals the model solution in Bagrut
 * format, then ticks a rubric against their own work. The ticks decide the credit, and the
 * part is recorded as one attempt, so mastery sees evidence from self-assessed parts too.
 */

import { useState } from 'preact/hooks';
import type { BagrutQuestion, OpenPart as OpenPartData } from '~/content.config';
import { recordAttempt, type AttemptKind } from '~/progress/store';
import { gradeOpen, partId, partScore } from './bagrut';
import './question.css';

const STEP_LABEL: Record<OpenPartData['solution'][number]['kind'], string> = {
  formula: 'נוסחה מדף הנוסחאות',
  law: 'החוק הכללי',
  manipulation: 'סידור הביטוי',
  substitution: 'הצבה עם יחידות',
  limit: 'בדיקת גבולות',
  units: 'בדיקת יחידות',
  result: 'תוצאה: ספרות משמעותיות ויחידות',
};

interface Props {
  q: BagrutQuestion;
  part: OpenPartData;
  lesson?: string | null;
  kind?: AttemptKind;
  /** called once, when the student finishes the self-check */
  onScored: (earned: number) => void;
}

export default function OpenPart({ q, part, lesson = null, kind = 'practice', onScored }: Props) {
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [ticked, setTicked] = useState<boolean[]>(() => part.rubric.map(() => false));
  const [done, setDone] = useState<{ earned: number; fraction: number } | null>(null);
  const [hints, setHints] = useState(0);

  const finish = () => {
    const v = gradeOpen(part, ticked);
    const earned = partScore(part.points, v.fraction, hints);
    setDone({ earned, fraction: v.fraction });
    recordAttempt({
      qid: partId(q, part),
      lesson,
      kind,
      objectives: part.objectives,
      probes: [],
      misconception: null,
      correct: v.correct,
      confident: null,
      hints,
    });
    onScored(earned);
  };

  const passed = done !== null && done.fraction >= part.passMark;

  return (
    <div class={`qcard open-part ${done ? (passed ? 'is-right' : 'is-wrong') : ''}`} data-qid={partId(q, part)} data-type="open">
      <div class="q-meta">
        <span class="chip">פתרון מלא</span>
        <span class="chip">הערכה עצמית</span>
      </div>
      <div class="q-prompt" dangerouslySetInnerHTML={{ __html: part.prompt }} />

      <label class="open-write">
        <span class="open-write-label">כתבו את הפתרון שלכם: נוסחה, הצבה עם יחידות ותוצאה.</span>
        <textarea
          rows={5}
          value={text}
          disabled={revealed}
          spellcheck={false}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        />
      </label>

      {hints > 0 && (
        <ol class="q-hints">
          {part.hints.slice(0, hints).map((h, i) => (
            <li key={i} class="hand" dangerouslySetInnerHTML={{ __html: h }} />
          ))}
        </ol>
      )}

      {!revealed && (
        <div class="q-actions">
          <button type="button" class="btn primary" disabled={text.trim() === ''} onClick={() => setRevealed(true)}>
            הראו פתרון לדוגמה
          </button>
          {hints < part.hints.length && (
            <button type="button" class="btn ghost" onClick={() => setHints((n) => n + 1)}>
              רמז {part.hints.length > 1 ? `(${hints + 1}/${part.hints.length})` : ''} · עולה בנקודות
            </button>
          )}
          {text.trim() === '' && <span class="open-note">קודם נסו בעצמכם: ההשוואה לפתרון מלמדת הרבה יותר.</span>}
        </div>
      )}

      {revealed && (
        <div class="open-model">
          <p class="kicker">פתרון לדוגמה</p>
          <ol class="open-steps">
            {part.solution.map((s, i) => (
              <li key={i} data-kind={s.kind}>
                <span class="open-step-kind">{STEP_LABEL[s.kind]}</span>
                <span class="open-step-text" dangerouslySetInnerHTML={{ __html: s.text }} />
              </li>
            ))}
          </ol>

          <fieldset class="open-rubric" disabled={done !== null}>
            <legend class="q-subprompt">בדקו את הפתרון שלכם מול הסעיפים. סמנו את מה שעשיתם נכון.</legend>
            {part.rubric.map((r, i) => (
              <label key={i} class={`q-choice ${ticked[i] ? 'on' : ''}`}>
                <input type="checkbox" checked={ticked[i]} onChange={() => setTicked(ticked.map((t, k) => (k === i ? !t : t)))} />
                <span dangerouslySetInnerHTML={{ __html: r.text }} />
              </label>
            ))}
          </fieldset>

          {!done && (
            <div class="q-actions">
              <button type="button" class="btn primary" onClick={finish}>
                סיימתי את הבדיקה
              </button>
            </div>
          )}
        </div>
      )}

      {done && (
        <div class={`q-feedback ${passed ? 'ok' : 'bad'}`} role="status">
          <p class="q-verdict">
            ציון עצמי: <span class="ltr">{done.earned}</span> מתוך <span class="ltr">{part.points}</span> נקודות
          </p>
          <p>
            {passed
              ? 'עמדתם ברוב הסעיפים. התוצאה נשמרה במסלול שלכם.'
              : 'חזרו על הסעיפים שלא סימנתם והשוו שוב לפתרון. התוצאה נשמרה במסלול שלכם.'}
          </p>
        </div>
      )}

      {part.explanation && done && (
        <div class="q-explanation">
          <p class="kicker">הסבר</p>
          <div dangerouslySetInnerHTML={{ __html: part.explanation }} />
        </div>
      )}
    </div>
  );
}
