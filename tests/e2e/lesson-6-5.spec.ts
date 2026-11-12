import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/6-5/';

/** Set a range input the way a learner's drag does: value, then an input event. */
const slide = (range: Locator, value: number) =>
  range.evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** Open a figure, wait for hydration, stop the text steps and reset it. */
async function openFigure(page: Page, id: string) {
  await page.goto(LESSON);
  const fig = page.locator(`#${id}`);
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('canvas'));
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const taskDone = (page: Page, key: string) => expect.poll(async () => (await progress(page))?.tasks?.[key], { timeout: 15000 }).toBeTruthy();

test('both figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-6-5a', '#fig-6-5b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('equal areas: a = 1 AU, e = 0.6 gives T = 1 yr and eight sectors of 0.314 AU²; a full period ticks the task', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-5a');
  const tasks = fig.locator('.sim-tasks li'); // equal-areas, apoapsis, circle
  // kepler.ts: πab/8 with a = 1 AU, b = 0.8 AU; T = 1.004 yr with the course's constants
  await expect(fig.locator('[data-readout="T"]')).toHaveText('T = 1 yr');
  await expect(fig.locator('[data-readout="sector"]')).toHaveText('ΔA = 0.314 AU²');
  await expect(fig.locator('[data-readout="r"]')).toHaveText('r = 0.4 AU');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/, { timeout: 15000 });
  await taskDone(page, 'fig-6-5a:equal-areas');
});

test('half a period puts the planet at the apoapsis, 1.6 AU; e = 0 makes the sectors π/8 AU²', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-5a');
  const tasks = fig.locator('.sim-tasks li');
  const ranges = fig.locator('input[type=range]'); // time (fraction of T), e
  await slide(ranges.nth(0), 0.5);
  await expect(fig.locator('[data-readout="r"]')).toHaveText('r = 1.6 AU');
  // the areal velocity is the same at the apoapsis as anywhere: πab/T
  await expect(fig.locator('[data-readout="areal"]')).toHaveText('½|r×v| = 2.5 AU²/yr');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await slide(ranges.nth(1), 0);
  await expect(fig.locator('[data-readout="sector"]')).toHaveText('ΔA = 0.393 AU²');
  await expect(tasks.nth(2)).toHaveClass(/done/);
  await taskDone(page, 'fig-6-5a:apoapsis');
  await taskDone(page, 'fig-6-5a:circle');
});

test('the periods view: Jupiter’s a gives T = 11.9 yr; with e = 0.6 both planets come back together after one period', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-5b');
  const tasks = fig.locator('.sim-tasks li'); // same-period, jupiter
  const ranges = fig.locator('input[type=range]'); // time, e, log10 a
  await expect(fig.locator('[data-readout="eps"]')).toHaveText('E/m = −GM/(2a) = −4.42·10⁸ J/kg');
  await slide(ranges.nth(2), Math.log10(5.19));
  await expect(fig.locator('[data-readout="T"]')).toHaveText('T = 11.9 yr');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await slide(ranges.nth(2), 0);
  await slide(ranges.nth(1), 0.6);
  await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/, { timeout: 15000 });
  await taskDone(page, 'fig-6-5b:same-period');
  await taskDone(page, 'fig-6-5b:jupiter');
});

test('scrolling through the text never completes a task', async ({ page }) => {
  await page.goto(LESSON);
  // scrolls to and clicks every step, including those that set the states the tasks ask for (a full period, the
  // apoapsis, e = 0, Jupiter)
  expect(await walkSteps(page)).toBeGreaterThan(10);
  await page.waitForTimeout(500);
  const tasks = (await progress(page))?.tasks ?? {};
  expect(Object.keys(tasks).filter((k) => k.startsWith('fig-6-5'))).toEqual([]);
});

test('check: the longer-period distractor is tagged, then the right choice is accepted', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-6.5-same-a"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: /ל-B זמן מחזור ארוך יותר/ }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-6.5-same-a', misconception: 'MC-6-period-depends-on-e' });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: /לשניהם אותה אנרגיה ואותו זמן מחזור/ }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
