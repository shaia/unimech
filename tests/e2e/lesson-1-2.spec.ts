import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/1-2/';

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
  for (const id of ['#fig-1-2a', '#fig-1-2b', '#fig-1-2c']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('30° and 60° at the same speed land at the same point, and only the second landing ticks the task', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-2a');
  const tasks = fig.locator('.sim-tasks li');
  const ranges = fig.locator('input[type=range]'); // speed, angle, time
  await slide(ranges.nth(0), 20);
  await slide(ranges.nth(1), 30);
  // R = v₀² sin 2θ / g = 400 · 0.866 / 9.8 = 35.3 m (projectile.ts levelRange)
  await expect(fig.locator('.sim-readout')).toContainText('35.3 m');
  await fig.getByRole('button', { name: 'שגרו' }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  // landed: the instant shown jumps from 0 to the flight time, T = 2v₀ sinθ / g = 2.04 s
  await expect(fig.locator('[data-readout="t"] b')).toHaveText('2.04 s', { timeout: 10_000 });
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await slide(ranges.nth(1), 60);
  await expect(fig.locator('.sim-readout')).toContainText('35.3 m');
  await fig.getByRole('button', { name: 'שגרו' }).click();
  await expect(tasks.nth(2)).toHaveClass(/done/, { timeout: 10_000 });
  const p = await progress(page);
  expect(p.tasks['fig-1-2a:launch']).toBeTruthy();
  expect(p.tasks['fig-1-2a:complementary']).toBeTruthy();
});

test('at the top of the path the acceleration is still g, and scrubbing there with the arrows on ticks the task', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-2a');
  const task = fig.locator('.sim-tasks li').nth(1);
  const time = fig.locator('input[type=range]').nth(2);
  // 20 m/s at 45°: the top at v₀ sinθ / g = 1.44 s; without the arrows the same move ticks nothing
  await slide(time, 1.44);
  await expect(task).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: 'חצים' }).click();
  await slide(time, 0.5);
  await expect(task).not.toHaveClass(/done/);
  await slide(time, 1.44);
  await expect(task).toHaveClass(/done/);
  await expect(fig.locator('.sim-readout')).toContainText('(0, −9.8) m/s²');
  expect((await progress(page)).tasks['fig-1-2a:apex-accel']).toBeTruthy();
});

test('the relative position of two bodies thrown together: scrubbing through most of the flight ticks the task', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-2b');
  const task = fig.locator('.sim-tasks li').first();
  const time = fig.locator('input[type=range]').nth(2);
  await slide(time, 0.5);
  await expect(task).not.toHaveClass(/done/);
  // B lands after √(2·20/9.8) = 2.02 s; 80 % of that is 1.62 s
  await slide(time, 1.9);
  await expect(task).toHaveClass(/done/);
});

test('on a 20° incline, 55° = 45° + β/2 reaches farther than 45°', async ({ page }) => {
  const fig = await openFigure(page, 'fig-1-2c');
  const tasks = fig.locator('.sim-tasks li');
  const ranges = fig.locator('input[type=range]'); // speed, angle, incline, time
  const readout = fig.locator('.sim-readout');
  await slide(ranges.nth(1), 45);
  // L = 2v₀² cosθ sin(θ − β) / (g cos²β) = 27.6 m at 45°, 30.4 m at 55° (projectile.ts inclineFlight)
  await expect(readout).toContainText('27.6 m');
  await fig.getByRole('button', { name: 'שגרו' }).click();
  // landed: the instant shown jumps to the flight time, 2v₀ sin(θ − β) / (g cosβ) = 1.84 s
  await expect(readout.locator('[data-readout="t"] b')).toHaveText('1.84 s', { timeout: 10_000 });
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await slide(ranges.nth(1), 55);
  await expect(readout).toContainText('30.4 m');
  await fig.getByRole('button', { name: 'שגרו' }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/, { timeout: 10_000 });
  await expect(tasks.nth(1)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-1-2c:beat-45']).toBeTruthy();
  expect(p.tasks['fig-1-2c:incline-best']).toBeTruthy();
});

test('"farthest from the incline at the top of the path" is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-1.2-incline-clearance"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: /בשיא הגובה, כשהמהירות שלו אופקית/ }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-1.2-incline-clearance',
    misconception: 'MC-1-farthest-from-incline-at-top',
    confident: true,
  });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: /T\/2|כשהמהירות שלו מקבילה למדרון/ }).click();
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});
