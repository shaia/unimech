/**
 * Build-time rendering of a question: every student-facing string goes through tex(), so the
 * browser receives finished HTML (no KaTeX shipped to the client) and a broken formula in a
 * YAML bank fails the build with the question id in the message.
 */

import type { Question } from '~/content.config';
import { tex } from '~/lib/tex';
import { isOpen, partQuestion } from './bagrut';
import { seededShuffle } from './shuffle';

export function renderQuestion(q: Question): Question {
  const t = (s: string, field: string) => tex(s, `${q.id}.${field}`);
  const base = {
    ...q,
    prompt: t(q.prompt, 'prompt'),
    hints: q.hints.map((h, i) => t(h, `hints[${i}]`)),
    explanation: q.explanation ? t(q.explanation, 'explanation') : undefined,
  };
  // render first (error messages keep the YAML index), then shuffle unless the author opted out
  const choices = <C extends { text: string; feedback: string }>(cs: C[], name: string) => {
    const rendered = cs.map((c, i) => ({ ...c, text: t(c.text, `${name}[${i}].text`), feedback: t(c.feedback, `${name}[${i}].feedback`) }));
    return (q as { shuffle?: boolean }).shuffle === false ? rendered : seededShuffle(rendered, `${q.id}:${name}`);
  };

  switch (q.type) {
    case 'mc':
    case 'multi':
      return { ...base, type: q.type, choices: choices(q.choices, 'choices') } as Question;
    case 'twotier':
      return {
        ...base,
        type: 'twotier',
        choices: choices(q.choices, 'choices'),
        reasons: choices(q.reasons, 'reasons'),
        reasonPrompt: t(q.reasonPrompt, 'reasonPrompt'),
      } as Question;
    case 'numeric':
      return {
        ...base,
        type: 'numeric',
        correctFeedback: t(q.correctFeedback, 'correctFeedback'),
        wrongFeedback: t(q.wrongFeedback, 'wrongFeedback'),
        commonWrong: q.commonWrong.map((w, i) => ({ ...w, feedback: t(w.feedback, `commonWrong[${i}]`) })),
      } as Question;
    case 'vector':
      return {
        ...base,
        type: 'vector',
        correctFeedback: t(q.correctFeedback, 'correctFeedback'),
        wrongFeedback: t(q.wrongFeedback, 'wrongFeedback'),
        wrong: q.wrong.map((w, i) => ({ ...w, feedback: t(w.feedback, `wrong[${i}]`) })),
      } as Question;
    case 'bagrut':
      return {
        ...base,
        type: 'bagrut',
        title: t(q.title, 'title'),
        parts: q.parts.map((p) => {
          if (!isOpen(p)) return { ...renderQuestion(partQuestion(q, p)), label: p.label, points: p.points } as unknown as typeof p;
          const pt = (s: string, field: string) => tex(s, `${q.id}/${p.label}.${field}`);
          return {
            ...p,
            id: `${q.id}/${p.label}`,
            prompt: pt(p.prompt, 'prompt'),
            hints: p.hints.map((h, i) => pt(h, `hints[${i}]`)),
            explanation: p.explanation ? pt(p.explanation, 'explanation') : undefined,
            solution: p.solution.map((s, i) => ({ ...s, text: pt(s.text, `solution[${i}]`) })),
            rubric: p.rubric.map((r, i) => ({ ...r, text: pt(r.text, `rubric[${i}]`) })),
          };
        }),
      } as Question;
    case 'rank':
      return {
        ...base,
        type: 'rank',
        items: q.items.map((it, i) => ({ ...it, label: t(it.label, `items[${i}]`) })),
        correctFeedback: t(q.correctFeedback, 'correctFeedback'),
        wrongFeedback: t(q.wrongFeedback, 'wrongFeedback'),
      } as Question;
  }
}
