import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-4/';

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

test('all four figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-3-4a', '#fig-3-4b', '#fig-3-4c', '#fig-3-4d']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('point masses: the centre of mass is the mass-weighted average, and equal masses give the plain average', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-4a');
  const tasks = fig.locator('.sim-tasks li'); // drag, heavy, equal
  // 2 kg at (1, 1), 1 kg at (5, 1) and (3, 3): R_cm = (2.5, 1.5) m (centerofmass.ts centerOfMass)
  await expect(fig.locator('[data-readout="X"] b')).toHaveText('2.5 m');
  await expect(fig.locator('[data-readout="Y"] b')).toHaveText('1.5 m');
  const mass = fig.locator('input[type=range]').first();
  // m₁ → 5 kg: at least four times each of the others; R_cm = (13/7, 9/7) = (1.86, 1.29) m
  await slide(mass, 5);
  await expect(fig.locator('[data-readout="X"] b')).toHaveText('1.86 m');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  // m₁ → 1 kg: all equal, R_cm = the plain average (3, 1.67) m
  await slide(mass, 1);
  await expect(fig.locator('[data-readout="X"] b')).toHaveText('3 m');
  await expect(fig.locator('[data-readout="Y"] b')).toHaveText('1.67 m');
  await expect(tasks.nth(2)).toHaveClass(/done/);
  // a drag with the keyboard moves the selected mass and ticks the drag task
  await fig.locator('canvas').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-3-4a:heavy']).toBeTruthy();
  expect(p.tasks['fig-3-4a:equal']).toBeTruthy();
});

test('continuous bodies: λ ∝ x gives 2L/3, the wire sits above the half-disc, and 40 strips converge', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-4b');
  const tasks = fig.locator('.sim-tasks li'); // rod-linear, wire-vs-disc, converge
  // the uniform rod of 1.5 m: L/2 = 0.75 m, exact with any number of strips
  await expect(fig.locator('[data-readout="exact"]')).toContainText('0.75 m');
  await expect(fig.locator('[data-readout="error"]')).toHaveText('0');
  await fig.getByRole('button', { name: 'λ ∝ x' }).click();
  await expect(fig.locator('[data-readout="exact"]')).toContainText('1 m');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'חצי דיסקה' }).click();
  // 4R/3π with R = 0.6 m: 0.2546 m
  await expect(fig.locator('[data-readout="exact"]')).toContainText('0.2546 m');
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: 'חצי טבעת (תיל)' }).click();
  // 2R/π: 0.382 m
  await expect(fig.locator('[data-readout="exact"]')).toContainText('0.382 m');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  // 8 strips: 0.645 % off; 40 strips: 0.0257 %
  await expect(fig.locator('[data-readout="error"]')).toHaveText('0.65%');
  await slide(fig.locator('input[type=range]').first(), 40);
  await expect(fig.locator('[data-readout="error"]')).toHaveText('0.026%');
  await expect(tasks.nth(2)).toHaveClass(/done/);
});

test('burst: the centre of mass stays on the parabola while both fragments fly, and leaves it after a landing', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-4c');
  const tasks = fig.locator('.sim-tasks li'); // fire, on-parabola, leaves, unequal
  const ranges = fig.locator('input[type=range]'); // fraction, u, phi, time
  // 20 m/s at 60°, burst at the top; equal halves at 10 m/s, 30° up: landings at 3.30 s and 3.81 s
  await expect(fig.locator('[data-readout="landings"]')).toHaveText('3.3 s, 3.81 s');
  await slide(ranges.nth(3), 2.6);
  await expect(fig.locator('[data-readout="dev"]')).toHaveText('0 m');
  await expect(fig.locator('[data-readout="flying"]')).toHaveText('2');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await slide(ranges.nth(3), 3.6);
  // one fragment down: a_cm = −g/2, and the centre of mass is 2.99 m off the parabola
  await expect(fig.locator('[data-readout="acm"] b')).toHaveText('−4.9 m/s²');
  await expect(fig.locator('[data-readout="dev"]')).toHaveText('2.99 m');
  await expect(tasks.nth(2)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'ירו', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(3)).not.toHaveClass(/done/);
  await slide(ranges.nth(0), 0.3);
  await fig.getByRole('button', { name: 'ירו', exact: true }).click();
  await expect(tasks.nth(3)).toHaveClass(/done/);
});

test('plank: walking 6.0 m on a 200 kg plank moves it 1.2 m back', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-4d');
  const tasks = fig.locator('.sim-tasks li'); // walk, heavy-person
  const ranges = fig.locator('input[type=range]'); // s, m, M
  await slide(ranges.nth(0), 6);
  // −m d / (m + M) = −50 · 6 / 250 = −1.2 m (centerofmass.ts plankShift); the person 4.8 m
  await expect(fig.locator('[data-readout="plank"]')).toHaveText('−1.2 m');
  await expect(fig.locator('[data-readout="person"]')).toHaveText('4.8 m');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await slide(ranges.nth(1), 150);
  await slide(ranges.nth(2), 150);
  await slide(ranges.nth(0), 6);
  await expect(fig.locator('[data-readout="plank"]')).toHaveText('−3 m');
  await expect(tasks.nth(1)).toHaveClass(/done/);
});

test('"internal forces move the centre of mass" is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-3.4-skaters-push"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'הוא נע לכיוון של המחליק הכבד.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-3.4-skaters-push',
    misconception: 'MC-3-internal-forces-move-cm',
    confident: true,
  });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: 'הוא נשאר במקום.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});
