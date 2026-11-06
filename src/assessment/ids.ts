/** Id conventions, shared by build-time pages and browser islands (no Astro imports here). */

/** "Q-1.5-ratio" → "1.5"; Bagrut questions ("Q-1-bagrut-2") belong to no single lesson. */
export function lessonOfQuestion(id: string): string | null {
  return id.match(/^Q-(\d+\.\d+)-/)?.[1] ?? null;
}

/** "OBJ-1.5-3" → "1.5" */
export function lessonOfObjective(id: string): string | null {
  return id.match(/^OBJ-(\d+\.\d+)-/)?.[1] ?? null;
}
