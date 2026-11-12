import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/9-2/';

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
    expect(Object.keys(p?.tasks ?? {}).filter((k) => k.startsWith('fig-9-2'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-9-2a', '#fig-9-2b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('a light clock of L₀ = 1.8 m ticks in 12 ns at rest and in γT₀ = 20 ns at 0.8c; γ = 2 near 0.87c', async ({ page }) => {
    // numbers from .scratch/ch9/9-2/lesson.ts
    const fig = await openFigure(page, 'fig-9-2a');
    // the figure opens at rest (β = 0), so that it does not answer the Predict
    await expect(readout(fig, 'T0')).toHaveText('12 ns');
    await expect(readout(fig, 'T')).toHaveText('12 ns');
    const beta = fig.locator('input[type=range]').first();
    await slide(beta, 0.8);
    await expect(readout(fig, 'gamma')).toHaveText('1.67');
    await expect(readout(fig, 'T')).toHaveText('20 ns');
    await expect(readout(fig, 'sep')).toHaveText('1.8 m');
    await fig.getByRole('button', { name: 'תקתוק', exact: true }).click();
    await expect.poll(() => task(page, 'fig-9-2a:diagonal'), { timeout: 15_000 }).toBeTruthy();
    await slide(beta, 0.6);
    await expect(readout(fig, 'T')).toHaveText('15 ns');
    expect(await task(page, 'fig-9-2a:gamma-two')).toBeFalsy();
    await slide(beta, 0.87);
    await expect(readout(fig, 'gamma')).toHaveText('2.03');
    await expect.poll(() => task(page, 'fig-9-2a:gamma-two')).toBeTruthy();
  });

  test('along the motion the mirrors are L₀/γ = 1.08 m apart and the legs 18 + 2 ns make the same 20 ns tick', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-2a');
    await slide(fig.locator('input[type=range]').first(), 0.8);
    await fig.getByRole('button', { name: 'שעון לאורך התנועה', exact: true }).click();
    await expect(readout(fig, 'sep')).toHaveText('1.08 m');
    await expect(readout(fig, 'legs')).toHaveText('18 + 2 ns');
    await expect(readout(fig, 'T')).toHaveText('20 ns');
    await fig.getByRole('button', { name: 'תקתוק', exact: true }).click();
    await expect.poll(() => task(page, 'fig-9-2a:along'), { timeout: 15_000 }).toBeTruthy();
  });

  test('muons at 0.998c: 23.7% survive in both frames, the air is 948 m thick in theirs; without relativity 1.3e-10', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-2b');
    await expect(readout(fig, 'gamma')).toHaveText('15.8');
    await expect(readout(fig, 'tEarth')).toHaveText('50.1 μs');
    await expect(readout(fig, 'life')).toHaveText('34.8 μs');
    await expect(readout(fig, 'thick')).toHaveText('948 m');
    await expect(readout(fig, 'proper')).toHaveText('3.17 μs');
    await expect(readout(fig, 'surv')).toHaveText('0.237');
    await expect(readout(fig, 'count')).toHaveText('40');
    await fig.getByRole('button', { name: 'נפילה', exact: true }).click();
    await expect.poll(() => task(page, 'fig-9-2b:land'), { timeout: 20_000 }).toBeTruthy();
    // 40 quantile lifetimes: those longer than 3.17 μs, 9 of 40
    await expect(readout(fig, 'count')).toHaveText('9');
    await fig.getByRole('button', { name: 'בלי יחסות', exact: true }).click();
    await expect.poll(() => task(page, 'fig-9-2b:classical')).toBeTruthy();
    await expect(readout(fig, 'surv')).toHaveText('1.29·10⁻¹⁰');
    await expect(readout(fig, 'count')).toHaveText('0');
  });

  test('raising the muons to 0.999c shortens their air to 671 m and ticks the speed task', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-2b');
    const beta = fig.locator('input[type=range]').first();
    await slide(beta, 0.99);
    await expect(readout(fig, 'surv')).toHaveText('0.0392');
    expect(await task(page, 'fig-9-2b:speed')).toBeFalsy();
    await slide(beta, 0.999);
    await expect(readout(fig, 'thick')).toHaveText('671 m');
    await expect.poll(() => task(page, 'fig-9-2b:speed')).toBeTruthy();
  });
});

test.describe('questions', () => {
  test('numeric: dividing the muon range by γ is caught and tagged; γvτ is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-9.2-muon-range"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0.0657');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page))?.attempts?.at(-1))
      .toMatchObject({ qid: 'Q-9.2-muon-range', correct: false, misconception: 'MC-9-proper-time-rest-frame' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('6.57');
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
