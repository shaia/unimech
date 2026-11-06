import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { progress, recordPrediction } from '~/progress/store';
import '~/assessment/question.css';
import './flap.css';
import { useMounted } from './useMounted';

interface Props {
  id: string;
  prompt: string;
  choices: string[];
  children?: ComponentChildren;
}

/** The "lift the flap" prediction: choose, commit, and only then see what is under the flap. */
export default function PredictIsland({ id, prompt, choices, children }: Props) {
  const mounted = useMounted();
  const saved = mounted ? progress.value.predictions[id] : undefined;
  const [pick, setPick] = useState<number | null>(null);
  const committed = !!saved;
  // a prediction committed in another tab, or restored by import, opens the flap here too
  useEffect(() => {
    if (saved) setPick(Number(saved.choice));
  }, [saved?.choice]);

  return (
    <div class={`predict ${committed ? 'is-open' : ''}`} data-predict-id={id}>
      <div class="predict-prompt" dangerouslySetInnerHTML={{ __html: prompt }} />
      <fieldset class="q-choices predict-choices">
        <legend class="sr-only">החיזוי שלכם</legend>
        {choices.map((c, i) => (
          <label key={i} class={`q-choice ${pick === i ? 'on' : ''}`}>
            <input type="radio" name={`predict-${id}`} checked={pick === i} disabled={committed} onChange={() => setPick(i)} />
            <span dangerouslySetInnerHTML={{ __html: c }} />
          </label>
        ))}
      </fieldset>
      {!committed && (
        <div class="predict-actions">
          <button type="button" class="btn primary" disabled={pick === null} onClick={() => pick !== null && recordPrediction(id, String(pick))}>
            זה החיזוי שלי
          </button>
          <span class="hand predict-why">אין כאן ציון. מתחייבים כדי לגלות אם האינטואיציה צדקה.</span>
        </div>
      )}
      <div class="flap" aria-hidden={!committed}>
        <div class="flap-cover" aria-hidden="true">
          <span class="hand">הרימו את הדש אחרי שתחזו ↑</span>
        </div>
        <div class="flap-inner" inert={!committed}>
          {committed && pick !== null && (
            <p class="hand flap-yours">
              חזיתם: <span dangerouslySetInnerHTML={{ __html: choices[pick] }} />
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
