/** Renders any question kind: a Bagrut multi-part question or a single-card question. */

import type { Question } from '~/content.config';
import type { AttemptKind } from '~/progress/store';
import BagrutCard from './BagrutCard';
import QuestionCard from './QuestionCard';

interface Props {
  q: Question;
  lesson?: string | null;
  kind?: AttemptKind;
  label?: string;
}

export default function AnyQuestion({ q, lesson = null, kind = 'check', label }: Props) {
  if (q.type === 'bagrut') return <BagrutCard q={q} lesson={lesson} kind={kind} label={label} />;
  return <QuestionCard q={q} lesson={lesson} kind={kind} label={label} />;
}
