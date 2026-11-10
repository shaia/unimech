import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/2-5/';

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

test('both figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-2-5a', '#fig-2-5b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('movable pulley: the free end moves twice as far as the load, and only the reader\'s own run ticks the task', async ({ page }) => {
  const fig = await openFigure(page, 'fig-2-5a');
  const task = fig.locator('.sim-tasks li').nth(0);
  const readout = fig.locator('.sim-readout');
  const ranges = fig.locator('input[type=range]'); // time, m1, m2
  // m1 = 2.0 kg free, m2 = 3.5 kg on the movable pulley: a2 = (m2 − 2m1)g/(m2 + 4m1) = −0.426, a1 = 0.852 (constraints.ts)
  await expect(readout.locator('[data-readout="a1"]')).toHaveText('a₁ = 0.852 m/s² למטה');
  await expect(readout.locator('[data-readout="a2"]')).toHaveText('a₂ = 0.426 m/s² למעלה');
  await slide(ranges.nth(0), 0.5);
  await expect(task).not.toHaveClass(/done/);
  // at t = 1.0 s: Δy₁ = ½·0.852·1 = 0.426 m, Δy₂ = −0.213 m
  await slide(ranges.nth(0), 1.0);
  await expect(readout.locator('[data-readout="dy"]')).toHaveText('Δy₁ = 0.426 m, Δy₂ = −0.213 m');
  await expect(task).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-2-5a:movable-run']).toBeTruthy();
});

test('the string-length readout stays constant while the bodies move', async ({ page }) => {
  const fig = await openFigure(page, 'fig-2-5a');
  await fig.getByRole('button', { name: 'אורכי החוט' }).click();
  const c = fig.locator('[data-readout="constraint"]');
  // y₁ + 2y₂ = 1.00 + 2·0.85 = 2.70 m at the start, and at any time
  await expect(c).toHaveText('y₁ + 2y₂ = 2.7 m');
  await slide(fig.locator('input[type=range]').nth(0), 0.9);
  await expect(c).toHaveText('y₁ + 2y₂ = 2.7 m');
});

test('m₂ = 2m₁ balances the movable pulley; the lightest m₁ under the heaviest m₂ in the Atwood machine stays below g', async ({ page }) => {
  const fig = await openFigure(page, 'fig-2-5a');
  const tasks = fig.locator('.sim-tasks li');
  const ranges = fig.locator('input[type=range]');
  await slide(ranges.nth(2), 4.0);
  await expect(fig.locator('[data-readout="a1"]')).toHaveText('a₁ = 0 m/s²');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'מכונת אטווד' }).click();
  await slide(ranges.nth(1), 0.5);
  await slide(ranges.nth(2), 6);
  // a = (6 − 0.5)/(6.5)·9.8 = 8.29 m/s² (constraints.ts atwood)
  await expect(fig.locator('[data-readout="a2"]')).toHaveText('a₂ = 8.29 m/s² למטה');
  await expect(tasks.nth(2)).toHaveClass(/done/);
});

test('free wedge: it recoils, a heavy one barely moves, and the block\'s ground path is steeper than the face', async ({ page }) => {
  const fig = await openFigure(page, 'fig-2-5b');
  const tasks = fig.locator('.sim-tasks li'); // wedge-rel, wedge-path, wedge-heavy
  const ranges = fig.locator('input[type=range]'); // time, m, M, θ
  // m = 1.0, M = 2.0, θ = 35°: A = −mg sinθ cosθ/(M + m sin²θ) = −1.98 m/s² (constraints.ts freeWedge)
  await expect(fig.locator('[data-readout="A"]')).toHaveText('A = 1.98 m/s² שמאלה');
  await fig.getByRole('button', { name: 'תאוצה יחסית' }).click();
  await slide(ranges.nth(0), 0.2);
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'מסלולים' }).click();
  await expect(fig.locator('[data-readout="path"]')).toHaveText('φ = 46.4°, θ = 35°');
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await slide(ranges.nth(0), 99);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await slide(ranges.nth(2), 20);
  await expect(fig.locator('[data-readout="A"]')).toHaveText('A = 0.226 m/s² שמאלה');
  await expect(tasks.nth(2)).toHaveClass(/done/);
  // the horizontal momentum stays zero
  await expect(fig.locator('[data-readout="px"]')).toHaveText('mvₓ + MV = 0 kg·m/s');
});

test('check: the movable-pulley acceleration flags a₁ = a₂, then accepts 1.78', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-2.5-movable-accel"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('1.40');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-2.5-movable-accel',
    misconception: 'MC-2-constraint-equal-accel',
  });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('1.78');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
