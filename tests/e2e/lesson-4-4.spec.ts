import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-4/';

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

// ranges in every scene: speed v, block mass M, collision time Δt (index into 0.1 ms … 400 ms), timeline (0 … 2)

test('all three figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-4-4a', '#fig-4-4b', '#fig-4-4c']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('ballistic pendulum: momentum across the collision, energy in the rise; a long collision spoils it', async ({ page }) => {
  const fig = await openFigure(page, 'fig-4-4a');
  const tasks = fig.locator('.sim-tasks li'); // fire, stage1-end, dt-fail
  const ranges = fig.locator('input[type=range]');
  // m = 12 g, M = 1.5 kg, v = 300 m/s, L = 1.2 m: V = 2.38 m/s, h = 0.289 m, θ = 40.6° (ballistic.ts ballisticPendulum)
  await expect(fig.locator('[data-readout="p0"]')).toHaveText('3.6 kg·m/s');
  await expect(fig.locator('[data-readout="h"]')).toHaveText('h = 0.289 m');
  await expect(fig.locator('[data-readout="theta"]')).toHaveText('40.6°');
  await expect(fig.locator('[data-readout="K"]')).toHaveText('540 J → 4.29 J');
  await slide(ranges.nth(3), 0.5);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await slide(ranges.nth(3), 1);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  // Δt = 0.1 s: the staged h is off by 0.68 % (the momentum by 1.4 %), under the 1 % of the task; 0.2 s: 2.7 %
  // the readout names the quantity: the error is in the height, not in the momentum
  await expect(fig.locator('[data-readout="err"]').locator('..')).toContainText('השגיאה בגובה');
  await slide(ranges.nth(2), 9);
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await slide(ranges.nth(2), 10);
  await expect(fig.locator('[data-readout="err"]')).toHaveText('2.7%');
  await expect(tasks.nth(2)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'שגרו', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/, { timeout: 15000 });
  const p = await progress(page);
  expect(p.tasks['fig-4-4a:stage1-end']).toBeTruthy();
  expect(p.tasks['fig-4-4a:dt-fail']).toBeTruthy();
});

test('slide after the collision: d = V²/2μg, and a block twice as heavy slides about a quarter as far', async ({ page }) => {
  const fig = await openFigure(page, 'fig-4-4b');
  const tasks = fig.locator('.sim-tasks li'); // fire, dt-fail, heavier
  const ranges = fig.locator('input[type=range]');
  await expect(fig.locator('[data-readout="d"]')).toHaveText('d = 0.964 m');
  // friction spoils the momentum linearly: Δt = 10 ms already gives 1.2 %, in the momentum and in d alike
  await slide(ranges.nth(2), 6);
  await expect(fig.locator('[data-readout="err"]')).toHaveText('1.2%');
  await expect(fig.locator('[data-readout="err"]').locator('..')).toContainText('השגיאה במרחק');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await slide(ranges.nth(2), 1);
  await fig.getByRole('button', { name: 'שגרו', exact: true }).click();
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await slide(ranges.nth(1), 3);
  await expect(fig.locator('[data-readout="staged"]')).toHaveText('d = 0.243 m');
  await fig.getByRole('button', { name: 'שגרו', exact: true }).click();
  await expect(tasks.nth(2)).toHaveClass(/done/);
});

test('spring after the collision: x = V√((m + M)/k), read at the end of stage 2', async ({ page }) => {
  const fig = await openFigure(page, 'fig-4-4c');
  const tasks = fig.locator('.sim-tasks li'); // fire, max-compression, dt-fail
  const ranges = fig.locator('input[type=range]');
  // m = 0.50 kg at 4.0 m/s on M = 1.5 kg, k = 300 N/m: V = 1.0 m/s, x = 0.0816 m
  await expect(fig.locator('[data-readout="x"]')).toHaveText('x = 0.0816 m');
  await expect(fig.locator('[data-readout="K"]')).toHaveText('4 J → 1 J');
  await slide(ranges.nth(3), 1.5);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await slide(ranges.nth(3), 2);
  await expect(tasks.nth(1)).toHaveClass(/done/);
});

test('energy conserved through the collision is caught and tagged in the ballistic-speed question', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-4.4-ballistic-speed"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('14.0');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-4.4-ballistic-speed',
    misconception: 'MC-4-energy-through-collision',
  });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('199');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
