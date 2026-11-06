import { useEffect, useState } from 'preact/hooks';
import { progress } from '~/progress/store';

interface PredictData {
  choices: string[];
  answer: number;
}

/**
 * "Your prediction vs what you found": closes the loop the lesson's <Predict> opened.
 * Reads the choices from the JSON the matching <Predict> left on the page.
 */
export default function Revisit({ id }: { id: string }) {
  const [data, setData] = useState<PredictData | null>(null);
  useEffect(() => {
    const el = document.querySelector(`script[data-predict="${CSS.escape(id)}"]`);
    if (el?.textContent) setData(JSON.parse(el.textContent) as PredictData);
  }, [id]);
  // never render nothing: client:visible observes the island's children, so an empty island
  // would never hydrate. This empty box is what the server sends and what it observes.
  if (!data) return <div class="revisit" aria-hidden="true" />;
  const saved = progress.value.predictions[id];
  if (!saved) {
    return <p class="revisit hand">בתחילת השיעור לא נרשם חיזוי. אפשר לחזור למעלה ולנסות, גם עכשיו.</p>;
  }
  const mine = Number(saved.choice);
  const right = mine === data.answer;
  return (
    <div class={`revisit ${right ? 'right' : 'wrong'}`}>
      <p class="hand">
        החיזוי שלכם בתחילת השיעור: <span dangerouslySetInnerHTML={{ __html: data.choices[mine] ?? '' }} />
      </p>
      {right ? (
        <p>והאינטואיציה צדקה. עכשיו יש לכם גם את ההסבר.</p>
      ) : (
        <p>
          מה שגיליתם: <span dangerouslySetInnerHTML={{ __html: data.choices[data.answer] }} />. חיזוי שגוי הוא חלק מהלמידה:
          טעות שמתגלה בניסוי נזכרת הרבה יותר טוב מכלל שנאמר בהרצאה.
        </p>
      )}
    </div>
  );
}
