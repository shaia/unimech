import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/10-5/';

/** Set a range input the way a learner's drag does: value, then an input event. */
const slide = (range: Locator, value: number) =>
  range.evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** Open the figure, wait for hydration, stop the text steps and reset it. */
async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-10-5a');
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('canvas'));
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

/** A task's stored tick, read until the asynchronous write lands. */
const ticked = (page: Page, key: string) => expect.poll(async () => ((await progress(page))?.tasks ?? {})[key]).toBeTruthy();
const notTicked = async (page: Page, key: string) => expect(((await progress(page))?.tasks ?? {})[key]).toBeFalsy();

const readout = (fig: Locator, key: string) => fig.locator(`[data-readout="${key}"] b`);
const timeRange = (fig: Locator) => fig.locator('input[type=range]').nth(0);
const forceRange = (fig: Locator) => fig.locator('input[type=range]').nth(1);

test.describe('live figure', () => {
  test('scrolling through the text never completes a task', async ({ page }) => {
    await page.goto(LESSON);
    await walkSteps(page);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const tasks = (await progress(page))?.tasks ?? {};
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-10-5'))).toHaveLength(0);
  });

  test('the figure draws, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvas = page.locator('#fig-10-5a canvas');
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  });

  test('proton at 5.0 μs: p = Ft, v = 0.848c against Newton’s 1.60c, and the work equals the energy gained', async ({ page }) => {
    const fig = await openFigure(page);
    // .scratch/ch10/10-5/readouts.ts: F = 1.6e-13 N, t = 5.00 μs
    await slide(timeRange(fig), 5);
    await expect(readout(fig, 't')).toHaveText('t = 5.00 μs, Ft/(mc) = 1.60');
    await expect(readout(fig, 'p')).toHaveText('p = 8·10⁻¹⁹ kg·m/s');
    await expect(readout(fig, 'v')).toHaveText('v = 0.848c');
    await expect(readout(fig, 'v-newton')).toHaveText('v = Ft/m = 1.60c');
    await expect(readout(fig, 'x')).toHaveText('x = 830 m');
    await expect(readout(fig, 'work')).toHaveText('W = F·x = 830 MeV');
    await expect(readout(fig, 'energy')).toHaveText('(γ − 1)mc² = 830 MeV');
    await expect(readout(fig, 'half-mv2')).toHaveText('½mv² = 337 MeV');
  });

  test('Newton’s moment: at Ft/(mc) = 1.01 the true speed is 0.709c, and the task ticks', async ({ page }) => {
    const fig = await openFigure(page);
    await slide(timeRange(fig), 2);
    await page.waitForTimeout(200);
    await notTicked(page, 'fig-10-5a:newton-c');
    await slide(timeRange(fig), 3.15);
    await expect(readout(fig, 'v')).toHaveText('v = 0.709c');
    await expect(readout(fig, 'v-newton')).toHaveText('v = Ft/m = 1.01c');
    await ticked(page, 'fig-10-5a:newton-c');
  });

  test('doubling the force and running to the end passes 0.95c; W and ΔE still agree', async ({ page }) => {
    const fig = await openFigure(page);
    await slide(timeRange(fig), 15);
    await slide(forceRange(fig), 3.2);
    await expect(readout(fig, 'v')).toHaveText('v = 0.995c');
    await expect(readout(fig, 'work')).toHaveText('W = F·x = 8110 MeV');
    await expect(readout(fig, 'energy')).toHaveText('(γ − 1)mc² = 8110 MeV');
    await expect(readout(fig, 'half-mv2')).toHaveText('½mv² = 465 MeV');
    await ticked(page, 'fig-10-5a:near-c');
  });

  test('along or across: at 0.848c the accelerations are 0.15 and 0.531 of F/m; past 0.8c the task ticks', async ({ page }) => {
    const fig = await openFigure(page);
    await fig.getByRole('button', { name: 'לאורך המהירות או ניצב לה', exact: true }).click();
    await slide(timeRange(fig), 3);
    await page.waitForTimeout(200);
    await notTicked(page, 'fig-10-5a:inertia');
    await slide(timeRange(fig), 5);
    await expect(readout(fig, 'a-par')).toHaveText('a = F/(γ³m) = 0.15·F/m');
    await expect(readout(fig, 'a-perp')).toHaveText('a = F/(γm) = 0.531·F/m');
    await ticked(page, 'fig-10-5a:inertia');
  });
});

test.describe('questions', () => {
  test('numeric: Newton’s speed is caught and tagged; the relativistic speed is 0.848c', async ({ page }) => {
    await page.goto('/practice/ch10/');
    const q = page.locator('[data-qid="Q-10.5-proton-speed"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('1.6');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page))?.attempts?.at(-1))
      .toMatchObject({ qid: 'Q-10.5-proton-speed', correct: false, misconception: 'MC-10-constant-force-constant-accel' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.848');
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
