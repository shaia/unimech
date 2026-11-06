# מכניקה ויחסות פרטית: ספר לימוד חי

An interactive, Hebrew-only course in first-year university mechanics and special relativity, following the
Hebrew University syllabus of **77101 "מכניקה ויחסות פרטית"**: mathematical introduction, kinematics, Newton's laws,
conservation laws, collisions, the harmonic oscillator, the two-body problem and Kepler's laws, non-inertial frames,
the rigid body, and special relativity. It is written for a student who studies alone, with high-school physics and
math at the 5-unit level and calculus in parallel. It runs on the platform of [emlab](https://github.com/shaia/emlab),
the sister course in electricity and magnetism.

Each lesson is laid out as an open book: text on the right page and, on the left, a live figure the student can
touch. The course is built **questions first**. Every lesson has a comprehension ladder of questions that climbs from
basic to exam level, and every chapter has multi-part review problems with model solutions. Every answer gets
feedback that explains why. The questions also record how confident the student was: a wrong answer given with
confidence is how the course tells a misconception apart from a gap in knowledge.

## Status

The platform is in place. The course map (chapters 0–10, 66 lessons and their learning objectives, in
`src/course.ts`) is on the home page. The question banks are written for every lesson, and the review problems for
every chapter, so each chapter's practice page and test already work. Lesson texts and figures come next.
**Lesson 2.7 (drag and terminal velocity)** will be the first lesson written and the reference the others follow.

## Running it

Requires Node 22.23.4 or newer.

```sh
npm ci
npm run dev        # http://localhost:4351
npm run build      # static site in dist/
npm run preview    # serve dist/
```

## Checks

```sh
npx vitest run         # physics engine and grading logic
npm run lint:content   # bank schema and TeX, question coverage, the ladder, misconceptions, glossary
npx astro check        # types
npx playwright test    # end-to-end, against `npm run preview`
```

The build fails on any formula KaTeX rejects and on any lesson or question that breaks its schema.

## Layout

| Path | Holds |
| --- | --- |
| `src/course.ts` | The course map: chapters, lessons and learning objectives |
| `src/content/questions/` | Question banks: one YAML file per lesson, plus `bagrut.yaml` (review problems) per chapter |
| `src/content/{misconceptions,glossary,videos}/` | Misconception register, glossary, verified YouTube videos |
| `src/content/lessons/` | Lessons, one MDX file each (`ch<N>/<id>-<slug>.mdx`) |
| `src/content/{workbook,summaries}/` | Per-lesson workbooks and chapter summaries |
| `src/physics/` | The physics engine, pure TypeScript with tests in `tests/physics/` |
| `src/sims/` | Live figures (Preact + canvas) |
| `src/assessment/` | Question types, the bank schema and grading |
| `src/progress/` | The student's progress, kept in the browser, with export and import |

Progress lives in the student's browser only. The answer keys ship with the page, so the course suits self-study,
not secure testing.

Built with [Astro](https://astro.build), [Preact](https://preactjs.com) and [KaTeX](https://katex.org). The
visual design is inspired by [Every Joule](https://iamtechartist.com/every-joule/).
