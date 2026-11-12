import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-3/';

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

/** A task's stored tick, read until the asynchronous write lands. */
const ticked = (page: Page, key: string) => expect.poll(async () => ((await progress(page))?.tasks ?? {})[key]).toBeTruthy();

const readout = (fig: Locator, key: string) => fig.locator(`[data-readout="${key}"] b`);

test.describe('live figures', () => {
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
    const tasks = (await progress(page))?.tasks ?? {};
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-6-3'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-6-3a', '#fig-6-3b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('at the bottom of the well the orbit is the circle r₀ = h²/GM = 1.02 AU, and releasing it ticks the circle', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-3a');
    // h = 4.5e15 m²/s around the Sun: r₀ = 1.02 AU, u_eff(r₀) = −4.35e8 J/kg, v = 29.5 km/s (.scratch/ch6/6-3/fig.ts)
    await expect(readout(fig, 'r')).toHaveText('1.02 AU');
    await expect(readout(fig, 'eps')).toHaveText('−4.35·10⁸ J/kg');
    await expect(readout(fig, 'v')).toHaveText('29.5 km/s');
    await expect(readout(fig, 'ra')).toHaveText('1.02 AU');
    await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
    await ticked(page, 'fig-6-3a:circle');
  });

  test('a bound orbit turns between r_p and r_a; at r_a the body is not at rest (v = h/r_a = 13.1 km/s)', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-3a');
    const ranges = fig.locator('input[type=range]'); // h, ε, time
    // ε = −3.0e8 J/kg: turning points 0.653 and 2.30 AU, period 1.80 yr
    await slide(ranges.nth(1), -3);
    await expect(readout(fig, 'rp')).toHaveText('0.653 AU');
    await expect(readout(fig, 'ra')).toHaveText('2.3 AU');
    await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
    await ticked(page, 'fig-6-3a:bound');
    await slide(ranges.nth(2), 0.4);
    await page.waitForTimeout(200);
    expect(((await progress(page))?.tasks ?? {})['fig-6-3a:turning-speed']).toBeFalsy();
    await slide(ranges.nth(2), 0.9);
    await expect(readout(fig, 'r')).toHaveText('2.3 AU');
    await expect(readout(fig, 'v')).toHaveText('13.1 km/s');
    await ticked(page, 'fig-6-3a:turning-speed');
  });

  test('above zero there is one turning point and the orbit is unbound; with no force the path is a straight line', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-3a');
    const ranges = fig.locator('input[type=range]');
    // ε = +1.0e8 J/kg: r_p = 0.482 AU, no apoapsis
    await slide(ranges.nth(1), 1);
    await expect(readout(fig, 'rp')).toHaveText('0.482 AU');
    await expect(readout(fig, 'ra')).toHaveText('∞');
    await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
    await ticked(page, 'fig-6-3a:unbound');
    await fig.getByRole('button', { name: 'בלי כוח', exact: true }).click();
    await slide(ranges.nth(1), 2);
    // no force: closest approach h/√(2ε) = 1.50 AU, at 20.0 km/s
    await expect(readout(fig, 'rp')).toHaveText('1.5 AU');
    await expect(readout(fig, 'v')).toHaveText('20 km/s');
    await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
    await ticked(page, 'fig-6-3a:free-line');
  });

  test('another central force: the bound orbit is a rosette; gravity at the same h and ε closes', async ({ page }) => {
    const fig = await openFigure(page, 'fig-6-3b');
    // u = −(GM/r)e^(−r/3 AU), h = 4.5e15, ε = −1.0e8: turning points 0.722 and 2.20 AU
    await expect(readout(fig, 'rp')).toHaveText('0.722 AU');
    await expect(readout(fig, 'ra')).toHaveText('2.2 AU');
    await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
    await ticked(page, 'fig-6-3b:rosette');
    await fig.getByRole('button', { name: 'כבידה', exact: true }).click();
    await expect(readout(fig, 'ra')).toHaveText('8.31 AU');
    await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
    await ticked(page, 'fig-6-3b:compare');
  });
});

test.describe('questions', () => {
  test('numeric: the radius where U_eff = 0 is caught and tagged; the minimum is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-6.3-circular-radius"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('6.15e6');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    expect((await progress(page)).attempts.at(-1)).toMatchObject({
      qid: 'Q-6.3-circular-radius',
      correct: false,
      misconception: 'MC-6-circular-where-ueff-zero',
    });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('1.23e7');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('no sideways overflow at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(LESSON);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
