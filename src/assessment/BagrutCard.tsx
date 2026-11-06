/**
 * A Bagrut-style question: one scenario (text and an optional diagram) and lettered parts.
 * Auto-graded parts reuse QuestionCard; open parts use OpenPart. Every part records its own
 * attempt with its own objectives, and the card keeps a running score out of the total.
 */

import { useState } from 'preact/hooks';
import type { BagrutQuestion } from '~/content.config';
import type { AttemptKind } from '~/progress/store';
import { isOpen, partQuestion, partScore, totalPoints } from './bagrut';
import OpenPart from './OpenPart';
import QuestionCard from './QuestionCard';
import './question.css';

interface Props {
  q: BagrutQuestion;
  lesson?: string | null;
  kind?: AttemptKind;
  label?: string;
}

export default function BagrutCard({ q, lesson = null, kind = 'practice', label }: Props) {
  const [earned, setEarned] = useState<Record<string, number>>({});
  const [answered, setAnswered] = useState<Record<string, true>>({});
  const total = totalPoints(q);
  const score = Object.values(earned).reduce((s, v) => s + v, 0);
  const n = Object.keys(answered).length;

  return (
    <article class="bagrut" data-qid={q.id} data-type="bagrut">
      <header class="bagrut-head">
        <div class="q-meta">
          {label && <span class="q-num">{label}</span>}
          <span class="chip">שאלת חזרה</span>
          <span class="chip">
            <span class="ltr">{total}</span> נקודות
          </span>
        </div>
        <h3>{q.title}</h3>
        <div class="q-prompt" dangerouslySetInnerHTML={{ __html: q.prompt }} />
        {q.diagram && (
          <figure class="bagrut-diagram">
            <div class="ltr-space" role="img" aria-label={q.diagramAlt} dangerouslySetInnerHTML={{ __html: q.diagram }} />
          </figure>
        )}
        <p class="bagrut-note">כל רמז מוריד רבע מנקודות הסעיף (עד שנשארים 40% מהן). אפשר לענות על הסעיפים בכל סדר.</p>
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
            {isOpen(p) ? (
              <OpenPart
                q={q}
                part={p}
                lesson={lesson}
                kind={kind}
                onScored={(e) => {
                  setEarned((s) => ({ ...s, [p.label]: e }));
                  setAnswered((s) => ({ ...s, [p.label]: true }));
                }}
              />
            ) : (
              <QuestionCard
                q={partQuestion(q, p)}
                lesson={lesson}
                kind={kind}
                hintCost
                onGraded={(v, info) => {
                  setAnswered((s) => ({ ...s, [p.label]: true }));
                  setEarned((s) => ({ ...s, [p.label]: v.correct ? partScore(p.points, 1, info.hints) : (s[p.label] ?? 0) }));
                }}
              />
            )}
          </li>
        ))}
      </ol>

      <div class="bagrut-score" role="status" aria-live="polite">
        {n === 0 ? (
          <span>ענו על הסעיפים ותראו כאן את הניקוד.</span>
        ) : (
          <span>
            ניקוד עד כה: <strong class="ltr">{Math.round(score * 10) / 10}</strong> מתוך <span class="ltr">{total}</span>
            {n < q.parts.length && <> · נענו {n} מתוך {q.parts.length} סעיפים</>}
          </span>
        )}
      </div>
    </article>
  );
}
