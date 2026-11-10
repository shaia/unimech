import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-3/';

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

// the sliders, in order: m₁, m₂, v, b, e
const B = 3;
const E = 4;
const launch = (fig: Locator) => fig.getByRole('button', { name: 'שגרו', exact: true }).click();

test('both figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-4-3a', '#fig-4-3b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('the target leaves along the line of centres, and two impact parameters give two outcomes that both conserve momentum', async ({ page }) => {
  const fig = await openFigure(page, 'fig-4-3a');
  const tasks = fig.locator('.sim-tasks li'); // launch, two-b, right-angle, head-on
  // 0.15 kg at 1.5 m/s on 0.25 kg, b = 0.040 m, D = 0.10 m: φ = 23.6°, θ₁ = 96.2°, J = 0.258 N·s (collisions2d.ts scatter)
  await expect(fig.locator('[data-readout="th2"] b')).toHaveText('−23.6°');
  await expect(fig.locator('[data-readout="th1"] b')).toHaveText('96.2°');
  await expect(fig.locator('[data-readout="J"] b')).toHaveText('0.258 N·s');
  await expect(fig.locator('[data-readout="px"] b')).toHaveText('0.225 → 0.225 kg·m/s');
  await launch(fig);
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await slide(fig.locator('input[type=range]').nth(B), 0.07);
  // b = 0.070 m: θ₁ = 59.9°, θ₂ = −44.4°, the same momentum and 100 % of the kinetic energy
  await expect(fig.locator('[data-readout="th1"] b')).toHaveText('59.9°');
  await expect(fig.locator('[data-readout="th2"] b')).toHaveText('−44.4°');
  await expect(fig.locator('[data-readout="k"]')).toHaveText('100%');
  await launch(fig);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-4-3a:two-b']).toBeTruthy();
});

test('equal masses, elastic: 90° between the paths at every b ≠ 0, and b = 0 is the 1D collision', async ({ page }) => {
  const fig = await openFigure(page, 'fig-4-3a');
  const tasks = fig.locator('.sim-tasks li');
  await fig.getByRole('button', { name: 'מסות שוות' }).click();
  await expect(fig.locator('[data-readout="between"]')).toHaveText('90°');
  await expect(fig.locator('[data-readout="th1"] b')).toHaveText('66.4°');
  await launch(fig);
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await slide(fig.locator('input[type=range]').nth(B), 0.07);
  await expect(fig.locator('[data-readout="between"]')).toHaveText('90°');
  await launch(fig);
  await expect(tasks.nth(2)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'חזיתית' }).click();
  // head-on, equal masses: the projectile stops and the target takes its 1.5 m/s
  await expect(fig.locator('[data-readout="v1"] b')).toHaveText('0 m/s');
  await expect(fig.locator('[data-readout="v2"] b')).toHaveText('1.5 m/s');
  await launch(fig);
  await expect(tasks.nth(3)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-4-3a:right-angle']).toBeTruthy();
  expect(p.tasks['fig-4-3a:head-on']).toBeTruthy();
});

test('a heavy projectile is scattered at most by arcsin(m₂/m₁); a light one can come back; e < 1 closes the right angle', async ({ page }) => {
  const fig = await openFigure(page, 'fig-4-3b');
  const tasks = fig.locator('.sim-tasks li'); // inelastic, theta-max, light-heavy
  const ranges = fig.locator('input[type=range]');
  await slide(ranges.nth(E), 0.6);
  // equal masses, b = 0.040 m, e = 0.60: 65.4° between the paths, 73.1 % of K kept
  await expect(fig.locator('[data-readout="between"]')).toHaveText('65.4°');
  await expect(fig.locator('[data-readout="k"]')).toHaveText('73.1%');
  await launch(fig);
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'כבד על קל' }).click();
  // 0.45 kg on 0.15 kg: sin θmax = 1/3, θmax = 19.5°; at b = 0.040 m only 17.5°
  await expect(fig.locator('[data-readout="tmax"] b')).toHaveText('19.5°');
  await expect(fig.locator('[data-readout="th1"] b')).toHaveText('17.5°');
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await slide(ranges.nth(B), 0.058);
  await expect(fig.locator('[data-readout="th1"] b')).toHaveText('19.5°');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'קל על כבד' }).click();
  await slide(ranges.nth(B), 0.02);
  // 0.15 kg on 0.45 kg, b = 0.020 m: the light disc comes back at 146°
  await expect(fig.locator('[data-readout="th1"] b')).toHaveText('146°');
  await launch(fig);
  await expect(tasks.nth(2)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-4-3b:theta-max']).toBeTruthy();
  expect(p.tasks['fig-4-3b:light-heavy']).toBeTruthy();
});

test('"momentum and energy are enough in a plane" is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-4.3-unknowns"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'שום דבר נוסף. שימור התנע ושימור האנרגיה מספיקים, כמו בממד אחד.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-4.3-unknowns',
    misconception: 'MC-4-momentum-enough-2d',
    confident: true,
  });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: 'נתון נוסף אחד, כמו הזווית שבה אחת הדיסקיות נעה אחרי ההתנגשות.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});
