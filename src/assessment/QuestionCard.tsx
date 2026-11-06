/**
 * One question, any type: answer, commit with a confidence level, get feedback traced to the
 * misconception behind a wrong answer, retry, and see the worked explanation.
 *
 * Confidence is asked in the same click as checking ("check — I'm sure" / "check — not sure"),
 * before the verdict is visible, so it reflects what the student believed.
 */

import { useState } from 'preact/hooks';
import { recordAttempt, type AttemptKind } from '~/progress/store';
import type { Simple } from './bagrut';
import { grade, parseNumber, probesOf, type Answer, type Dir, type Verdict } from './check';
import './question.css';

type Question = Simple;

export interface GradedInfo {
  hints: number;
  confident: boolean | null;
}

interface Props {
  q: Question;
  /** lesson the question is embedded in, for the attempt record */
  lesson?: string | null;
  kind?: AttemptKind;
  /** shown in the header, e.g. "שאלה 2" */
  label?: string;
  /** called after every graded attempt (tests use it to tally scores) */
  onGraded?: (v: Verdict, info: GradedInfo) => void;
  /** tell the student that hints cost points (Bagrut parts) */
  hintCost?: boolean;
}

export type Draft =
  | { type: 'mc'; choice: number | null }
  | { type: 'multi'; choices: number[] }
  | { type: 'numeric'; text: string }
  | { type: 'vector'; dir: Dir | null }
  | { type: 'rank'; order: string[]; tied: boolean[] }
  | { type: 'twotier'; choice: number | null; reason: number | null };

export function emptyDraft(q: Question): Draft {
  switch (q.type) {
    case 'mc':
      return { type: 'mc', choice: null };
    case 'multi':
      return { type: 'multi', choices: [] };
    case 'numeric':
      return { type: 'numeric', text: '' };
    case 'vector':
      return { type: 'vector', dir: null };
    case 'rank':
      return { type: 'rank', order: q.items.map((i) => i.id), tied: q.items.slice(1).map(() => false) };
    case 'twotier':
      return { type: 'twotier', choice: null, reason: null };
  }
}

/** The draft as a gradable answer, or a reason it is not ready yet. */
export function toAnswer(d: Draft): Answer | { error: string } | null {
  switch (d.type) {
    case 'mc':
      return d.choice === null ? null : { type: 'mc', choice: d.choice };
    case 'multi':
      return d.choices.length === 0 ? null : { type: 'multi', choices: d.choices };
    case 'numeric': {
      if (d.text.trim() === '') return null;
      const v = parseNumber(d.text);
      return v === null ? { error: 'לא הצלחנו לקרוא את המספר. כתבו למשל 3.6e4 או 3.6*10^4.' } : { type: 'numeric', value: v };
    }
    case 'vector':
      return d.dir === null ? null : { type: 'vector', dir: d.dir };
    case 'rank':
      return { type: 'rank', order: d.order, tied: d.tied };
    case 'twotier':
      return d.choice === null || d.reason === null ? null : { type: 'twotier', choice: d.choice, reason: d.reason };
  }
}

const TYPE_LABEL: Record<Question['type'], string> = {
  mc: 'בחירה',
  multi: 'כמה תשובות נכונות',
  numeric: 'חישוב',
  vector: 'כיוון',
  rank: 'דירוג',
  twotier: 'תשובה ונימוק',
};

