import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-1/';

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
  for (const id of ['#fig-4-1a', '#fig-4-1b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('equal masses exchange velocities, sticking loses half the energy, a light cart bounces back off a heavy one', async ({ page }) => {
  const fig = await openFigure(page, 'fig-4-1a');
  const tasks = fig.locator('.sim-tasks li'); // exchange, stick, bounce-back
  const run = fig.getByRole('button', { name: 'הפעלה', exact: true });
  // 1.0 kg at 2.0 m/s on 1.0 kg at rest, e = 1 (collisions.ts elastic): v1' = 0, v2' = 2.0 m/s, nothing lost
  await expect(fig.locator('[data-readout="v1p"]')).toContainText('0 m/s');
  await expect(fig.locator('[data-readout="v2p"]')).toContainText('2 m/s');
  await expect(fig.locator('[data-readout="lost"]')).toHaveText('0 J');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await run.click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  // e = 0: both at V = 1.0 m/s, K 2.0 → 1.0 J, half lost (the Predict)
  await fig.getByRole('button', { name: 'פלסטית', exact: true }).click();
  await expect(fig.locator('[data-readout="v1p"]')).toContainText('1 m/s');
  await expect(fig.locator('[data-readout="lost"]')).toHaveText('1 J');
  await expect(fig.locator('[data-readout="frac"]')).toHaveText('50%');
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await run.click();
  await expect(tasks.nth(1)).toHaveClass(/done/);
  // 1.0 kg on 3.0 kg at rest, elastic: v1' = −1.0, v2' = 1.0 m/s
  await fig.getByRole('button', { name: 'קלה פוגעת בכבדה', exact: true }).click();
  await expect(fig.locator('[data-readout="v1p"]')).toContainText('−1 m/s');
  await expect(fig.locator('[data-readout="v2p"]')).toContainText('1 m/s');
  await run.click();
  await expect(tasks.nth(2)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-4-1a:exchange']).toBeTruthy();
  expect(p.tasks['fig-4-1a:stick']).toBeTruthy();
  expect(p.tasks['fig-4-1a:bounce-back']).toBeTruthy();
});

test('e = 0.5 loses ½ μ v_rel² (1 − e²) = 0.75 J; carts that do not approach do not collide', async ({ page }) => {
  const fig = await openFigure(page, 'fig-4-1b');
  const tasks = fig.locator('.sim-tasks li'); // partial
  const ranges = fig.locator('input[type=range]'); // m1, m2, v1, v2, e, time
  // 1.0 kg at 2.0 m/s on 1.0 kg at rest, e = 0.5: v1' = 0.5, v2' = 1.5 m/s, 0.75 J of 2.0 J lost
  await expect(fig.locator('[data-readout="v1p"]')).toContainText('0.5 m/s');
  await expect(fig.locator('[data-readout="v2p"]')).toContainText('1.5 m/s');
  await expect(fig.locator('[data-readout="lost"]')).toHaveText('0.75 J');
  await expect(fig.locator('[data-readout="frac"]')).toHaveText('37.5%');
  await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-4-1b:partial']).toBeTruthy();
  // the reversal of the relative velocity does not depend on the masses: 1.5 kg at 2.5 on 4.0 kg at 1.0, e = 1
  await slide(ranges.nth(0), 1.5);
  await slide(ranges.nth(1), 4);
  await slide(ranges.nth(2), 2.5);
  await slide(ranges.nth(3), 1);
  await slide(ranges.nth(4), 1);
  await expect(fig.locator('[data-readout="v1p"]')).toContainText('0.318 m/s');
  await expect(fig.locator('[data-readout="v2p"]')).toContainText('1.82 m/s');
  // cart 1 slower than cart 2: no collision
  await slide(ranges.nth(2), 0.5);
  await expect(fig.locator('[data-readout="none"]')).toBeVisible();
});

test('"kinetic energy is conserved when e = 0" is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-4.1-restitution-meaning"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'ההתנגשות אלסטית, והאנרגיה הקינטית נשמרת.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-4.1-restitution-meaning',
    misconception: 'MC-4-ke-always-conserved',
    confident: true,
  });
});
