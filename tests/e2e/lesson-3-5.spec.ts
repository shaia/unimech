import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-5/';

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

test('all three figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-3-5a', '#fig-3-5b', '#fig-3-5c']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('a longer contact keeps the impulse and lowers the peak; the shape changes the peak; a bounce doubles J', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-5a');
  const tasks = fig.locator('.sim-tasks li'); // stretch, shapes, bounce
  const ranges = fig.locator('input[type=range]'); // contact time, time
  // 0.50 kg stopped from 4.0 m/s: J = 2.0 N·s; a rectangle of 8 ms peaks at 250 N (momentum.ts peakForce)
  await expect(fig.locator('[data-readout="J"]')).toContainText('2.00 N·s');
  await expect(fig.locator('[data-readout="peak"]')).toHaveText('250 N');
  await slide(ranges.nth(0), 0.04);
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await slide(ranges.nth(0), 0.08);
  await expect(fig.locator('[data-readout="J"]')).toContainText('2.00 N·s');
  await expect(fig.locator('[data-readout="peak"]')).toHaveText('25.0 N');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  // same area, 80 ms: triangle 50.0 N, half-sine 39.3 N; the average J/Δt = 25.0 N in each
  await fig.getByRole('button', { name: 'משולש', exact: true }).click();
  await expect(fig.locator('[data-readout="peak"]')).toHaveText('50.0 N');
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: 'חצי סינוס', exact: true }).click();
  await expect(fig.locator('[data-readout="peak"]')).toHaveText('39.3 N');
  await expect(fig.locator('[data-readout="avg"]')).toContainText('25.0 N');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'חוזר לאחור', exact: true }).click();
  await expect(fig.locator('[data-readout="J"]')).toContainText('4.00 N·s');
  await expect(tasks.nth(2)).toHaveClass(/done/);
  const p = await progress(page);
  for (const t of ['stretch', 'shapes', 'bounce']) expect(p.tasks[`fig-3-5a:${t}`]).toBeTruthy();
});

test('the carts share zero momentum after the push; unequal masses and a common velocity keep P constant', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-5b');
  const tasks = fig.locator('.sim-tasks li'); // release, unequal, moving
  const ranges = fig.locator('input[type=range]'); // m1, m2, v0, time
  await slide(ranges.nth(3), 10);
  // equal 1.0 kg carts, 1.0 J in the spring: ±1.00 m/s
  await expect(fig.locator('[data-readout="v1"]')).toContainText('−1.00 m/s');
  await expect(fig.locator('[data-readout="P"]')).toContainText('P = 0 kg·m/s');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await slide(ranges.nth(1), 2);
  await slide(ranges.nth(3), 10);
  // m2 = 2.0 kg: v1 = −1.15, v2 = 0.577 m/s (momentum.ts recoilFinal)
  await expect(fig.locator('[data-readout="v1"]')).toContainText('−1.15 m/s');
  await expect(fig.locator('[data-readout="v2"]')).toContainText('0.577 m/s');
  await expect(fig.locator('[data-readout="P"]')).toContainText('P = 0 kg·m/s');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await slide(ranges.nth(2), 0.3);
  await slide(ranges.nth(3), 10);
  await expect(fig.locator('[data-readout="P"]')).toContainText('0.900 kg·m/s');
  await expect(tasks.nth(2)).toHaveClass(/done/);
});

test('on the free wedge only P_x stays zero; a held wedge or a heavy one changes the picture', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-5c');
  const tasks = fig.locator('.sim-tasks li'); // slide, fixed, heavy
  const ranges = fig.locator('input[type=range]'); // M, θ, time
  await slide(ranges.nth(2), 10);
  // m = 1.0 kg, M = 2.0 kg, 40°, h = 0.60 m: V = 0.976 m/s, P_y = −2.46 kg·m/s (momentum.ts wedgeEnd)
  await expect(fig.locator('[data-readout="V"]')).toContainText('0.976 m/s');
  await expect(fig.locator('[data-readout="Px"]')).toContainText('0 kg·m/s');
  await expect(fig.locator('[data-readout="Py"]')).toContainText('−2.46 kg·m/s');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'טריז מקובע לרצפה' }).click();
  await slide(ranges.nth(2), 10);
  await expect(fig.locator('[data-readout="Px"]')).toContainText('2.63 kg·m/s');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'טריז מקובע לרצפה' }).click();
  await slide(ranges.nth(0), 10);
  await slide(ranges.nth(2), 10);
  await expect(fig.locator('[data-readout="V"]')).toContainText('0.245 m/s');
  await expect(tasks.nth(2)).toHaveClass(/done/);
});

test('"the soft surface gives a smaller impulse" is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-3.5-cushion"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'הכרית נותנת לביצה מתקף קטן יותר.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-3.5-cushion',
    misconception: 'MC-3-soft-landing-less-impulse',
    confident: true,
  });
});
