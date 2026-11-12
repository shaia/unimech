import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/8-2/';

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

const readout = (fig: Locator, key: string) => fig.locator(`[data-readout="${key}"] b`);
const task = (page: Page, key: string) => expect.poll(async () => (await progress(page))?.tasks?.[key]).toBeTruthy();

test.describe('live figures', () => {
  test('scrolling through the text never completes a task', async ({ page }) => {
    await page.goto(LESSON);
    const n = await walkSteps(page);
    expect(n).toBeGreaterThan(10);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const p = await progress(page);
    expect(Object.keys(p?.tasks ?? {}).filter((k) => k.startsWith('fig-8-2'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-8-2a', '#fig-8-2b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('a rod in n pieces sums to (1 − 1/n²) L²/12 and reaches L²/12; about its end the integral is L²/3', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-2a');
    const ranges = fig.locator('input[type=range]'); // n, axis position
    // inertia.ts: n = 4 midpoint sum 0.078125 ML², exact 1/12 (.scratch/ch8/8-2/lesson.ts)
    await expect(readout(fig, 'sum')).toHaveText('0.0781 ML²');
    await expect(readout(fig, 'exact')).toHaveText('0.0833 ML²');
    await expect(readout(fig, 'err')).toHaveText('6.25%');
    await slide(ranges.nth(0), 50);
    await expect(readout(fig, 'sum')).toHaveText('0.0833 ML²');
    await task(page, 'fig-8-2a:rod-pieces');
    await slide(ranges.nth(1), 0);
    await expect(readout(fig, 'd')).toHaveText('0.5 L');
    await expect(readout(fig, 'exact')).toHaveText('0.333 ML²');
    await task(page, 'fig-8-2a:rod-end');
  });

  test('a disc of one ring counts all its mass at R/2 (R²/4); thirty rings reach R²/2', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-2a');
    const ranges = fig.locator('input[type=range]');
    await fig.getByRole('button', { name: 'דסקה', exact: true }).click();
    await slide(ranges.nth(0), 1);
    await expect(readout(fig, 'sum')).toHaveText('0.25 MR²');
    await expect(readout(fig, 'exact')).toHaveText('0.5 MR²');
    await expect.poll(async () => (await progress(page))?.tasks?.['fig-8-2a:disc-rings']).toBeFalsy();
    await slide(ranges.nth(0), 30);
    await expect(readout(fig, 'sum')).toHaveText('0.5 MR²');
    await task(page, 'fig-8-2a:disc-rings');
  });

  test('the thin cone (λ ∝ x²) turns most easily about its CM at 3L/4: I_cm = 3L²/80; the middle and the base both give L²/10', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-2a');
    const ranges = fig.locator('input[type=range]');
    await fig.getByRole('button', { name: 'קונוס דק', exact: true }).click();
    await fig.getByRole('button', { name: 'I מול מקום הציר', exact: true }).click();
    await expect(readout(fig, 'exact')).toHaveText('0.1 ML²');
    await slide(ranges.nth(1), 1);
    await expect(readout(fig, 'exact')).toHaveText('0.1 ML²');
    await expect.poll(async () => (await progress(page))?.tasks?.['fig-8-2a:cone-min']).toBeFalsy();
    await slide(ranges.nth(1), 0.75);
    await expect(readout(fig, 'd')).toHaveText('0 L');
    await expect(readout(fig, 'exact')).toHaveText('0.0375 ML²');
    await task(page, 'fig-8-2a:cone-min');
  });

  test('a ring is exact at any n: its sum is R² + d² whatever the cutting', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-2a');
    const ranges = fig.locator('input[type=range]');
    await fig.getByRole('button', { name: 'טבעת', exact: true }).click();
    await slide(ranges.nth(0), 3);
    await slide(ranges.nth(1), 0.6);
    await expect(readout(fig, 'sum')).toHaveText('1.36 MR²');
    await expect(readout(fig, 'err')).toHaveText('0%');
  });

  test('perpendicular axes: a flat disc gives I_x = R²/4 and I_x + I_y = I_z; a thickness h adds h²/6 to the sum only', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-2b');
    await expect(readout(fig, 'Iz')).toHaveText('0.167 Ma²');
    await expect(readout(fig, 'IxIy')).toHaveText('0.167 Ma²');
    await fig.getByRole('button', { name: 'דסקה', exact: true }).click();
    await expect(readout(fig, 'Ix')).toHaveText('0.25 MR²');
    await task(page, 'fig-8-2b:disc-flat');
    await slide(fig.locator('input[type=range]').nth(0), 0.6);
    await expect(readout(fig, 'Iz')).toHaveText('0.5 MR²');
    await expect(readout(fig, 'IxIy')).toHaveText('0.56 MR²');
    await task(page, 'fig-8-2b:thick');
  });
});

test.describe('questions', () => {
  test('"a disc is a ring: every ring adds its mass at R" is caught and tagged', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-8.2-disc-integral"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.getByRole('radio', { name: /כי כל טבעת מוסיפה את המסה שלה/ }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    expect((await progress(page)).attempts.at(-1)).toMatchObject({
      qid: 'Q-8.2-disc-integral',
      correct: false,
      misconception: 'MC-8-inertia-only-mass',
    });
  });

  test('numeric: the rim axis needs I_cm + MR², not I_cm alone', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-8.2-disc-rim-axis"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0.125');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-8.2-disc-rim-axis', correct: false });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.375');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
