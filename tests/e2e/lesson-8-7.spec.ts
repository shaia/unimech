import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/8-7/';

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
const task = async (page: Page, id: string) => (await progress(page))?.tasks?.[id];

test.describe('live figures', () => {
  test('scrolling through the text never completes a task', async ({ page }) => {
    await page.goto(LESSON);
    await walkSteps(page);
    await page.waitForTimeout(300);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const p = await progress(page);
    expect(Object.keys(p?.tasks ?? {}).filter((k) => k.startsWith('fig-8-7'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-8-7a', '#fig-8-7b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('rod 1.20 m: T = 1.80 s at the end (ℓ = 2L/3), 3.14 s near the centre, shortest 1.67 s at 0.35 m; holes 0.20 and 0.60 share a period', async ({ page }) => {
    // numbers from .scratch/ch8/8-7/lesson.ts
    const fig = await openFigure(page, 'fig-8-7a');
    const ranges = fig.locator('input[type=range]'); // d, θ₀
    await expect(readout(fig, 'T')).toHaveText('1.8 s');
    await expect(readout(fig, 'ell')).toHaveText('0.8 m');
    await expect(readout(fig, 'k')).toHaveText('0.346 m');
    await slide(ranges.nth(0), 0.05);
    await expect(readout(fig, 'T')).toHaveText('3.14 s');
    await expect(readout(fig, 'ell')).toHaveText('2.45 m');
    await slide(ranges.nth(0), 0.35);
    await expect(readout(fig, 'T')).toHaveText('1.67 s');
    await expect.poll(() => task(page, 'fig-8-7a:shortest')).toBeTruthy();
    await slide(ranges.nth(0), 0.2);
    await expect(readout(fig, 'T')).toHaveText('1.8 s');
    expect(await task(page, 'fig-8-7a:same-period')).toBeFalsy();
    await slide(ranges.nth(0), 0.6);
    await expect.poll(() => task(page, 'fig-8-7a:same-period')).toBeTruthy();
  });

  test('at 60° the period is 1.93 s for both the rod and its simple pendulum; the disc is fastest at 0.20 m, 1.31 s', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-7a');
    const ranges = fig.locator('input[type=range]');
    await fig.getByRole('button', { name: 'מטוטלת פשוטה באורך ℓ', exact: true }).click();
    await slide(ranges.nth(1), 60);
    await expect(readout(fig, 'Tamp')).toHaveText('1.93 s');
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await expect.poll(() => task(page, 'fig-8-7a:amplitude-60')).toBeTruthy();
    await fig.getByRole('button', { name: 'דסקה', exact: true }).click();
    await expect(readout(fig, 'T')).toHaveText('1.35 s');
    await expect(readout(fig, 'k')).toHaveText('0.212 m');
    await slide(ranges.nth(0), 0.2);
    await expect(readout(fig, 'T')).toHaveText('1.31 s');
    await expect.poll(() => task(page, 'fig-8-7a:disc-shortest')).toBeTruthy();
  });

  test('a blow on the rod hung at its end: P = −0.625 N·s at 0.30 m, zero at 2L/3 = 0.80 m, +0.5 N·s at the end', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-7b');
    const ranges = fig.locator('input[type=range]'); // d, b
    await expect(readout(fig, 'P')).toHaveText('−0.625 N·s');
    await slide(ranges.nth(1), 0.8);
    await expect(readout(fig, 'P')).toHaveText('0 N·s');
    await expect.poll(() => task(page, 'fig-8-7b:no-jolt')).toBeTruthy();
    await slide(ranges.nth(1), 1.2);
    await expect(readout(fig, 'P')).toHaveText('0.5 N·s');
    await expect.poll(() => task(page, 'fig-8-7b:forward')).toBeTruthy();
  });

  test('without the pin, a blow at the centre of percussion leaves the pin hole at rest; another hole moves the centre to 0.70 m', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-7b');
    const ranges = fig.locator('input[type=range]');
    await fig.getByRole('button', { name: 'בלי הציר', exact: true }).click();
    await slide(ranges.nth(1), 0.6);
    await expect(readout(fig, 'omega')).toHaveText('0 rad/s');
    await expect(readout(fig, 'rest')).toHaveText('—');
    await slide(ranges.nth(1), 0.8);
    await expect(readout(fig, 'rest')).toHaveText('0 m');
    await expect.poll(() => task(page, 'fig-8-7b:free-rest')).toBeTruthy();
    await fig.getByRole('button', { name: 'בלי הציר', exact: true }).click();
    await slide(ranges.nth(0), 0.4);
    await slide(ranges.nth(1), 0.7);
    await expect(readout(fig, 'P')).toHaveText('0 N·s');
    await expect.poll(() => task(page, 'fig-8-7b:other-pivot')).toBeTruthy();
  });
});

test.describe('questions', () => {
  test('numeric: "the sweet spot is the centre of mass" is caught and tagged; 2L/3 is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-8.7-bat-percussion"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0.45');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect.poll(async () => (await progress(page))?.attempts?.length ?? 0).toBeGreaterThan(0);
    expect((await progress(page)).attempts.at(-1)).toMatchObject({
      qid: 'Q-8.7-bat-percussion',
      correct: false,
      misconception: 'MC-8-sweet-spot-is-cm',
    });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.60');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
