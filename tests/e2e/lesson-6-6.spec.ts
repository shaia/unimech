import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/6-6/';

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

const task = (page: Page, id: string) => expect.poll(async () => (await progress(page))?.tasks?.[id]);

test('both figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-6-6a', '#fig-6-6b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('escape: 7.0 km/s at 2 R_E is an ellipse with a = 4.63 R_E; faster than 7.91 km/s the orbit opens', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-6a');
  const ranges = fig.locator('input[type=range]'); // launch distance, speed, angle
  // GM = G·M_E, r = 2 R_E (transfer.ts launchState, orbit.ts): v_c 5.59, v_esc 7.91, ε = −6.76 MJ/kg, a = 4.63 R_E
  await expect(fig.locator('[data-readout="v"]')).toHaveText('v = 7 km/s');
  await expect(fig.locator('[data-readout="vc"]')).toHaveText('vc = 5.59 km/s');
  await expect(fig.locator('[data-readout="vesc"]')).toHaveText('vesc = 7.91 km/s');
  await expect(fig.locator('[data-readout="eps"]')).toHaveText('ε = −6.76 MJ/kg');
  await expect(fig.locator('[data-readout="a"]')).toHaveText('a = 4.63 RE');
  await expect(fig.locator('[data-readout="kind"]')).toHaveText('אליפסה');
  await slide(ranges.nth(1), 7.9);
  await expect(fig.locator('[data-readout="kind"]')).toHaveText('אליפסה');
  expect((await progress(page))?.tasks?.['fig-6-6a:escape']).toBeFalsy();
  await slide(ranges.nth(1), 7.95);
  await expect(fig.locator('[data-readout="kind"]')).toHaveText('היפרבולה');
  await expect(fig.locator('[data-readout="a"]')).toHaveText('המסלול פתוח');
  await task(page, 'fig-6-6a:escape').toBeTruthy();
});

test('escape: the launch angle changes the shape, not a; at 45° the ellipse dips into the Earth', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-6a');
  const ranges = fig.locator('input[type=range]');
  await slide(ranges.nth(2), 45);
  await expect(fig.locator('[data-readout="a"]')).toHaveText('a = 4.63 RE');
  await expect(fig.locator('[data-readout="kind"]')).toHaveText('אליפסה, פוגע בכדור הארץ');
  await task(page, 'fig-6-6a:angle').toBeTruthy();
});

test('transfer 2 → 5 R_E: a forward push of 1.09 km/s, then 0.86 km/s at the apoapsis, circularises', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-6a');
  await fig.getByRole('button', { name: 'מעבר', exact: true }).click();
  const ranges = fig.locator('input[type=range]'); // r1, r2, Δv
  // hohmannSpeeds(GM, 2 R_E, 5 R_E): Δv₁ 1.09, Δv₂ 0.863, total 1.95 km/s
  await expect(fig.locator('[data-readout="hohmann"] b')).toHaveText('Δv₁ = 1.09, Δv₂ = 0.863, Σ = 1.95 km/s');
  await expect(fig.locator('[data-readout="v"]')).toHaveText('v = 5.59 km/s');
  await slide(ranges.nth(2), 1.09);
  await fig.getByRole('button', { name: 'דחיפה', exact: true }).click();
  await expect(fig.locator('[data-readout="orbit"]')).toHaveText('rp = 2, ra = 4.99 RE');
  await task(page, 'fig-6-6a:burn1').toBeTruthy();
  await fig.getByRole('button', { name: 'לנקודת הריחוק', exact: true }).click();
  await expect(fig.locator('[data-readout="v"]')).toHaveText('v = 2.68 km/s');
  await slide(ranges.nth(2), 0.86);
  await fig.getByRole('button', { name: 'דחיפה', exact: true }).click();
  await expect(fig.locator('[data-readout="v"]')).toHaveText('v = 3.54 km/s');
  await expect(fig.locator('[data-readout="burns"] b')).toHaveText('Σ|Δv| = 1.95 km/s');
  await task(page, 'fig-6-6a:circularise').toBeTruthy();
});

test('transfer: braking at the apoapsis instead drops the periapsis into the Earth', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-6a');
  await fig.getByRole('button', { name: 'מעבר', exact: true }).click();
  const ranges = fig.locator('input[type=range]');
  await slide(ranges.nth(2), 1.09);
  await fig.getByRole('button', { name: 'דחיפה', exact: true }).click();
  await fig.getByRole('button', { name: 'לנקודת הריחוק', exact: true }).click();
  await slide(ranges.nth(2), -0.86);
  await fig.getByRole('button', { name: 'דחיפה', exact: true }).click();
  await expect(fig.locator('[data-readout="v"]')).toHaveText('v = 1.82 km/s');
  await expect(fig.locator('[data-readout="orbit"]')).toContainText('פוגע בכדור הארץ');
  await task(page, 'fig-6-6a:brake').toBeTruthy();
  expect((await progress(page))?.tasks?.['fig-6-6a:circularise']).toBeFalsy();
});

test('transfer inward 5 → 2 R_E: two backward pushes complete the descent', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-6b');
  const ranges = fig.locator('input[type=range]');
  await slide(ranges.nth(0), 5);
  await slide(ranges.nth(1), 2);
  await expect(fig.locator('[data-readout="hohmann"] b')).toHaveText('Δv₁ = −0.863, Δv₂ = −1.09, Σ = 1.95 km/s');
  await slide(ranges.nth(2), -0.86);
  await fig.getByRole('button', { name: 'דחיפה', exact: true }).click();
  await fig.getByRole('button', { name: 'לנקודת הקרבה', exact: true }).click();
  await expect(fig.locator('[data-readout="v"]')).toHaveText('v = 6.67 km/s');
  await slide(ranges.nth(2), -1.09);
  await fig.getByRole('button', { name: 'דחיפה', exact: true }).click();
  await expect(fig.locator('[data-readout="v"]')).toHaveText('v = 5.58 km/s');
  await task(page, 'fig-6-6b:down').toBeTruthy();
});

test('scrolling through the text never completes a task', async ({ page }) => {
  await page.goto(LESSON);
  expect(await walkSteps(page)).toBeGreaterThan(5);
  await page.waitForTimeout(500);
  const tasks = (await progress(page))?.tasks ?? {};
  expect(Object.keys(tasks).filter((k) => k.startsWith('fig-6-6'))).toEqual([]);
});

test('check: the difference of the circular speeds is tagged, then 3.89 km/s is accepted', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-6.6-leo-geo"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('4.65');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect
    .poll(async () => (await progress(page))?.attempts?.at(-1))
    .toMatchObject({ qid: 'Q-6.6-leo-geo', misconception: 'MC-6-dv-is-speed-difference' });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('3.89');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
