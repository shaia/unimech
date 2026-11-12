import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/5-3/';

/** Set a range input the way a learner's drag does: value, then an input event. */
const slide = (range: Locator, value: number) =>
  range.evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** A task's stored flag, read until the asynchronous write lands. */
const task = (page: Page, key: string) => async () => ((await progress(page))?.tasks ?? {})[key];

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

test('both figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-5-3a', '#fig-5-3b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('raising γ through 2ω₀: still oscillating above ω₀, a double root at 2ω₀, slower above it, one crossing with a kick', async ({ page }) => {
  const fig = await openFigure(page, 'fig-5-3a');
  const tasks = fig.locator('.sim-tasks li'); // under, critical, slower, cross
  const ranges = fig.locator('input[type=range]'); // γ, v₀, time
  // ω₀ = 4.0 rad/s (damping.ts): γ = 6 gives −3 ± 2.65i, γ = 8 the double root −4, γ = 16 the roots −1.07 and −14.9
  await slide(ranges.nth(0), 6);
  await expect(fig.locator('[data-readout="regime"] b')).toHaveText('תת-ריסון');
  await expect(fig.locator('[data-readout="roots"] b')).toHaveText('−3 ± 2.65i s⁻¹');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await slide(ranges.nth(0), 8);
  await expect(fig.locator('[data-readout="regime"] b')).toHaveText('ריסון קריטי');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await slide(ranges.nth(0), 16);
  await expect(fig.locator('[data-readout="roots"] b')).toHaveText('−1.07, −14.9 s⁻¹');
  await expect(tasks.nth(2)).toHaveClass(/done/);
  await expect(tasks.nth(3)).not.toHaveClass(/done/);
  // released toward equilibrium at 1.0 m/s it does not cross; at 2.0 m/s it crosses once (threshold |s₂|x₀ = 1.49 m/s)
  await slide(ranges.nth(1), -1);
  await expect(tasks.nth(3)).not.toHaveClass(/done/);
  await slide(ranges.nth(1), -2);
  await expect(tasks.nth(3)).toHaveClass(/done/);
  await expect.poll(task(page, 'fig-5-3a:critical')).toBeTruthy();
  await expect.poll(task(page, 'fig-5-3a:cross')).toBeTruthy();
});

test('weak damping: the energy is a quarter when the envelope is half, and e^(−2π) after Q cycles', async ({ page }) => {
  const fig = await openFigure(page, 'fig-5-3b');
  const tasks = fig.locator('.sim-tasks li'); // log, half-amp, q-cycles
  const time = fig.locator('input[type=range]').nth(1); // γ, time
  // γ = 0.25 s⁻¹, Q = 16: the envelope halves at 2 ln2/γ = 5.55 s, where E/E₀ = 0.253; Q cycles end at 25.15 s
  await expect(fig.locator('[data-readout="Q"] b')).toHaveText('16');
  await slide(time, 5.55);
  await expect(fig.locator('[data-readout="E"] b')).toHaveText('0.253');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await slide(time, 25.15);
  // readouts go through sci(): below 0.01 a number is written with its power of ten
  await expect(fig.locator('[data-readout="E"] b')).toHaveText('1.86·10⁻³');
  await expect(tasks.nth(2)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'אנרגיה בסקאלה לוגריתמית' }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect.poll(task(page, 'fig-5-3b:q-cycles')).toBeTruthy();
});

test('scrolling through the text never completes a task', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-5-3a', '#fig-5-3b']) {
    await page.locator(`${id} canvas`).scrollIntoViewIfNeeded();
    await hydrated(page.locator(`${id} canvas`));
  }
  expect(await walkSteps(page)).toBeGreaterThan(10);
  await page.waitForTimeout(500);
  const tasks = ((await progress(page))?.tasks ?? {}) as Record<string, unknown>;
  expect(Object.keys(tasks).filter((k) => k.startsWith('fig-5-3'))).toEqual([]);
});

test('check: the energy-halving time for the amplitude is caught and tagged, then 6.93 s is accepted', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-5.3-amplitude-half"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('3.47');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).not.toHaveClass(/is-right/);
  await expect
    .poll(async () => (await progress(page))?.attempts?.at(-1))
    .toMatchObject({ qid: 'Q-5.3-amplitude-half', misconception: 'MC-5-energy-decays-like-amplitude' });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('6.93');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
