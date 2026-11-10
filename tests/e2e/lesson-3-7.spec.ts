import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-7/';

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

/** Press an arrow key on the figure's canvas n times (each press moves O by 0.1 m). */
async function press(canvas: Locator, key: string, n: number) {
  await canvas.focus();
  for (let i = 0; i < n; i++) await canvas.press(key);
}

test('all three figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-3-7a', '#fig-3-7b', '#fig-3-7c']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('a free particle: L about O is m|v|d and constant; zero on the line, opposite in sign across it', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-7a');
  const tasks = fig.locator('.sim-tasks li'); // free-run, free-zero, free-flip
  const canvas = fig.locator('canvas');
  // m = 0.40 kg, v = (0.80, 0.30) m/s, O = (0, 1.0) m: L_z = 0.204 kg·m²/s, d = 0.597 m (angularmomentum.ts)
  await expect(fig.locator('[data-readout="L"]')).toContainText('0.204');
  await expect(fig.locator('[data-readout="d"]')).toContainText('0.597');
  await expect(fig.locator('[data-readout="mvd"]')).toContainText('0.204');
  await slide(fig.locator('input[type=range]').first(), 4);
  await expect(fig.locator('[data-readout="L"]')).toContainText('0.204');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  // six steps down to (0, 0.40) m: 0.035 m from the line, which snaps O onto it
  await press(canvas, 'ArrowDown', 6);
  await expect(fig.locator('[data-readout="L"]')).toContainText('= 0 ');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await press(canvas, 'ArrowDown', 2);
  await expect(fig.locator('[data-readout="L"]')).toContainText('−');
  await expect(tasks.nth(2)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-3-7a:free-zero']).toBeTruthy();
  expect(p.tasks['fig-3-7a:free-flip']).toBeTruthy();
});

test('a central force: L about C is constant, about O it is not, and its slope is the torque about O', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-7b');
  const tasks = fig.locator('.sim-tasks li'); // central-at-c, tau-zero, inverse-areas
  const time = fig.locator('input[type=range]').first();
  // spring k = 2.0 N/m, m = 0.50 kg, from (1.0, 0) m at 1.0 m/s: L_C = 0.5; about O = (0.6, −0.8) m, τ(0) = 1.6 N·m
  await expect(fig.locator('[data-readout="LC"]')).toContainText('0.5 ');
  await expect(fig.locator('[data-readout="tau"]')).toContainText('1.6');
  await expect(fig.locator('[data-readout="slope"]')).toContainText('1.6');
  // τ about O vanishes when 1.6 cos 2t + 0.6 sin 2t = 0: t = 0.965 s
  await slide(time, 0.965);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  // O onto C: six steps left, eight up
  await press(fig.locator('canvas'), 'ArrowLeft', 6);
  await press(fig.locator('canvas'), 'ArrowUp', 8);
  await expect(fig.locator('[data-readout="tau"]')).toContainText('= 0 ');
  await slide(time, 3.2);
  await expect(fig.locator('[data-readout="LO"]')).toContainText('0.5 ');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'ריבועי הפוך' }).click();
  await fig.getByRole('button', { name: 'שטחים' }).click();
  await slide(time, 4);
  await expect(fig.locator('[data-readout="LC"]')).toContainText('0.35');
  await expect(tasks.nth(2)).toHaveClass(/done/);
});

test('a string pulled through a hole: r·v_θ stays 0.48, v_θ doubles at half the radius at any pull rate', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-7c');
  const tasks = fig.locator('.sim-tasks li'); // pull-half, pull-other-u
  const ranges = fig.locator('input[type=range]'); // time, u
  await expect(fig.locator('[data-readout="vt"]')).toContainText('0.8 ');
  await slide(ranges.nth(0), 6);
  await expect(fig.locator('[data-readout="vt"]')).toContainText('1.6 ');
  await expect(fig.locator('[data-readout="rv"]')).toContainText('0.48');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await slide(ranges.nth(1), 0.1);
  await slide(ranges.nth(0), 3);
  await expect(fig.locator('[data-readout="vt"]')).toContainText('1.6 ');
  await expect(tasks.nth(1)).toHaveClass(/done/);
});

test('"a particle moving in a straight line has no angular momentum" is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-3.7-straight-line-L"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'אפס, כי החלקיק נע בקו ישר ולא מסתובב.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-3.7-straight-line-L',
    misconception: 'MC-3-straight-line-no-L',
    confident: true,
  });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: /^קבוע, בגודל/ }).click();
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});
