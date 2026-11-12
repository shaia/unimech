import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, rankTo, walkSteps } from './helpers';

const LESSON = '/lessons/7-1/';

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
const ticked = (page: Page, key: string) => expect.poll(async () => ((await progress(page))?.tasks ?? {})[key]).toBeTruthy();

const readout = (fig: Locator, key: string) => fig.locator(`[data-readout="${key}"] b`);

test.describe('live figures', () => {
  test('scrolling through the text never completes a task', async ({ page }) => {
    await page.goto(LESSON);
    const n = await walkSteps(page);
    expect(n).toBeGreaterThan(10);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const tasks = (await progress(page))?.tasks ?? {};
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-7-1'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-7-1a', '#fig-7-1b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('in a cart accelerating at 3.5 m/s² the string leans atan(A/g) = 19.7° and the ball lands Ah/g = 0.643 m behind', async ({ page }) => {
    const fig = await openFigure(page, 'fig-7-1a');
    // m = 0.40 kg, h = 1.8 m (.scratch/ch7/7-1/q.ts): |g_eff| = 10.4, T = 4.16 N, fall 0.606 s
    await expect(readout(fig, 'theta')).toHaveText('19.7°');
    await expect(readout(fig, 'geff')).toHaveText('10.4 m/s²');
    await expect(readout(fig, 'tension')).toHaveText('4.16 N');
    await expect(readout(fig, 'fall')).toHaveText('0.606 s');
    await expect(readout(fig, 'land')).toHaveText('0.643 m מאחורי הנקודה שמתחת לשחרור');
    await fig.getByRole('button', { name: 'הקרון S′', exact: true }).click();
    await ticked(page, 'fig-7-1a:frame-view');
    await fig.getByRole('button', { name: 'שחררו את הכדור', exact: true }).click();
    await ticked(page, 'fig-7-1a:drop');
  });

  test('braking at 2.5 m/s² tilts the string forward 14.3° and the ball lands 0.459 m in front', async ({ page }) => {
    const fig = await openFigure(page, 'fig-7-1a');
    const ranges = fig.locator('input[type=range]'); // A, time
    expect(((await progress(page))?.tasks ?? {})['fig-7-1a:brake']).toBeFalsy();
    await slide(ranges.nth(0), -2.5);
    await expect(readout(fig, 'theta')).toHaveText('14.3°');
    await expect(readout(fig, 'land')).toHaveText('0.459 m לפני הנקודה שמתחת לשחרור');
    await ticked(page, 'fig-7-1a:brake');
  });

  test('an elevator: g + A shortens the fall, free fall makes g_eff zero, and a box in space at A = g reads like the Earth', async ({ page }) => {
    const fig = await openFigure(page, 'fig-7-1b');
    const ranges = fig.locator('input[type=range]'); // A, time
    // A = 2.5 m/s² up: g_eff = 12.3, T = 4.92 N, fall √(2h/g_eff) = 0.541 s
    await expect(readout(fig, 'geff')).toHaveText('12.3 m/s²');
    await expect(readout(fig, 'tension')).toHaveText('4.92 N');
    await expect(readout(fig, 'fall')).toHaveText('0.541 s');
    await fig.getByRole('button', { name: 'שחררו את הכדור', exact: true }).click();
    await ticked(page, 'fig-7-1b:up');
    await slide(ranges.nth(0), -9.8);
    await expect(readout(fig, 'geff')).toHaveText('0 m/s²');
    await expect(readout(fig, 'tension')).toHaveText('0 N');
    await expect(readout(fig, 'fall')).toHaveText('∞');
    await ticked(page, 'fig-7-1b:freefall');
    await fig.getByRole('button', { name: 'בחלל, רחוק מכל כוכב', exact: true }).click();
    await slide(ranges.nth(0), 9.8);
    await expect(readout(fig, 'geff')).toHaveText('9.8 m/s²');
    await expect(readout(fig, 'tension')).toHaveText('3.92 N');
    await expect(readout(fig, 'fall')).toHaveText('0.606 s');
    await ticked(page, 'fig-7-1b:space');
  });
});

test.describe('questions', () => {
  test('ranking: the periods follow g_eff, with the horizontal car between rest and the elevator going up', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-7.1-rank-periods"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await rankTo(q, ['כלפי מטה', 'בחדר', 'במכונית', 'כלפי מעלה']);
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
