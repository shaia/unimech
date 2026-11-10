import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/2-4/';

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
  for (const id of ['#fig-2-4a', '#fig-2-4b', '#fig-2-4c']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('static friction equals the pull, not μs N, until the block breaks free and the friction drops to μk N', async ({ page }) => {
  const fig = await openFigure(page, 'fig-2-4a');
  const tasks = fig.locator('.sim-tasks li');
  const force = fig.locator('input[type=range]').nth(0); // force, rope angle
  const f = fig.locator('[data-readout="f"] b');
  // m = 5 kg, μs = 0.60, μk = 0.40: μs N = 29.4 N, μk N = 19.6 N (friction.ts pullBlock)
  await expect(fig.locator('[data-readout="fmax"] b')).toHaveText('29.4 N');
  for (const F of [5, 10]) {
    await slide(force, F);
    await expect(f).toHaveText(`${F} N`);
  }
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await slide(force, 20);
  await expect(f).toHaveText('20 N');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  // 29.5 N > 29.4 N: it slides, f = μk N, a = (29.5 − 19.6)/5 = 1.98 m/s²
  await slide(force, 29.5);
  await expect(f).toHaveText('19.6 N');
  await expect(fig.locator('[data-readout="a"] b')).toHaveText('1.98 m/s²');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-2-4a:static-match']).toBeTruthy();
  expect(p.tasks['fig-2-4a:break-free']).toBeTruthy();
});

test('on the incline the mass does not move the threshold, and tilting past tan θ = μs makes the block slip', async ({ page }) => {
  const fig = await openFigure(page, 'fig-2-4b');
  const tasks = fig.locator('.sim-tasks li');
  const ranges = fig.locator('input[type=range]'); // angle, mass
  const state = fig.locator('[data-readout="state"]');
  // 2 kg at 30°: f = mg sin θ = 9.80 N, μs N = 10.2 N; the threshold is arctan 0.6 = 31.0°
  await slide(ranges.nth(0), 30);
  await expect(fig.locator('[data-readout="f"] b')).toHaveText('9.8 N');
  await expect(fig.locator('[data-readout="fmax"] b')).toHaveText('10.2 N');
  await expect(state).toContainText('במנוחה');
  await slide(ranges.nth(1), 5);
  // 5 kg at 30°: f = 24.5 N, ceiling 25.5 N, still at rest
  await expect(fig.locator('[data-readout="f"] b')).toHaveText('24.5 N');
  await expect(state).toContainText('במנוחה');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await slide(ranges.nth(0), 31);
  await expect(state).not.toContainText('במנוחה');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-2-4b:tilt-slip']).toBeTruthy();
  expect(p.tasks['fig-2-4b:mass-same']).toBeTruthy();
});

test('stacked blocks: friction on the top block points forward, the limit is 27.4 N on B and 11.0 N on A', async ({ page }) => {
  const fig = await openFigure(page, 'fig-2-4c');
  const tasks = fig.locator('.sim-tasks li');
  const force = fig.locator('input[type=range]').nth(0);
  const readout = fig.locator('.sim-readout');
  // A 2.0 kg on B 5.0 kg, μs = 0.40, μk = 0.30 (.scratch/ch2/2-4/review.ts, friction.ts stack)
  await expect(readout).toContainText('27.4 N');
  // F = 26 N on B: together at 3.71 m/s², friction on A +7.43 N (forward)
  await slide(force, 26);
  await expect(fig.locator('[data-readout="fA"] b')).toHaveText('7.43 N');
  await expect(fig.locator('[data-readout="state"]')).toContainText('נעים יחד');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  // F = 34 N: they slip, a_A = μk g = 2.94, a_B = (34 − 5.88)/5 = 5.62 m/s²
  await slide(force, 34);
  await expect(fig.locator('[data-readout="aA"] b')).toHaveText('2.94 m/s²');
  await expect(fig.locator('[data-readout="aB"] b')).toHaveText('5.62 m/s²');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: 'מושכים את A (העליון)' }).click();
  await expect(readout).toContainText('11 N');
  await expect(fig.locator('[data-readout="fA"] b')).toHaveText('−5.88 N');
  await expect(tasks.nth(2)).toHaveClass(/done/);
});

test('"the heavier coin slips first" is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-2.4-incline-mass"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: /הכבד מתחיל להחליק ראשון/ }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-2.4-incline-mass',
    misconception: 'MC-2-heavier-slips-sooner',
    confident: true,
  });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: /שניהם מתחילים להחליק באותה זווית/ }).click();
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});
