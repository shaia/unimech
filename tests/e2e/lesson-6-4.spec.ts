import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-4/';

/** Set a range input the way a learner's drag does: value, then an input event. */
const slide = (range: Locator, value: number) =>
  range.evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** Open the figure, wait for hydration, stop the text steps and reset it. */
async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-6-4a');
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('canvas'));
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const readout = (fig: Locator, id: string) => fig.locator(`[data-readout="${id}"] b`);
const taskDone = (page: Page, id: string) => expect.poll(async () => Boolean((await progress(page))?.tasks?.[`fig-6-4a:${id}`])).toBe(true);

test('scrolling through the text never completes a task', async ({ page }) => {
  await page.goto(LESSON);
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
  });
  await page.waitForTimeout(400);
  await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
  const p = await progress(page);
  expect(Object.keys(p?.tasks ?? {}).filter((k) => k.startsWith('fig-6-4a:'))).toHaveLength(0);
});

test('the figure draws, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  const canvas = page.locator('#fig-6-4a canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toHaveCSS('direction', 'ltr');
  await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
});

test('sideways launches: the circular speed gives a circle, faster puts the launch point at periapsis, slower at apoapsis', async ({ page }) => {
  const fig = await openFigure(page);
  const tasks = fig.locator('.sim-tasks li'); // circle, periapsis, apoapsis, escape, tilt, cone
  const speed = fig.locator('input[type=range]').nth(0);
  const fire = fig.getByRole('button', { name: 'שגרו', exact: true });
  // r₀ = 1.0·10⁷ m, GM_E = 3.98·10¹⁴: v = 7.00 km/s gives e = β² − 1 = 0.231, r_a = 1.60·10⁷ m (conics.ts)
  await expect(readout(fig, 'v')).toHaveText('7 km/s');
  await expect(readout(fig, 'e')).toHaveText('0.231');
  await expect(readout(fig, 'rp')).toHaveText('1·10⁷ m');
  await expect(readout(fig, 'ra')).toHaveText('1.6·10⁷ m');
  await fig.getByRole('button', { name: 'מהירות מעגלית', exact: true }).click();
  await expect(readout(fig, 'v')).toHaveText('6.31 km/s');
  await expect(readout(fig, 'e')).toHaveText('0');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await fire.click();
  await taskDone(page, 'circle');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await slide(speed, 7);
  await fire.click();
  await taskDone(page, 'periapsis');
  // 5.80 km/s: e = 1 − β² = 0.155, the launch point is the apoapsis, r_p = 7.31·10⁶ m
  await slide(speed, 5.8);
  await expect(readout(fig, 'e')).toHaveText('0.155');
  await expect(readout(fig, 'rp')).toHaveText('7.31·10⁶ m');
  await fire.click();
  await taskDone(page, 'apoapsis');
});

test('a launch into the Earth does not count as an apoapsis launch', async ({ page }) => {
  const fig = await openFigure(page);
  await slide(fig.locator('input[type=range]').nth(0), 4.5);
  await expect(fig.locator('[data-readout="kind"]')).toContainText('פוגע בכדור הארץ');
  await fig.getByRole('button', { name: 'שגרו', exact: true }).click();
  await page.waitForTimeout(300);
  expect((await progress(page))?.tasks?.['fig-6-4a:apoapsis']).toBeFalsy();
});

test('the escape speed gives ε = 0 and a parabola; faster, a hyperbola', async ({ page }) => {
  const fig = await openFigure(page);
  await fig.getByRole('button', { name: 'מהירות מילוט', exact: true }).click();
  await expect(readout(fig, 'v')).toHaveText('8.92 km/s');
  await expect(readout(fig, 'eps')).toHaveText('0 J/kg');
  await expect(readout(fig, 'e')).toHaveText('1');
  await expect(fig.locator('[data-readout="kind"]')).toContainText('פרבולה');
  await fig.getByRole('button', { name: 'שגרו', exact: true }).click();
  await taskDone(page, 'escape');
  // 10.0 km/s: e = 1.51, ε = +1.02·10⁷ J/kg
  await slide(fig.locator('input[type=range]').nth(0), 10);
  await expect(readout(fig, 'e')).toHaveText('1.51');
  await expect(readout(fig, 'eps')).toHaveText('1.02·10⁷ J/kg');
  await expect(fig.locator('[data-readout="kind"]')).toContainText('היפרבולה');
});

test('the same speed tilted by 20° keeps a and ε and raises e', async ({ page }) => {
  const fig = await openFigure(page);
  await expect(readout(fig, 'a')).toHaveText('1.3·10⁷ m');
  await slide(fig.locator('input[type=range]').nth(1), 20);
  await expect(readout(fig, 'a')).toHaveText('1.3·10⁷ m');
  await expect(readout(fig, 'eps')).toHaveText('−1.53·10⁷ J/kg');
  await expect(readout(fig, 'e')).toHaveText('0.405');
  await expect(readout(fig, 'h')).toHaveText('6.58·10¹⁰ m²/s');
  await fig.getByRole('button', { name: 'שגרו', exact: true }).click();
  await taskDone(page, 'tilt');
});

test('in the cone view a change of speed ticks the cone task; switching views alone does not', async ({ page }) => {
  const fig = await openFigure(page);
  await fig.getByRole('button', { name: 'חרוט', exact: true }).click();
  await page.waitForTimeout(300);
  expect((await progress(page))?.tasks?.['fig-6-4a:cone']).toBeFalsy();
  await fig.getByRole('button', { name: 'מהירות מילוט', exact: true }).click();
  await taskDone(page, 'cone');
  await expect.poll(() => inked(fig.locator('canvas'))).toBeGreaterThan(200);
});

test('"the Sun is at the centre of the ellipse" is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-6.4-focus"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'במרכז האליפסה.', exact: true }).click();
  await q.getByRole('radio', { name: /האליפסה סימטרית/ }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect.poll(async () => (await progress(page))?.attempts?.at(-1)?.qid).toBe('Q-6.4-focus');
  expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-6.4-focus', misconception: 'MC-6-ellipse-center-at-sun', confident: true });
});
