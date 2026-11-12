import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/7-3/';

/** Set a range input the way a learner's drag does: value, then an input event. */
const slide = (range: Locator, value: number) =>
  range.evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** Open the figure, wait for hydration, stop the text steps and reset it. */
async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-7-3a');
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('canvas'));
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

/** A task's stored tick, read until the asynchronous write lands. */
const ticked = (page: Page, key: string) => expect.poll(async () => ((await progress(page))?.tasks ?? {})[key]).toBeTruthy();

const readout = (fig: Locator, key: string) => fig.locator(`[data-readout="${key}"] b`);
const launch = (fig: Locator) => fig.getByRole('button', { name: 'שגרו', exact: true }).click();

// Sliders, in order: ω, ρ₀, u, launch direction, time. Numbers: .scratch/ch7/7-3/fig.ts.
test.describe('live figure', () => {
  test('scrolling through the text never completes a task', async ({ page }) => {
    await page.goto(LESSON);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
    });
    for (const step of await page.locator('[data-step][data-fig="fig-7-3a"]').all()) await step.evaluate((n: HTMLElement) => n.click());
    await page.waitForTimeout(400);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const tasks = (await progress(page))?.tasks ?? {};
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-7-3'))).toHaveLength(0);
  });

  test('the figure draws, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvas = page.locator('#fig-7-3a canvas');
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  });

  test('from the centre the puck leaves after 2.50 s; the S′ path matches the straight line of S; launching ticks the task', async ({ page }) => {
    const fig = await openFigure(page);
    await expect(fig.locator('[data-readout="exit"] b')).toHaveText('2.5 s');
    await expect(fig.locator('[data-readout="v"] b')).toHaveText('|v| = 0.4 m/s');
    // the integrated S′ path agrees with toRotating of the straight line to round-off
    const dev = await fig.locator('[data-readout="dev"] b').textContent();
    // sci() writes the exponent in superscript digits (1·10⁻¹¹ m): accept 10⁻⁹ or smaller
    expect(dev).toMatch(/10⁻(¹[⁰¹²³⁴⁵⁶⁷⁸⁹]|⁹)/);
    await launch(fig);
    await ticked(page, 'fig-7-3a:centre');
  });

  test('the Coriolis force does no work: ½v′² − ½ω²ρ² stays 0.08 J/kg while v′ grows', async ({ page }) => {
    const fig = await openFigure(page);
    const ranges = fig.locator('input[type=range]');
    await expect(readout(fig, 'jacobi')).toHaveText('0.08 J/kg');
    await slide(ranges.nth(4), 1);
    await expect(readout(fig, 'rho')).toHaveText('0.4 m');
    await expect(fig.locator('[data-readout="vp"] b')).toHaveText("|v′| = 0.566 m/s");
    await expect(readout(fig, 'fcor')).toHaveText('1.13 m/s²');
    await expect(readout(fig, 'jacobi')).toHaveText('0.08 J/kg');
    await expect(fig.locator('[data-readout="v"] b')).toHaveText('|v| = 0.4 m/s');
  });

  test('a released puck: only the centrifugal force at first, ρ = 0.707 m after 1 s in both frames; ticks release', async ({ page }) => {
    const fig = await openFigure(page);
    const ranges = fig.locator('input[type=range]');
    await slide(ranges.nth(1), 0.5);
    await slide(ranges.nth(2), 0);
    await expect(readout(fig, 'fcf')).toHaveText('0.5 m/s²');
    await expect(readout(fig, 'fcor')).toHaveText('0 m/s²');
    await expect(fig.locator('[data-readout="exit"] b')).toHaveText('1.73 s');
    await slide(ranges.nth(4), 1);
    await expect(readout(fig, 'rho')).toHaveText('0.707 m');
    await launch(fig);
    await ticked(page, 'fig-7-3a:release');
  });

  test('a turntable at rest and one turning the other way tick their tasks', async ({ page }) => {
    const fig = await openFigure(page);
    const ranges = fig.locator('input[type=range]');
    await slide(ranges.nth(0), 0);
    await expect(readout(fig, 'fcor')).toHaveText('0 m/s²');
    await launch(fig);
    await ticked(page, 'fig-7-3a:still');
    await slide(ranges.nth(0), -1);
    await launch(fig);
    await ticked(page, 'fig-7-3a:reverse');
  });
});

test.describe('questions', () => {
  test('"the released puck flies out along the radius" is caught and tagged', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-7.3-released-puck"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.getByRole('radio', { name: /קו ישר החוצה, לאורך הרדיוס/ }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    expect((await progress(page)).attempts.at(-1)).toMatchObject({
      qid: 'Q-7.3-released-puck',
      correct: false,
      misconception: 'MC-7-released-flies-radially',
    });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await q.getByRole('radio', { name: /קו ישר, משיק למעגל/ }).click();
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
