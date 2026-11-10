import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/2-7/';

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
  for (const id of ['#fig-2-7a', '#fig-2-7b', '#fig-2-7c']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('linear drag: v_t = mg/b, 63 % of it after one time constant, and the net force vanishes at the end', async ({ page }) => {
  const fig = await openFigure(page, 'fig-2-7a');
  const tasks = fig.locator('.sim-tasks li'); // release, terminal-forces, tau, double-mass
  const time = fig.locator('input[type=range]').nth(2); // mass, b, time
  // m = 0.050 kg, b = 0.10 kg/s: v_t = 4.9 m/s, τ = 0.5 s (drag.ts terminalSpeed, timeScale)
  await expect(fig.locator('[data-readout="vt"]')).toHaveText('4.9 m/s');
  await expect(fig.locator('[data-readout="ts"] b')).toHaveText('0.5 s');
  await slide(time, 0.3);
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await slide(time, 0.5);
  // 1 − e⁻¹ = 63.2 %, v = 3.10 m/s
  await expect(fig.locator('[data-readout="frac"]')).toHaveText('63.2%');
  await expect(tasks.nth(2)).toHaveClass(/done/);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  // the end of the run is 5τ = 2.5 s: 99.3 % of v_t, the forces shown, so the terminal task ticks
  await slide(time, 2.5);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-2-7a:tau']).toBeTruthy();
  expect(p.tasks['fig-2-7a:terminal-forces']).toBeTruthy();
});

test('doubling the mass with the same b doubles v_t, and only the second release ticks the task', async ({ page }) => {
  const fig = await openFigure(page, 'fig-2-7a');
  const tasks = fig.locator('.sim-tasks li');
  const mass = fig.locator('input[type=range]').nth(0);
  await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(3)).not.toHaveClass(/done/);
  await slide(mass, 0.1);
  // v_t = 0.10 · 9.8 / 0.10 = 9.8 m/s, τ = 1.0 s
  await expect(fig.locator('[data-readout="vt"]')).toHaveText('9.8 m/s');
  await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
  await expect(tasks.nth(3)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-2-7a:double-mass']).toBeTruthy();
});

test('a throw up with the drag-free line on ticks its task; quadratic drag: four times the mass, twice v_t', async ({ page }) => {
  const fig = await openFigure(page, 'fig-2-7b');
  const tasks = fig.locator('.sim-tasks li'); // throw-up, quad-mass
  await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'גרר ריבועי' }).click();
  const ranges = fig.locator('input[type=range]'); // mass, c, v0, time
  await slide(ranges.nth(2), 0);
  // c = 0.020 kg/m: v_t = √(0.05 · 9.8 / 0.02) = 4.95 m/s
  await expect(fig.locator('[data-readout="vt"]')).toHaveText('4.95 m/s');
  await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await slide(ranges.nth(0), 0.2);
  await expect(fig.locator('[data-readout="vt"]')).toHaveText('9.9 m/s');
  await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
  await expect(tasks.nth(1)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-2-7b:throw-up']).toBeTruthy();
  expect(p.tasks['fig-2-7b:quad-mass']).toBeTruthy();
});

test('a fog drop falls in the linear regime and a baseball in the quadratic one', async ({ page }) => {
  const fig = await openFigure(page, 'fig-2-7c');
  const tasks = fig.locator('.sim-tasks li');
  // the default body, a 2 mm raindrop: both drags give v_t = 6.25 m/s, cv²/bv = 19.5 there
  await expect(fig.locator('[data-readout="vt"]')).toHaveText('6.25 m/s');
  await expect(fig.locator('[data-readout="ratio"]')).toContainText('19.5');
  await fig.getByRole('button', { name: 'טיפת ערפל' }).click();
  await expect(fig.locator('[data-readout="vt"]')).toHaveText('0.0128 m/s');
  await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'כדור בייסבול' }).click();
  await expect(fig.locator('[data-readout="vt"]')).toHaveText('32.2 m/s');
  await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
  await expect(tasks.nth(1)).toHaveClass(/done/);
});

test('"four times the mass gives four times v_t" under quadratic drag is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-2.7-quadratic-mass"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'פי 4', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-2.7-quadratic-mass',
    misconception: 'MC-2-drag-always-linear',
    confident: true,
  });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: 'פי 2', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});
