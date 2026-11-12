import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/8-3/';

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
    expect(Object.keys(p?.tasks ?? {}).filter((k) => k.startsWith('fig-8-3'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-8-3a', '#fig-8-3b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('Atwood with a disc pulley: a = 1.55 m/s², T₁ = 13.2 N > T₂ = 11.3 N; massless equal tensions; a ring slows it to 1.18 m/s²', async ({ page }) => {
    // numbers from .scratch/ch8/8-3/lesson.ts: m₁ 1.6, m₂ 1.0, M 2.4 kg, R 0.15 m
    const fig = await openFigure(page, 'fig-8-3a');
    const ranges = fig.locator('input[type=range]'); // m₁, m₂, M, time
    const play = fig.getByRole('button', { name: 'הפעלה', exact: true });
    await expect(readout(fig, 'a')).toHaveText('1.55 m/s²');
    await expect(readout(fig, 'T1')).toHaveText('13.2 N');
    await expect(readout(fig, 'T2')).toHaveText('11.3 N');
    await expect(readout(fig, 'dT')).toHaveText('1.86 N');
    await slide(ranges.nth(2), 0);
    await expect(readout(fig, 'a')).toHaveText('2.26 m/s²');
    await expect(readout(fig, 'T1')).toHaveText('12.1 N');
    await expect(readout(fig, 'dT')).toHaveText('0 N');
    await play.click();
    await expect.poll(() => task(page, 'fig-8-3a:massless')).toBeTruthy();
    await slide(ranges.nth(2), 2.4);
    await play.click();
    await expect.poll(() => task(page, 'fig-8-3a:ring-disc')).toBeFalsy();
    await fig.getByRole('button', { name: 'טבעת', exact: true }).click();
    await expect(readout(fig, 'a')).toHaveText('1.18 m/s²');
    await play.click();
    await expect.poll(() => task(page, 'fig-8-3a:ring-disc')).toBeTruthy();
  });

  test('a ring pulley heavier than both blocks together takes most of the kinetic energy (the rotation task)', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-3a');
    const ranges = fig.locator('input[type=range]');
    await fig.getByRole('button', { name: 'טבעת', exact: true }).click();
    await slide(ranges.nth(0), 1.0);
    await slide(ranges.nth(1), 0.5);
    await expect(readout(fig, 'IR2')).toHaveText('2.4 kg');
    await expect.poll(() => task(page, 'fig-8-3a:rotation-wins')).toBeTruthy();
  });

  test('rod hinged at one end: α = 3g/2L = 14.7 rad/s² at L = 1 m, 29.4 at 0.5 m, whatever the mass; the tip starts at 14.7 m/s²', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-3b');
    const ranges = fig.locator('input[type=range]'); // L, M, time
    await expect(readout(fig, 'alpha')).toHaveText('14.7 rad/s²');
    await expect(readout(fig, 'tip')).toHaveText('14.7 m/s²');
    await expect(readout(fig, 'Mg')).toHaveText('4.9 N');
    await slide(ranges.nth(1), 1.5);
    await expect(readout(fig, 'alpha')).toHaveText('14.7 rad/s²');
    await expect.poll(() => task(page, 'fig-8-3b:mass-free')).toBeTruthy();
    await slide(ranges.nth(0), 0.5);
    await expect(readout(fig, 'alpha')).toHaveText('29.4 rad/s²');
    await expect.poll(() => task(page, 'fig-8-3b:half-length')).toBeTruthy();
  });

  test('the coin task ticks on play, and the vertical task when the learner scrubs to the bottom of the swing', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-3b');
    const ranges = fig.locator('input[type=range]');
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await expect.poll(() => task(page, 'fig-8-3b:coin')).toBeTruthy();
    await fig.getByRole('button', { name: 'איפוס' }).click();
    // the quarter swing of a 1.0 m rod takes 0.484 s
    await slide(ranges.nth(2), 0.4836);
    await expect.poll(() => task(page, 'fig-8-3b:vertical')).toBeTruthy();
  });
});

test.describe('questions', () => {
  test('numeric: I about the centre (49 rad/s²) is caught and tagged; 3g/2L = 12.25 rad/s² is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-8.3-falling-rod-alpha"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('49');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page))?.attempts?.at(-1))
      .toMatchObject({ qid: 'Q-8.3-falling-rod-alpha', correct: false, misconception: 'MC-8-inertia-only-mass' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('12.25');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
