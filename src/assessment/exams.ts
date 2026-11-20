/**
 * Final exams in the format of the 77101 exam (src/content/exam-map.yaml, the 2016 exams): 3 hours, five
 * questions of 25 points, the student answers four of them, every answer a justified derivation; no aid but the
 * student's own formula sheets (4 A4 pages) and a calculator. The questions of exam `<id>` are
 * src/content/exams/<id>/q1.yaml … q<count>.yaml (lint checks that all of them exist).
 */

export interface ExamSpec {
  id: string;
  title: string;
  /** the Hebrew name of the sitting, as on the university's exams */
  sitting: string;
  minutes: number;
  /** how many questions the exam has, and how many of them the student answers */
  count: number;
  answer: number;
  /** points of each question */
  points: number;
}

export const EXAMS: ExamSpec[] = [
  { id: 'final-a', title: 'מבחן מסכם', sitting: 'מועד א׳', minutes: 180, count: 5, answer: 4, points: 25 },
  { id: 'final-b', title: 'מבחן מסכם', sitting: 'מועד ב׳', minutes: 180, count: 5, answer: 4, points: 25 },
];

export const examById = (id: string) => EXAMS.find((e) => e.id === id);

/** `E-final-a-3` → { exam: 'final-a', n: 3 } */
export function parseExamId(id: string): { exam: string; n: number } | null {
  const m = id.match(/^E-(.+)-(\d+)$/);
  return m ? { exam: m[1], n: Number(m[2]) } : null;
}
