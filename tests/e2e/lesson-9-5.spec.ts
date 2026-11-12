import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/9-5/';

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

/** Move the selected event (B after a reset) with the arrow keys, half a light-second per press. */
async function keys(fig: Locator, key: string, n: number) {
  const canvas = fig.locator('canvas');
  await canvas.focus();
  for (let i = 0; i < n; i++) await canvas.press(key);
}

/** A task's stored tick, read until the asynchronous write lands. */
const ticked = (page: Page, key: string) => expect.poll(async () => ((await progress(page))?.tasks ?? {})[key]).toBeTruthy();

const readout = (fig: Locator, key: string) => fig.locator(`[data-readout="${key}"] b`);

test.describe('live figures', () => {
  test('scrolling through the text never completes a task', async ({ page }) => {
    await page.goto(LESSON);
    await walkSteps(page);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const tasks = (await progress(page))?.tasks ?? {};
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-9-5'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-9-5a', '#fig-9-5b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('s² is the same from the numbers of S and of S′; at β = 0.4 the pair (2, 5) is at one place in S′', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-5a');
    // A = (0, 0), B = (2, 5): s² = 25 − 4 = 21, timelike (.scratch/ch9/9-5/lesson.ts)
    await expect(readout(fig, 's2')).toHaveText('21');
    await expect(readout(fig, 'kind')).toHaveText('זמני');
    await slide(fig.locator('input[type=range]'), 0.4);
    await expect(readout(fig, 'sep-p')).toHaveText('Δx′ = 0, cΔt′ = 4.58');
    await expect(readout(fig, 's2p')).toHaveText('21');
    await ticked(page, 'fig-9-5a:invariant');
  });

  test('a spacelike pair reverses its order above β = cΔt/Δx; dragging B through the light cone ticks the classes', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-5a');
    // B from (2, 5) right to (5, 5) (lightlike on the way) and down to (5, 2): spacelike, s² = −21
    await keys(fig, 'ArrowRight', 6);
    await keys(fig, 'ArrowDown', 6);
    await expect(readout(fig, 'kind')).toHaveText('מרחבי');
    await expect(readout(fig, 's2')).toHaveText('−21');
    await ticked(page, 'fig-9-5a:classes');
    const range = fig.locator('input[type=range]');
    await slide(range, 0.3);
    await expect(readout(fig, 'order')).toHaveText('B אחרי A');
    expect(((await progress(page))?.tasks ?? {})['fig-9-5a:reverse']).toBeFalsy();
    await slide(range, 0.4);
    await expect(readout(fig, 'order')).toHaveText('בו-זמניים');
    await slide(range, 0.7);
    // γ(0.7) = 1.40: cΔt′ = 1.40·(2 − 3.5) = −2.10
    await expect(readout(fig, 'sep-p')).toHaveText('Δx′ = 5.04, cΔt′ = −2.1');
    await expect(readout(fig, 'order')).toHaveText('B לפני A');
    await ticked(page, 'fig-9-5a:reverse');
  });

  test('the S′ axes at 0.75c: B on the ct′ axis reads ct′ = 3.97; moving it onto the x′ axis makes it simultaneous with A', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-5b');
    await expect(readout(fig, 'beta')).toHaveText('β = 0.75, γ = 1.51, α = 36.9°');
    await expect(readout(fig, 'b')).toHaveText('(x, ct) = (4.5, 6); (x′, ct′) = (0, 3.97)');
    // B to (6, 4.5): on the x′ axis
    await keys(fig, 'ArrowRight', 3);
    await keys(fig, 'ArrowDown', 3);
    await expect(readout(fig, 'b')).toHaveText('(x, ct) = (6, 4.5); (x′, ct′) = (3.97, 0)');
    await ticked(page, 'fig-9-5b:simultaneous');
    // and back onto the ct′ axis: one place in S′
    await keys(fig, 'ArrowUp', 3);
    await keys(fig, 'ArrowLeft', 3);
    await ticked(page, 'fig-9-5b:same-place');
  });

  test('with the calibration hyperbolae on, changing β ticks the calibration task', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-5b');
    const range = fig.locator('input[type=range]');
    await slide(range, 0.5);
    await page.waitForTimeout(200);
    expect(((await progress(page))?.tasks ?? {})['fig-9-5b:calibrate']).toBeFalsy();
    await fig.getByRole('button', { name: 'היפרבולות כיול', exact: true }).click();
    await slide(range, 0.6);
    await ticked(page, 'fig-9-5b:calibrate');
  });
});

test.describe('questions', () => {
  test('numeric: the ruler length on the tilted axis is caught and tagged; the interval gives 8.49 s', async ({ page }) => {
    await page.goto('/practice/ch9/');
    const q = page.locator('[data-qid="Q-9.5-read-tilted-axis"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('9.49');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page))?.attempts?.at(-1))
      .toMatchObject({ qid: 'Q-9.5-read-tilted-axis', correct: false, misconception: 'MC-9-minkowski-euclidean' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('8.49');
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
