import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/9-1/';

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

/** A task's stored tick, read until the asynchronous write lands. */
const ticked = (page: Page, key: string, timeout = 5000) =>
  expect.poll(async () => ((await progress(page))?.tasks ?? {})[key], { timeout }).toBeTruthy();

const readout = (fig: Locator, key: string) => fig.locator(`[data-readout="${key}"] b`);

test.describe('live figures', () => {
  test('scrolling through the text never completes a task', async ({ page }) => {
    await page.goto(LESSON);
    const n = await walkSteps(page);
    expect(n).toBeGreaterThan(10);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const tasks = (await progress(page))?.tasks ?? {};
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-9-1'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-9-1a', '#fig-9-1b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('in an ether wind of 0.6c the arm along the wind takes 1/(1 − β²), across it 1/√(1 − β²); a 90° turn swaps them', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-1a');
    // no wind: both arms 2L/c (.scratch/ch9/9-1/nums.ts)
    await expect(readout(fig, 't1')).toHaveText('1.000');
    await expect(readout(fig, 't2')).toHaveText('1.000');
    const ranges = fig.locator('input[type=range]'); // wind stop, angle, time
    await slide(ranges.nth(0), 5); // 0.6c
    await expect(readout(fig, 't1')).toHaveText('1.563');
    await expect(readout(fig, 't2')).toHaveText('1.250');
    await fig.getByRole('button', { name: 'סיבוב ב-90°' }).click();
    await expect(readout(fig, 't1')).toHaveText('1.250');
    await expect(readout(fig, 't2')).toHaveText('1.563');
    await ticked(page, 'fig-9-1a:rotate');
  });

  test('at 30 km/s a 90° turn of the 1887 apparatus should have moved the fringes by 0.4; none was seen', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-1a');
    const ranges = fig.locator('input[type=range]');
    await slide(ranges.nth(0), 1); // 30 km/s
    await expect(readout(fig, 'shift')).toHaveText('0');
    expect(((await progress(page))?.tasks ?? {})['fig-9-1a:real-shift']).toBeFalsy();
    await slide(ranges.nth(1), 90);
    await expect(readout(fig, 'shift')).toHaveText('0.4');
    await expect(readout(fig, 'observed')).toHaveText('0');
    await ticked(page, 'fig-9-1a:real-shift');
  });

  test('dragging the time to the end in an exaggerated wind completes the race', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-1a');
    const ranges = fig.locator('input[type=range]');
    await slide(ranges.nth(0), 3); // 0.3c
    await slide(ranges.nth(2), 1);
    await ticked(page, 'fig-9-1a:race');
  });

  test('strikes simultaneous on the platform: the front one came first in the train frame, and both agree at rest', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-1b');
    await expect(readout(fig, 'order')).toHaveText('פגעו בו-זמנית');
    await expect(readout(fig, 'arrive')).toHaveText('ההבזק הקדמי מגיע ראשון');
    const ranges = fig.locator('input[type=range]'); // speed, time
    await slide(ranges.nth(1), 1);
    await ticked(page, 'fig-9-1b:platform-play');
    await fig.getByRole('button', { name: 'הרכבת', exact: true }).click();
    await expect(readout(fig, 'order')).toHaveText('הקדמי פגע קודם');
    expect(((await progress(page))?.tasks ?? {})['fig-9-1b:train-play']).toBeFalsy();
    await slide(ranges.nth(1), 1);
    await ticked(page, 'fig-9-1b:train-play');
    await slide(ranges.nth(0), 0);
    await expect(readout(fig, 'order')).toHaveText('פגעו בו-זמנית');
    await expect(readout(fig, 'arrive')).toHaveText('שני ההבזקים מגיעים יחד');
    await ticked(page, 'fig-9-1b:at-rest');
  });
});

test.describe('questions', () => {
  test('mc: light at c relative to its source is caught and tagged; the two postulates are right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-9.1-postulates"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.getByRole('radio', { name: /ביחס למקור שלו/ }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page))?.attempts?.at(-1))
      .toMatchObject({ qid: 'Q-9.1-postulates', correct: false, misconception: 'MC-9-light-speed-adds-to-source' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await q.getByRole('radio', { name: /בלי קשר לתנועת המקור/ }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('no sideways overflow at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(LESSON);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
