import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/9-3/';

/** Set a range input the way a learner's drag does: value, then an input event. */
const slide = (range: Locator, value: number) =>
  range.evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** Open the figure, wait for hydration, stop the text steps and reset it. */
async function openFigure(page: Page) {
  await page.goto(LESSON);
  const fig = page.locator('#fig-9-3a');
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('canvas'));
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

/** A task's stored tick, read until the asynchronous write lands. */
const ticked = (page: Page, key: string) => expect.poll(async () => ((await progress(page))?.tasks ?? {})[key]).toBeTruthy();
const unticked = async (page: Page, key: string) => {
  await page.waitForTimeout(200);
  expect(((await progress(page))?.tasks ?? {})[key]).toBeFalsy();
};

const readout = (fig: Locator, key: string) => fig.locator(`[data-readout="${key}"] b`);
/** the sliders, in order: β, the instant, the strike's place */
const ranges = (fig: Locator) => fig.locator('input[type=range]');

test.describe('live figure', () => {
  test('scrolling and clicking through the text never completes a task', async ({ page }) => {
    await page.goto(LESSON);
    const n = await walkSteps(page);
    expect(n).toBeGreaterThan(10);
    await page.waitForTimeout(400);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const tasks = (await progress(page))?.tasks ?? {};
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-9-3'))).toHaveLength(0);
  });

  test('the figure draws, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvas = page.locator('#fig-9-3a canvas');
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  });

  test('at 0.8c the train clocks are 1.2 c·s apart and each lags its rear neighbour by 1.6 s; Galileo has neither', async ({ page }) => {
    const fig = await openFigure(page);
    // β = 0.8: γ = 5/3, spacing 2/γ = 1.2, lead βd₀/c = 1.6 s (.scratch/ch9/9-3/lesson.ts)
    await expect(readout(fig, 'gamma')).toHaveText('1.67');
    await expect(readout(fig, 'spacing')).toHaveText('1.2 c·s');
    await expect(readout(fig, 'lead')).toHaveText('1.6 s');
    await fig.getByRole('button', { name: 'גליליי', exact: true }).click();
    await expect(readout(fig, 'gamma')).toHaveText('1');
    await expect(readout(fig, 'spacing')).toHaveText('2 c·s');
    await expect(readout(fig, 'lead')).toHaveText('0 s');
    await ticked(page, 'fig-9-3a:galileo');
  });

  test('two strikes simultaneous in S, 6 c·s apart, are 8 s apart in S′, the front one first', async ({ page }) => {
    const fig = await openFigure(page);
    // instant t = 5 s: A at x = 0 → (t′, x′) = (8.33 s, −6.67 c·s); B at x = 6 → (0.333 s, 3.33 c·s)
    await slide(ranges(fig).nth(2), 0);
    await fig.getByRole('button', { name: 'ברק A', exact: true }).click();
    await expect(readout(fig, 'A').nth(0)).toHaveText('(5 s, 0 c·s)');
    await expect(readout(fig, 'A').nth(1)).toHaveText('(8.33 s, −6.67 c·s)');
    await unticked(page, 'fig-9-3a:strike-s');
    await slide(ranges(fig).nth(2), 6);
    await fig.getByRole('button', { name: 'ברק B', exact: true }).click();
    await expect(readout(fig, 'B').nth(1)).toHaveText('(0.333 s, 3.33 c·s)');
    await expect(readout(fig, 'dt')).toHaveText('0 s');
    await expect(readout(fig, 'dtp')).toHaveText('−8 s');
    await ticked(page, 'fig-9-3a:strike-s');
  });

  test('from S′: strikes simultaneous on the train are 8 s apart on the platform; switching views ticks its task', async ({ page }) => {
    const fig = await openFigure(page);
    // the <bdi> around S′ puts a space into the accessible name ("מבט מ- S′")
    await fig.getByRole('button', { name: /^מבט מ-\s*S′$/ }).click();
    await ticked(page, 'fig-9-3a:view-sp');
    // instant t′ = 5 s: A at x′ = 0 → t = 8.33 s; B at x′ = 6 → t = 16.3 s
    await slide(ranges(fig).nth(2), 0);
    await fig.getByRole('button', { name: 'ברק A', exact: true }).click();
    await slide(ranges(fig).nth(2), 6);
    await fig.getByRole('button', { name: 'ברק B', exact: true }).click();
    await expect(readout(fig, 'dtp')).toHaveText('0 s');
    await expect(readout(fig, 'dt')).toHaveText('8 s');
    await ticked(page, 'fig-9-3a:strike-sp');
  });

  test('below β = 0.3 the Galileo switch ticks nothing', async ({ page }) => {
    const fig = await openFigure(page);
    await slide(ranges(fig).nth(0), 0.2);
    await expect(readout(fig, 'beta')).toHaveText('0.2');
    await fig.getByRole('button', { name: 'גליליי', exact: true }).click();
    await unticked(page, 'fig-9-3a:galileo');
  });
});

test.describe('questions', () => {
  test('numeric: the Galilean x − vt is caught; the Lorentz x′ is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-9.3-event-x"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('5.4e8');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect.poll(async () => (await progress(page))?.attempts?.at(-1)).toMatchObject({ qid: 'Q-9.3-event-x', correct: false });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('6.75e8');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('no sideways overflow at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(LESSON);
    const sw = await page.evaluate(() => {
      document.querySelectorAll('details').forEach((d) => ((d as HTMLDetailsElement).open = true));
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    expect(sw).toBeLessThanOrEqual(0);
  });
});