export default function QuestionCard({ q, lesson = null, kind = 'check', label, onGraded, hintCost = false }: Props) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(q));
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [tries, setTries] = useState(0);
  const [hints, setHints] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = toAnswer(draft);
  const locked = verdict !== null;
  const solved = verdict?.correct === true;

  const check = (confident: boolean | null) => {
    const a = toAnswer(draft);
    if (!a) return;
    if ('error' in a) {
      setError(a.error);
      return;
    }
    setError(null);
    const v = grade(q, a);
    setVerdict(v);
    setTries((n) => n + 1);
    recordAttempt({
      qid: q.id,
      lesson,
      kind,
      objectives: q.objectives,
      probes: probesOf(q),
      misconception: v.misconception,
      correct: v.correct,
      confident,
      hints,
    });
    onGraded?.(v, { hints, confident });
  };

  const retry = () => {
    setVerdict(null);
    if (draft.type === 'numeric') return; // keep the typed number for editing
    setDraft(emptyDraft(q));
  };

  return (
    <div class={`qcard ${verdict ? (verdict.correct ? 'is-right' : 'is-wrong') : ''}`} data-qid={q.id} data-type={q.type}>
      <div class="q-meta">
        {label && <span class="q-num">{label}</span>}
        <span class="chip">{TYPE_LABEL[q.type]}</span>
        {q.qualitative && <span class="chip">איכותית</span>}
        {q.level === 'bagrut' && <span class="chip">רמת מבחן</span>}
      </div>
      <div class="q-prompt" dangerouslySetInnerHTML={{ __html: q.prompt }} />

      <AnswerArea q={q} draft={draft} setDraft={(d) => (setError(null), setDraft(d))} locked={locked} verdict={verdict} />

      {hints > 0 && (
        <ol class="q-hints">
          {q.hints.slice(0, hints).map((h, i) => (
            <li key={i} class="hand" dangerouslySetInnerHTML={{ __html: h }} />
          ))}
        </ol>
      )}

      {error && (
        <p class="q-error" role="alert">
          {error}
        </p>
      )}

      {!locked && (
        <div class="q-actions">
          {q.confidence ? (
            <>
              <button type="button" class="btn primary" disabled={!answer} onClick={() => check(true)}>
                בדיקה · בטוחים
              </button>
              <button type="button" class="btn" disabled={!answer} onClick={() => check(false)}>
                בדיקה · לא בטוחים
              </button>
            </>
          ) : (
            <button type="button" class="btn primary" disabled={!answer} onClick={() => check(null)}>
              בדיקה
            </button>
          )}
          {hints < q.hints.length && (
            <button type="button" class="btn ghost" onClick={() => setHints((n) => n + 1)}>
              רמז {q.hints.length > 1 ? `(${hints + 1}/${q.hints.length})` : ''}{hintCost ? ' · עולה בנקודות' : ''}
            </button>
          )}
        </div>
      )}

      {verdict && (
        <div class={`q-feedback ${verdict.correct ? 'ok' : 'bad'}`} role="status">
          <p class="q-verdict">{verdict.correct ? 'נכון!' : 'לא בדיוק.'}</p>
          {verdict.feedback.filter(Boolean).map((f, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: f }} />
          ))}
          <div class="q-actions">
            {!solved && (
              <button type="button" class="btn primary" onClick={retry}>
                נסו שוב
              </button>
            )}
            {!solved && q.explanation && !showSolution && (
              <button type="button" class="btn ghost" onClick={() => setShowSolution(true)}>
                הראו לי את הפתרון
              </button>
            )}
          </div>
        </div>
      )}

      {q.explanation && (solved || showSolution || tries >= 3) && (
        <div class="q-explanation">
          <p class="kicker">הסבר</p>
          <div dangerouslySetInnerHTML={{ __html: q.explanation }} />
        </div>
      )}
    </div>
  );
}

interface AreaProps {
  q: Question;
  draft: Draft;
  setDraft: (d: Draft) => void;
  locked: boolean;
  verdict: Verdict | null;
}

