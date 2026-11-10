import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-1/';

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

/** The screen point of a world point (metres) on WorkPath's scene, by the figure's own layout rule. */
async function screenOf(canvas: Locator, x: number, y: number) {
  const box = (await canvas.boundingBox())!;
  const narrow = box.width < 520;
  const scene = narrow
    ? { x: 6, y: 44, w: box.width - 12, h: box.height * 0.6 - 44 }
    : { x: 8, y: 8, w: box.width * 0.6 - 8, h: box.height - 16 };
  const sc = Math.min(scene.w / 4.2, scene.h / 3.2);
  return { x: box.x + scene.x + scene.w / 2 + x * sc, y: box.y + scene.y + scene.h / 2 - (y - 0.2) * sc };
}

test('both figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-3-1a', '#fig-3-1b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('gravity does m g h = 3.14 J along the segment and along any curve between the same points', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-1a');
  // m = 0.40 kg, A 0.80 m above B: W = 0.40 · 9.8 · 0.80 = 3.14 J (work.ts constantForceWork)
  await expect(fig.locator('[data-readout="W"] b')).toContainText('3.14 J');
  await fig.getByRole('button', { name: 'עקומה', exact: true }).click();
  await expect(fig.locator('[data-readout="W"] b')).toContainText('3.14 J');
  await fig.getByRole('button', { name: 'קשת סביב O', exact: true }).click();
  await expect(fig.locator('[data-readout="W"] b')).toContainText('3.14 J');
  // the spring ½k(r_A² − r_B²) = 1.5 · 0.96 = 1.44 J, on the arc too
  await fig.getByRole('button', { name: 'קפיץ', exact: true }).click();
  await expect(fig.locator('[data-readout="W"] b')).toContainText('1.44 J');
});

test('raising the curve above A and running the marker to B ticks the task; the work stays 3.14 J', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-1a');
  const tasks = fig.locator('.sim-tasks li'); // bend-gravity, spring-arc, shear-paths, segments
  await fig.getByRole('button', { name: 'עקומה', exact: true }).click();
  const canvas = fig.locator('canvas');
  const from = await screenOf(canvas, 0, 1.2);
  const to = await screenOf(canvas, -0.4, 1.6);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await slide(fig.locator('input[type=range]').nth(1), 1);
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(fig.locator('[data-readout="W"] b')).toContainText('3.14 J');
  expect((await progress(page)).tasks['fig-3-1a:bend-gravity']).toBeTruthy();
});

test('(c y, 0): the curve does 7.50 J and the segment 4.50 J; more pieces bring the sum to the integral', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-1a');
  const tasks = fig.locator('.sim-tasks li');
  await fig.getByRole('button', { name: 'כוח שתלוי בגובה', exact: true }).click();
  await expect(fig.locator('[data-readout="Wline"] b')).toContainText('4.50 J');
  await fig.getByRole('button', { name: 'עקומה', exact: true }).click();
  await expect(fig.locator('[data-readout="W"] b')).toContainText('7.50 J');
  const pieces = fig.locator('input[type=range]').nth(0);
  await slide(pieces, 4);
  await expect(fig.locator('[data-readout="sum"] b')).toContainText('7.59 J');
  await expect(tasks.nth(3)).not.toHaveClass(/done/);
  await slide(pieces, 32);
  await expect(fig.locator('[data-readout="sum"] b')).toContainText('7.50 J');
  await expect(tasks.nth(3)).toHaveClass(/done/);
  // the curve's work differs from the segment's by 3.0 J ≥ 2 J: at B the shear task ticks
  await slide(fig.locator('input[type=range]').nth(1), 1);
  await expect(tasks.nth(2)).toHaveClass(/done/);
});

test('motion: W equals ΔK along the throw, and a run to the end ticks the task', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-1b');
  const tasks = fig.locator('.sim-tasks li'); // gravity-run, spring-period, shear-launch
  const time = fig.locator('input[type=range]').nth(2); // speed, angle, time
  // the top of the throw: 4.5 m/s at 60°, W = ΔK = −m g h = −3.04 J, K = 1.01 J
  await slide(time, 0.3975);
  await expect(fig.locator('[data-readout="W"] b')).toContainText('−3.04 J');
  await expect(fig.locator('[data-readout="dK"] b')).toContainText('−3.04 J');
  await expect(fig.locator('[data-readout="K"]')).toContainText('1.01 J');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await slide(time, 10);
  await expect(tasks.nth(0)).toHaveClass(/done/);
  // a whole period of the spring: no net work
  await fig.getByRole('button', { name: 'קפיץ', exact: true }).click();
  await slide(time, 10);
  await expect(fig.locator('[data-readout="W"] b')).toContainText('0.00 J');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-3-1b:gravity-run']).toBeTruthy();
  expect(p.tasks['fig-3-1b:spring-period']).toBeTruthy();
});

test('check: |F||Δr| for the constant force is caught and tagged, then 10 J is accepted', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-3.1-constant-force"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('14.9');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-3.1-constant-force', misconception: 'MC-3-work-magnitudes' });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('10');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
