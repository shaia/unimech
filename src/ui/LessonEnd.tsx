import { markLesson, progress } from '~/progress/store';
import { useMounted } from './useMounted';
import './stamp.css';

/** "I finished this lesson": a rubber stamp in the book, and a mark in the passport (המסלול שלי). */
export default function LessonEnd({ id, title }: { id: string; title: string }) {
  const mounted = useMounted();
  const done = mounted ? progress.value.lessons[id]?.completed : undefined;
  if (done) {
    const date = new Date(done).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
    return (
      <div class="lesson-end">
        <div class="stamp" role="img" aria-label={`חותמת: שיעור ${id} הושלם ב-${date}`}>
          <span class="stamp-top">הושלם</span>
          <span class="stamp-id ltr">{id}</span>
          <span class="stamp-date">{date}</span>
        </div>
        <p class="hand">החותמת נשמרה במסלול שלכם. כדי להגיע לשליטה, ענו נכון על שאלות התרגול של השיעור.</p>
      </div>
    );
  }
  return (
    <div class="lesson-end">
      <button type="button" class="btn primary" onClick={() => markLesson(id, 'completed')}>
        סיימתי את השיעור „{title}”
      </button>
    </div>
  );
}