export function AnswerArea({ q, draft, setDraft, locked, verdict }: AreaProps) {
  const name = `${q.id}-ans`;
  switch (q.type) {
    case 'mc':
    case 'multi': {
      const multi = q.type === 'multi';
      const d = draft as Extract<Draft, { type: 'mc' | 'multi' }>;
      const isOn = (i: number) => (d.type === 'mc' ? d.choice === i : d.choices.includes(i));
      return (
        <fieldset class="q-choices">
          <legend class="sr-only">{multi ? 'סמנו את כל התשובות הנכונות' : 'בחרו תשובה'}</legend>
          {q.choices.map((c, i) => (
            <label key={i} class={`q-choice ${isOn(i) ? 'on' : ''} ${locked && isOn(i) ? (c.correct ? 'right' : 'wrong') : ''}`}>
              <input
                type={multi ? 'checkbox' : 'radio'}
                name={name}
                checked={isOn(i)}
                disabled={locked}
                onChange={() =>
                  d.type === 'mc'
                    ? setDraft({ type: 'mc', choice: i })
                    : setDraft({ type: 'multi', choices: d.choices.includes(i) ? d.choices.filter((x) => x !== i) : [...d.choices, i] })
                }
              />
              <span dangerouslySetInnerHTML={{ __html: c.text }} />
            </label>
          ))}
        </fieldset>
      );
    }
    case 'twotier': {
      const d = draft as Extract<Draft, { type: 'twotier' }>;
      return (
        <div class="q-twotier">
          <fieldset class="q-choices">
            <legend class="sr-only">בחרו תשובה</legend>
            {q.choices.map((c, i) => (
              <label key={i} class={`q-choice ${d.choice === i ? 'on' : ''} ${locked && d.choice === i ? (c.correct ? 'right' : 'wrong') : ''}`}>
                <input type="radio" name={`${name}-a`} checked={d.choice === i} disabled={locked} onChange={() => setDraft({ ...d, choice: i })} />
                <span dangerouslySetInnerHTML={{ __html: c.text }} />
              </label>
            ))}
          </fieldset>
          <fieldset class="q-choices reasons">
            <legend class="q-subprompt" dangerouslySetInnerHTML={{ __html: q.reasonPrompt }} />
            {q.reasons.map((c, i) => (
              <label key={i} class={`q-choice ${d.reason === i ? 'on' : ''} ${locked && d.reason === i ? (c.correct ? 'right' : 'wrong') : ''}`}>
                <input type="radio" name={`${name}-r`} checked={d.reason === i} disabled={locked} onChange={() => setDraft({ ...d, reason: i })} />
                <span dangerouslySetInnerHTML={{ __html: c.text }} />
              </label>
            ))}
          </fieldset>
        </div>
      );
    }
    case 'numeric': {
      const d = draft as Extract<Draft, { type: 'numeric' }>;
      return (
        <div class={`q-numeric ${verdict ? (verdict.correct ? 'right' : 'wrong') : ''}`}>
          <label>
            <span class="sr-only">{q.unit ? `התשובה, ב-${q.unit}` : 'התשובה, מספר בלי יחידות'}</span>
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              autoComplete="off"
              spellcheck={false}
              value={d.text}
              disabled={locked}
              onInput={(e) => setDraft({ type: 'numeric', text: (e.target as HTMLInputElement).value })}
            />
          </label>
          <span class="q-unit q">{q.unit}</span>
          <p class="q-numeric-help">אפשר לכתוב חזקות של 10 כך: <bdi dir="ltr">1.5*10^-3</bdi> או <bdi dir="ltr">1.5e-3</bdi></p>
        </div>
      );
    }
    case 'vector': {
      const d = draft as Extract<Draft, { type: 'vector' }>;
      return <Rose value={d.dir} allowOutIn={q.allowOutIn} locked={locked} verdict={verdict} onPick={(dir) => setDraft({ type: 'vector', dir })} />;
    }
    case 'rank': {
      const d = draft as Extract<Draft, { type: 'rank' }>;
      const labelOf = (id: string) => q.items.find((i) => i.id === id)?.label ?? id;
      const move = (i: number, by: -1 | 1) => {
        const j = i + by;
        if (j < 0 || j >= d.order.length) return;
        const order = [...d.order];
        [order[i], order[j]] = [order[j], order[i]];
        setDraft({ ...d, order });
      };
      return (
        <div class="q-rank">
          <p class="q-rank-help">סדרו מהגדול לקטן. אם שניים שווים, לחצו על „=” ביניהם.</p>
          <ol>
            {d.order.map((id, i) => (
              <li key={id}>
                <div class="q-rank-item">
                  <span class="q-rank-pos">{i + 1}</span>
                  <span class="q-rank-label" dangerouslySetInnerHTML={{ __html: labelOf(id) }} />
                  <span class="q-rank-moves">
                    <button type="button" class="btn ghost" disabled={locked || i === 0} aria-label="למעלה" onClick={() => move(i, -1)}>
                      ▲
                    </button>
                    <button type="button" class="btn ghost" disabled={locked || i === d.order.length - 1} aria-label="למטה" onClick={() => move(i, 1)}>
                      ▼
                    </button>
                  </span>
                </div>
                {i < d.order.length - 1 && (
                  <button
                    type="button"
                    class={`q-rank-rel ${d.tied[i] ? 'tied' : ''}`}
                    aria-pressed={d.tied[i]}
                    disabled={locked}
                    title={d.tied[i] ? 'שווים' : 'גדול מ-'}
                    onClick={() => setDraft({ ...d, tied: d.tied.map((t, k) => (k === i ? !t : t)) })}
                  >
                    {d.tied[i] ? '=' : '>'}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
      );
    }
  }
}

const ROSE: { dir: Dir; label: string; glyph: string; angle: number }[] = [
  { dir: 'e', label: 'ימינה', glyph: '→', angle: 0 },
  { dir: 'ne', label: 'ימינה ולמעלה', glyph: '↗', angle: 45 },
  { dir: 'n', label: 'למעלה', glyph: '↑', angle: 90 },
  { dir: 'nw', label: 'שמאלה ולמעלה', glyph: '↖', angle: 135 },
  { dir: 'w', label: 'שמאלה', glyph: '←', angle: 180 },
  { dir: 'sw', label: 'שמאלה ולמטה', glyph: '↙', angle: 225 },
  { dir: 's', label: 'למטה', glyph: '↓', angle: 270 },
  { dir: 'se', label: 'ימינה ולמטה', glyph: '↘', angle: 315 },
];

function Rose(p: { value: Dir | null; allowOutIn: boolean; locked: boolean; verdict: Verdict | null; onPick: (d: Dir) => void }) {
  const cls = (d: Dir) => `rose-btn ${p.value === d ? 'on' : ''} ${p.locked && p.value === d ? (p.verdict?.correct ? 'right' : 'wrong') : ''}`;
  return (
    <div class="q-rose-wrap">
      <div class="q-rose ltr-space" role="radiogroup" aria-label="בחרו כיוון">
        {ROSE.map((r) => {
          const a = (r.angle * Math.PI) / 180;
          return (
            <button
              key={r.dir}
              type="button"
              role="radio"
              aria-checked={p.value === r.dir}
              aria-label={r.label}
              class={cls(r.dir)}
              disabled={p.locked}
              style={{ left: `${50 + 38 * Math.cos(a)}%`, top: `${50 - 38 * Math.sin(a)}%` }}
              onClick={() => p.onPick(r.dir)}
            >
              {r.glyph}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={p.value === 'zero'}
          aria-label="אפס: אין כיוון"
          class={`${cls('zero')} zero`}
          disabled={p.locked}
          style={{ left: '50%', top: '50%' }}
          onClick={() => p.onPick('zero')}
        >
          0
        </button>
      </div>
      {p.allowOutIn && (
        <div class="q-outin" role="radiogroup" aria-label="ניצב לדף">
          <button type="button" role="radio" aria-checked={p.value === 'out'} class={cls('out')} disabled={p.locked} onClick={() => p.onPick('out')}>
            <span class="ltr">⊙</span> החוצה מהדף
          </button>
          <button type="button" role="radio" aria-checked={p.value === 'in'} class={cls('in')} disabled={p.locked} onClick={() => p.onPick('in')}>
            <span class="ltr">⊗</span> לתוך הדף
          </button>
        </div>
      )}
    </div>
  );
}
