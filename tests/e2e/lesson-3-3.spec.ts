import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-3/';

/** Set a range input the way a learner's drag does: value, then an input event. */
const slide = (range: Locator, value: number) =>
  range.evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** Open a figure, wait for hydration, stop the text steps and reset it. */
async function openFigure(page: import('@playwright/test').Page, id: string) {
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
  for (const id of ['#fig-3-3a', '#fig-3-3b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('harmonic well: released at rest at −1 m with E = 2 J, it stops at +1 m half a period later, where the force is −4 N', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-3a');
  const tasks = fig.locator('.sim-tasks li'); // release, turning-force, trapped, over-hump, escape
  const time = fig.locator('input[type=range]').nth(2); // E, release point, time
  // k = 4.0 N/m, m = 1.0 kg: turning points ±√(2E/k) = ±1 m, T/2 = π√(m/k) = 1.57 s (energy.ts)
  await expect(fig.locator('[data-readout="E"] b')).toHaveText('2 J');
  await expect(fig.locator('[data-readout="x"] b')).toHaveText('−1 m');
  await slide(time, 0.8);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await slide(time, 1.57);
  await expect(fig.locator('[data-readout="x"] b')).toHaveText('1 m');
  await expect(fig.locator('[data-readout="F"] b')).toHaveText('−4 N');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-3-3a:turning-force']).toBeTruthy();
});

test('double well: below the hump the release is trapped, above it the particle crosses; Morse above 0 escapes', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-3a');
  const tasks = fig.locator('.sim-tasks li');
  const energy = fig.locator('input[type=range]').nth(0);
  const release = fig.getByRole('button', { name: 'שחררו', exact: true });
  await fig.getByRole('button', { name: 'בור כפול' }).click();
  await slide(energy, 1);
  // E = 1 J: released at the outer right turning point a√(1 + √(E/U₀)) = 1.31 m
  await expect(fig.locator('[data-readout="x"] b')).toHaveText('1.31 m');
  await release.click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(2)).toHaveClass(/done/);
  await expect(tasks.nth(3)).not.toHaveClass(/done/);
  await slide(energy, 3);
  await release.click();
  await expect(tasks.nth(3)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'בור דמוי מולקולה' }).click();
  await slide(energy, -1);
  await release.click();
  await expect(tasks.nth(4)).not.toHaveClass(/done/);
  await slide(energy, 0.5);
  await release.click();
  await expect(tasks.nth(4)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-3-3a:trapped']).toBeTruthy();
  expect(p.tasks['fig-3-3a:over-hump']).toBeTruthy();
  expect(p.tasks['fig-3-3a:escape']).toBeTruthy();
});

test('with drag the work of the drag equals ΔE; a strong drag stops the particle before the hump, a medium one in the other well', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-3b');
  const tasks = fig.locator('.sim-tasks li'); // drag-release, wnc, no-cross, other-well
  const ranges = fig.locator('input[type=range]'); // E, release point, b, time
  // b = 0.10 kg/s from E₀ = 3 J: after 30 s, E = 0.179 J and W_nc = ΔE = −2.82 J (energy.ts simulate)
  await slide(ranges.nth(3), 30);
  await expect(fig.locator('[data-readout="dE"] b')).toHaveText('−2.82 J');
  await expect(fig.locator('[data-readout="wnc"] b')).toHaveText('−2.82 J');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  const release = fig.getByRole('button', { name: 'שחררו', exact: true });
  await release.click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await expect(tasks.nth(3)).not.toHaveClass(/done/);
  await slide(ranges.nth(2), 0.5);
  await release.click();
  await expect(tasks.nth(2)).toHaveClass(/done/);
  await slide(ranges.nth(2), 0.2);
  await release.click();
  await expect(tasks.nth(3)).toHaveClass(/done/);
});

test('"constant power means constant force" is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-3.3-constant-power"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'הכוח והתאוצה קבועים, כי ההספק קבוע.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-3.3-constant-power',
    misconception: 'MC-3-constant-power-constant-force',
    confident: true,
  });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: /שניהם קטנים/ }).click();
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});
