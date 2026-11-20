import { expect, test } from '@playwright/test';
import { hydrated, progress } from './helpers';

/**
 * The final exam (src/assessment/ExamRunner.tsx): five questions, the student marks four, solves on paper, then
 * grades their own work against each part's rubric. The state lives in localStorage, so a reload mid-exam keeps it.
 */

const PATH = '/exam/final-a/';

test('a full sitting: choose four of five, self-grade, score out of 100, survive a reload', async ({ page }) => {
  await page.goto(PATH);
  const startBtn = page.getByRole('button', { name: 'התחלת המבחן' });
  await hydrated(startBtn);
  await expect(startBtn).toBeEnabled();
  await page.getByRole('checkbox', { name: /מבחן עם שעון/ }).check();
  await startBtn.click();

  await expect(page.locator('[data-phase="running"]')).toBeVisible();
  await expect(page.locator('.exam-q')).toHaveCount(5);
  await expect(page.getByRole('timer')).toBeVisible();
  // no solution is on the page while the exam runs
  await expect(page.locator('.open-steps')).toHaveCount(0);

  const choose = page.locator('.exam-choose input');
  for (let i = 0; i < 4; i++) await choose.nth(i).check();
  await expect(choose.nth(4)).toBeDisabled();

  // a reload keeps the sitting and the choices
  await page.goto(PATH);
  await expect(page.locator('[data-phase="running"]')).toBeVisible();
  await expect(page.locator('.exam-choose input:checked')).toHaveCount(4);

  await page.getByRole('button', { name: 'סיום המבחן', exact: true }).click();
  await expect(page.locator('[data-phase="grading"]')).toBeVisible();
  const graded = page.locator('.exam-grade > .exam-q');
  await expect(graded).toHaveCount(4);
  await expect(graded.first().locator('.open-steps').first()).toBeVisible();

  // tick every rubric line of every graded part: a perfect paper
  // one in-page walk, a frame per click (each tick re-renders the island): ~70 Playwright clicks ran past the timeout
  const ticks = graded.locator('.open-rubric input[type="checkbox"]');
  const n = await ticks.count();
  expect(n).toBeGreaterThan(8);
  await page.evaluate(async () => {
    for (const el of Array.from(document.querySelectorAll<HTMLInputElement>('.exam-grade .open-rubric input'))) {
      el.click();
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    }
  });
  await expect(page.locator('.exam-grade .open-rubric input:checked')).toHaveCount(n);
  await page.getByRole('button', { name: /סיימתי לבדוק/ }).click();

  await expect(page.locator('[data-phase="report"]')).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText('100/100');
  const p = await progress(page);
  expect(p.attempts.filter((a: { kind: string; qid: string }) => a.kind === 'test' && a.qid.startsWith('E-final-a-')).length).toBeGreaterThan(8);

  await page.goto(PATH);
  await expect(page.getByTestId('score')).toHaveText('100/100');
  await page.getByRole('button', { name: 'מבחן מחדש' }).click();
  await expect(page.locator('[data-phase="intro"]')).toBeVisible();
});

test('the exam page: no KaTeX error, no sideways overflow with every solution open', async ({ page }) => {
  await page.goto(PATH);
  const startBtn = page.getByRole('button', { name: 'התחלת המבחן' });
  await hydrated(startBtn);
  await startBtn.click();
  await page.getByRole('button', { name: 'סיום המבחן', exact: true }).click();
  await page.getByRole('button', { name: /סיימתי לבדוק/ }).click();
  await page.locator('details').evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
  await expect(page.locator('.katex-error')).toHaveCount(0);
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
});
