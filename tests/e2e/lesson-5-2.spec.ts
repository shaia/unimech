import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/5-2/';

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

/** A task's stored state, read until it arrives (progress writes reach localStorage asynchronously). */
const task = (page: Page, key: string) => async () => Boolean((await progress(page))?.tasks?.[key]);

test('both figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-5-2a', '#fig-5-2b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('spring, E = 1 J: turning points ±0.707 m, T = 3.14 s; K = U at T/8, four times E doubles the amplitude, ⟨K⟩ = ⟨U⟩ = E/2', async ({ page }) => {
  const fig = await openFigure(page, 'fig-5-2a');
  const ranges = fig.locator('input[type=range]'); // E, time
  // k = 4.0 N/m, m = 1.0 kg: A = √(2E/k) = 0.707 m, T = 2π√(m/k) = 3.14 s (smallosc.ts)
  await expect(fig.locator('[data-readout="turning"]')).toHaveText('x₁ = −0.707 m, x₂ = 0.707 m');
  await expect(fig.locator('[data-readout="T"] b')).toHaveText('3.14 s');
  await slide(ranges.nth(1), 0.2);
  await expect.poll(task(page, 'fig-5-2a:k-equals-u')).toBe(false);
  // K = U at x = A/√2 = 0.5 m, an eighth of a period after the release: t = π/8 = 0.393 s
  await slide(ranges.nth(1), 0.39);
  await expect.poll(task(page, 'fig-5-2a:k-equals-u')).toBe(true);
  await slide(ranges.nth(0), 4);
  await expect(fig.locator('[data-readout="turning"]')).toHaveText('x₁ = −1.41 m, x₂ = 1.41 m');
  await expect.poll(task(page, 'fig-5-2a:double-amplitude')).toBe(true);
  await expect(fig.locator('[data-readout="T"] b')).toHaveText('3.14 s');
  await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
  await expect.poll(task(page, 'fig-5-2a:averages')).toBe(true);
  await expect(fig.locator('[data-readout="avg"]')).toHaveText('⟨K⟩ = 2 J, ⟨U⟩ = 2 J', { timeout: 20000 });
});

test('pendulum lengthens past 10 %, the Morse well turns lopsided, the stiffening well shortens, and a release then drifts', async ({ page }) => {
  const fig = await openFigure(page, 'fig-5-2b');
  const energy = fig.locator('input[type=range]').nth(0);
  // L = 0.80 m: T₀ = 2π√(L/g) = 1.80 s; at E = 0.5 J the period is only 0.8 % longer
  await expect(fig.locator('[data-readout="T0"] b')).toHaveText('1.8 s');
  await expect(fig.locator('[data-readout="ratio"] b')).toHaveText('1.01');
  await slide(energy, 3);
  await expect.poll(task(page, 'fig-5-2b:ten-percent')).toBe(false);
  // T/T₀ = 1.10 at 69.3°, E = 5.07 J
  await slide(energy, 5.2);
  await expect.poll(task(page, 'fig-5-2b:ten-percent')).toBe(true);

  await fig.getByRole('button', { name: 'בור דמוי מולקולה', exact: true }).click();
  await slide(energy, -1);
  // D = 2.0 J, x₀ = 1.0 m, w = 0.50 m: turning points 0.733 and 1.61 m, T = T₀/√(−E/D) = 2.22 s
  await expect(fig.locator('[data-readout="turning"]')).toHaveText('x₁ = 0.733 m, x₂ = 1.61 m');
  await expect(fig.locator('[data-readout="T"] b')).toHaveText('2.22 s');
  await expect.poll(task(page, 'fig-5-2b:lopsided')).toBe(true);

  await fig.getByRole('button', { name: 'בור מתקשה', exact: true }).click();
  await slide(energy, 0.5);
  await expect.poll(task(page, 'fig-5-2b:shorter')).toBe(false);
  // k = 4.0 N/m, β = 4.0 N/m³: at E = 2.0 J, A = 0.856 m and T = 2.53 s, 19 % short of T₀ = 3.14 s
  await slide(energy, 2);
  await expect(fig.locator('[data-readout="T"] b')).toHaveText('2.53 s');
  await expect.poll(task(page, 'fig-5-2b:shorter')).toBe(true);
  await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
  await expect.poll(task(page, 'fig-5-2b:drift')).toBe(true);
});

test('scrolling through the text never completes a task', async ({ page }) => {
  await page.goto(LESSON);
  expect(await walkSteps(page)).toBeGreaterThan(10);
  // the figures hydrate when visible (on a phone the last step can leave them off-screen): bring each into view
  for (const id of ['#fig-5-2a', '#fig-5-2b']) {
    await page.locator(`${id} canvas`).scrollIntoViewIfNeeded();
    await hydrated(page.locator(`${id} canvas`));
  }
  await page.waitForTimeout(500);
  const tasks = (await progress(page))?.tasks ?? {};
  expect(Object.keys(tasks).filter((k) => k.startsWith('fig-5-2'))).toEqual([]);
});

test('check: "the depth sets the frequency" is caught and tagged, then the curvature is accepted', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-5.2-curvature-sets-omega"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: /העומק של הבור/ }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect
    .poll(async () => (await progress(page))?.attempts?.at(-1))
    .toMatchObject({ qid: 'Q-5.2-curvature-sets-omega', misconception: 'MC-5-frequency-from-depth', confident: true });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: /העקמומיות של הבור בתחתית/ }).click();
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});
