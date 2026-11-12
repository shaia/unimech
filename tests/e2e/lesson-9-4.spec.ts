import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/9-4/';

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
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-9-4'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-9-4a', '#fig-9-4b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('speeds below c add to a speed below c: 0.5c ⊕ 0.9c = 0.966c while Galileo gives 1.4c', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-4a');
    // v = 0.5, u′ = 0.3: u = 0.8/1.15 = 0.696 (.scratch/ch9/9-4/lesson.ts)
    await expect(readout(fig, 'gal')).toHaveText('0.8c');
    await expect(readout(fig, 'u')).toHaveText('0.696c');
    const ranges = fig.locator('input[type=range]'); // v, u′
    await slide(ranges.nth(1), 0.9);
    await expect(readout(fig, 'gal')).toHaveText('1.4c');
    await expect(readout(fig, 'u')).toHaveText('0.966c');
    await ticked(page, 'fig-9-4a:beyond');
  });

  test('a light pulse from the moving ship moves at exactly c; at 0.1c the two sums agree to 1%', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-4a');
    await fig.getByRole('button', { name: 'פולס אור במקום גשושית', exact: true }).click();
    await expect(readout(fig, 'u')).toHaveText('c');
    await expect(readout(fig, 'gal')).toHaveText('1.5c');
    await ticked(page, 'fig-9-4a:light');
    const ranges = fig.locator('input[type=range]');
    await slide(ranges.nth(0), 0.1);
    await slide(ranges.nth(1), 0.1);
    await expect(readout(fig, 'gal')).toHaveText('0.2c');
    await expect(readout(fig, 'u')).toHaveText('0.198c');
    await ticked(page, 'fig-9-4a:slow');
  });

  test('Doppler: f/f₀ = √3 at β = 0.5, between the two sound formulas; 1 at rest; 1/√3 receding; frame-independent', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-4b');
    await expect(readout(fig, 'ratio')).toHaveText('f/f₀ = 1.73');
    await expect(readout(fig, 'sound-src')).toHaveText('2');
    await expect(readout(fig, 'sound-obs')).toHaveText('1.5');
    await fig.getByRole('button', { name: 'מערכת המקור', exact: true }).click();
    await expect(readout(fig, 'ratio')).toHaveText('f/f₀ = 1.73');
    await ticked(page, 'fig-9-4b:frames');
    const beta = fig.locator('input[type=range]').first();
    await slide(beta, 0);
    await expect(readout(fig, 'ratio')).toHaveText('f/f₀ = 1');
    await ticked(page, 'fig-9-4b:still');
    await slide(beta, -0.5);
    await expect(readout(fig, 'ratio')).toHaveText('f/f₀ = 0.577');
    await ticked(page, 'fig-9-4b:recede');
  });
});

test.describe('questions', () => {
  test('numeric: the Galilean sum is caught and tagged; the relativistic sum is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-9.4-probe-speed"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('1.2');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page))?.attempts?.at(-1))
      .toMatchObject({ qid: 'Q-9.4-probe-speed', correct: false, misconception: 'MC-9-galilean-velocity-addition' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.882');
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
