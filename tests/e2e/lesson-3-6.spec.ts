import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-6/';

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
  for (const id of ['#fig-3-6a', '#fig-3-6b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('free space: Δv = u ln(m₀/m₁), and the rocket passes its own exhaust speed when M = m₀/e', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-6a');
  const tasks = fig.locator('.sim-tasks li'); // launch, pass-u, rate-same, gravity-launch, no-liftoff
  const time = fig.locator('input[type=range]').nth(4); // u, rate, m0, m1, time
  // u = 2000 m/s, 10 000 → 2000 kg: 2000 ln 5 = 3219 m/s; t_b = 80 s (rocket.ts tsiolkovsky, burnTime)
  await expect(fig.locator('[data-readout="vb"]')).toHaveText('3219 m/s');
  await expect(fig.locator('[data-readout="tb"] b')).toHaveText('80 s');
  await slide(time, 30);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  // v = u at M = m₀/e = 3679 kg, t = 63.2 s
  await slide(time, 63.2);
  await expect(fig.locator('[data-readout="M"] b')).toHaveText('3680 kg');
  await expect(tasks.nth(1)).toHaveClass(/done/);
  expect((await progress(page)).tasks['fig-3-6a:pass-u']).toBeTruthy();
});

test('the final speed in free space does not depend on the burn rate; only the second launch ticks the task', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-6a');
  const tasks = fig.locator('.sim-tasks li');
  const rate = fig.locator('input[type=range]').nth(1);
  await fig.getByRole('button', { name: 'שגרו', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await slide(rate, 50);
  // half the thrust (1.0·10⁵ N), twice the burn time, the same 3219 m/s
  await expect(fig.locator('[data-readout="thrust"]')).toHaveText('1·10⁵ N');
  await expect(fig.locator('[data-readout="tb"] b')).toHaveText('160 s');
  await expect(fig.locator('[data-readout="vb"]')).toHaveText('3219 m/s');
  await fig.getByRole('button', { name: 'שגרו', exact: true }).click();
  await expect(tasks.nth(2)).toHaveClass(/done/);
});

test('vertical launch: g t_b is lost; with thrust below the dry weight the rocket never leaves the pad', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-6a');
  const tasks = fig.locator('.sim-tasks li');
  const rate = fig.locator('input[type=range]').nth(1);
  await fig.getByRole('button', { name: 'שיגור אנכי, עם כובד' }).click();
  // 3219 − 9.8 · 80 = 2435 m/s
  await expect(fig.locator('[data-readout="vb"]')).toHaveText('2435 m/s');
  await fig.getByRole('button', { name: 'שגרו', exact: true }).click();
  await expect(tasks.nth(3)).toHaveClass(/done/);
  await expect(tasks.nth(4)).not.toHaveClass(/done/);
  // 5 kg/s: thrust 1.0·10⁴ N < m₁ g = 1.96·10⁴ N
  await slide(rate, 5);
  await expect(fig.locator('[data-readout="vb"]')).toHaveText('0 m/s');
  await fig.getByRole('button', { name: 'שגרו', exact: true }).click();
  await expect(tasks.nth(4)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-3-6a:gravity-launch']).toBeTruthy();
  expect(p.tasks['fig-3-6a:no-liftoff']).toBeTruthy();
});

test('sand: F = vμ and half the power is heat; coasting keeps Mv; a leak keeps v', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-6b');
  const tasks = fig.locator('.sim-tasks li'); // pushed, coast, leak-blind
  const time = fig.locator('input[type=range]').nth(2); // v, rate, time
  // v = 3.0 m/s, μ = 4.0 kg/s: F = 12 N, P = 36 W, 18 W kinetic, 18 W heat (rocket.ts sandForce, beltPower)
  await expect(fig.locator('[data-readout="F"] b')).toHaveText('12 N');
  await expect(fig.locator('[data-readout="motor"]')).toHaveText('36 W');
  await expect(fig.locator('[data-readout="heat"]')).toHaveText('18 W');
  await fig.getByRole('button', { name: 'הריצו', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'בלי כוח', exact: true }).click();
  await slide(time, 25);
  // 200 kg at 3.0 m/s, 300 kg after 25 s: 2.0 m/s, Mv = 600 kg·m/s throughout
  await expect(fig.locator('[data-readout="v"] b')).toHaveText('2 m/s');
  await expect(fig.locator('[data-readout="P"] b')).toHaveText('600 kg·m/s');
  await fig.getByRole('button', { name: 'הריצו', exact: true }).click();
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'חול נשפך', exact: true }).click();
  await fig.getByRole('button', { name: 'הריצו', exact: true }).click();
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: /החיזוי של/ }).click();
  await slide(time, 25);
  // the speed stays 3.0 m/s while Mv falls to 300 kg·m/s
  await expect(fig.locator('[data-readout="v"] b')).toHaveText('3 m/s');
  await expect(fig.locator('[data-readout="P"] b')).toHaveText('300 kg·m/s');
  await fig.getByRole('button', { name: 'הריצו', exact: true }).click();
  await expect(tasks.nth(2)).toHaveClass(/done/);
});

test('"a leaking cart speeds up" (F = d(Mv)/dt written blindly) is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-3.6-leaking-cart"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'היא גדלה, כי העגלה נעשית קלה יותר, ואותו תנע מתחלק על פני מסה קטנה יותר.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-3.6-leaking-cart',
    misconception: 'MC-3-fdmvdt-blind',
    confident: true,
  });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: 'היא לא משתנה.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});
