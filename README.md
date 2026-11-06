# מכניקה: ספר לימוד חי

An interactive, Hebrew-only course in mechanics for Israeli high-school physics at the 5-unit level (Bagrut paper
036361), written for a student who meets physics for the first time. It runs on the platform of
[emlab](https://github.com/shaia/emlab), the sister course in electricity and magnetism.

Each lesson is laid out as an open book: text on the right page and, on the left, a live figure the student can
touch. As the text scrolls, its steps change what the figure shows. Students commit to a prediction before
exploring, and the questions record how confident they were along with what they answered. A wrong answer given
with confidence is how the course tells a misconception apart from a gap in knowledge.

## Status

The platform is in place and builds with no lessons yet. The full course map (chapters 0–8) is visible on the home
page, every lesson marked "בקרוב". **Lesson 2.6 (Newton's second law)** will be the first lesson written and the
reference the others follow.

## Running it

Requires Node 22.23.4 or newer.

```sh
npm ci
npm run dev        # http://localhost:4341
npm run build      # static site in dist/
npm run preview    # serve dist/
```

## Checks

```sh
npx vitest run         # physics engine and grading logic
npm run lint:content   # lesson template, question coverage, misconceptions, glossary, videos
npx astro check        # types
npx playwright test    # end-to-end, against `npm run preview`
```

The build fails on any formula KaTeX rejects and on any lesson or question that breaks its schema.

## Layout

| Path | Holds |
| --- | --- |
| `src/content/lessons/` | Lessons, one MDX file each (`ch<N>/<id>-<slug>.mdx`) |
| `src/content/questions/` | Question banks, one YAML file per lesson |
| `src/content/{misconceptions,glossary,videos}/` | Misconception register, glossary, verified YouTube videos |
| `src/content/{workbook,summaries}/` | Per-lesson workbooks and chapter summaries |
| `src/physics/` | The physics engine, pure TypeScript with tests in `tests/physics/` |
| `src/sims/` | Live figures (Preact + canvas) |
| `src/assessment/` | Question types and grading |
| `src/progress/` | The student's progress, kept in the browser, with export and import |
| `src/course.ts` | The course map: every chapter and planned lesson |

Progress lives in the student's browser only. The answer keys ship with the page, so the course suits self-study,
not secure testing.

Built with [Astro](https://astro.build), [Preact](https://preactjs.com) and [KaTeX](https://katex.org). The
visual design is inspired by [Every Joule](https://iamtechartist.com/every-joule/).
