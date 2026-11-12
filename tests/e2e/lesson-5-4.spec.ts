import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/5-4/';

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

const task = (page: import('@playwright/test').Page, key: string) => expect.poll(async () => (await progress(page))?.tasks?.[key]);

test('the three figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-5-4a', '#fig-5-4b', '#fig-5-4c']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('below resonance the steady state is 1.55 cm with a 6.68° lag; at ω₀ it is Q·F₀/k = 8 cm, lagging 90°', async ({ page }) => {
  const fig = await openFigure(page, 'fig-5-4a');
  const tasks = fig.locator('.sim-tasks li'); // resonance, above, forget
  const omega = fig.locator('input[type=range]').nth(0); // ω, Q
  // ω₀ = 10 rad/s, γ = 1.25 1/s, F₀/m = 1 m/s² (resonance.ts complexAmplitude)
  await expect(fig.locator('[data-readout="A"] b')).toHaveText('1.55 cm');
  await expect(fig.locator('[data-readout="delta"] b')).toHaveText('6.68°');
  await slide(omega, 10);
  await expect(fig.locator('[data-readout="A"] b')).toHaveText('8 cm');
  await expect(fig.locator('[data-readout="delta"] b')).toHaveText('90°');
  await expect(fig.locator('[data-readout="gain"] b')).toHaveText('8');
  await expect(fig.locator('[data-readout="P"] b')).toHaveText('0.2 W');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await task(page, 'fig-5-4a:resonance').toBeTruthy();
});

test('far above resonance the lag nears 180°; a different start leaves the same steady state', async ({ page }) => {
  const fig = await openFigure(page, 'fig-5-4a');
  const tasks = fig.locator('.sim-tasks li');
  const omega = fig.locator('input[type=range]').nth(0);
  await slide(omega, 20);
  await expect(fig.locator('[data-readout="A"] b')).toHaveText('0.332 cm');
  await expect(fig.locator('[data-readout="delta"] b')).toHaveText('175°');
  await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'התחלה מהעתק 4 cm' }).click();
  // the steady state does not depend on the start
  await expect(fig.locator('[data-readout="A"] b')).toHaveText('0.332 cm');
  await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
  await expect(tasks.nth(2)).toHaveClass(/done/);
  await task(page, 'fig-5-4a:above').toBeTruthy();
  await task(page, 'fig-5-4a:forget').toBeTruthy();
});

test('scrolling through the text never completes a task', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-5-4a', '#fig-5-4b', '#fig-5-4c']) {
    const c = page.locator(`${id} canvas`);
    await c.scrollIntoViewIfNeeded();
    await hydrated(c);
  }
  expect(await walkSteps(page)).toBeGreaterThan(15);
  await page.waitForTimeout(500);
  const tasks = (await progress(page))?.tasks ?? {};
  expect(Object.keys(tasks).filter((k) => k.startsWith('fig-5-4'))).toEqual([]);
});

test('Euler: at θ = 180° the arrow is −1; the derivative toggle and ω above ω₀ tick their tasks', async ({ page }) => {
  const fig = await openFigure(page, 'fig-5-4b');
  const tasks = fig.locator('.sim-tasks li'); // euler-pi, derivative, flip
  await slide(fig.locator('input[type=range]').nth(0), 180);
  await expect(fig.locator('[data-readout="z"] b')).toHaveText('−1 + 0i');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'נגזרות' }).click();
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'המתנד המאולץ' }).click();
  await slide(fig.locator('input[type=range]').nth(0), 14);
  // ω₀² − ω² + iγω = −96 + 17.5i, in the second quadrant: δ = 180° − 10.3° (resonance.ts denominator)
  await expect(fig.locator('[data-readout="D"] b')).toHaveText('−96 + 17.5i s⁻²');
  await expect(fig.locator('[data-readout="delta"] b')).toHaveText('170°');
  await expect(tasks.nth(2)).toHaveClass(/done/);
  await task(page, 'fig-5-4b:flip').toBeTruthy();
});

test('power curve: half the peak power at a half-power point ticks the width task; Q = 30 gives 30 cm at ω₀', async ({ page }) => {
  const fig = await openFigure(page, 'fig-5-4c');
  const tasks = fig.locator('.sim-tasks li'); // sharp, width
  const ranges = fig.locator('input[type=range]'); // ω, Q
  await fig.getByRole('button', { name: 'הספק ממוצע' }).click();
  await expect(fig.locator('[data-readout="P"] b')).toHaveText('0.2 W');
  // half-power points √(ω₀² + γ²/4) ∓ γ/2 = 9.39 and 10.64 rad/s
  await slide(ranges.nth(0), 9.4);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await slide(ranges.nth(0), 10);
  await slide(ranges.nth(1), 30);
  await expect(fig.locator('[data-readout="A"] b')).toHaveText('30 cm');
  await expect(fig.locator('[data-readout="tau"] b')).toHaveText('6 s');
  await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await task(page, 'fig-5-4c:width').toBeTruthy();
});

test('check: a wrong amplitude is recorded, then 2.97 cm is accepted', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-5.4-amplitude-value"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('6.93');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect.poll(async () => (await progress(page))?.attempts?.at(-1)?.qid).toBe('Q-5.4-amplitude-value');
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('2.97');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
