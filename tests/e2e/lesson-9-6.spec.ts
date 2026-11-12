import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/9-6/';

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
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-step]'))) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        await frame();
        await frame();
        el.click();
      }
    });
    await page.waitForTimeout(400);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const tasks = (await progress(page))?.tasks ?? {};
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-9-6'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-9-6a', '#fig-9-6b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test("the twins age 10 and 8 years; the traveller's Earth \"now\" jumps from 3.2 to 6.8 at the turn", async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-6a');
    // L = 3 ly, β = 0.6 (.scratch/ch9/9-6/lesson.ts)
    await expect(readout(fig, 'home')).toHaveText('10 שנים');
    await expect(readout(fig, 'trav')).toHaveText('8 שנים');
    await expect(readout(fig, 'jump')).toHaveText('3.6 שנים');
    const ranges = fig.locator('input[type=range]'); // L, β, τ
    await slide(ranges.nth(2), 2);
    await expect(readout(fig, 'now')).toHaveText('1.6 שנים');
    await slide(ranges.nth(2), 4);
    await expect(readout(fig, 'now')).toHaveText('3.2 שנים');
    await page.waitForTimeout(200);
    expect(((await progress(page))?.tasks ?? {})['fig-9-6a:scrub']).toBeFalsy();
    await slide(ranges.nth(2), 4.05);
    await expect(readout(fig, 'now')).toHaveText('6.84 שנים');
    await ticked(page, 'fig-9-6a:scrub');
  });

  test('a trip twice as long doubles the age gap; Earth\'s yearly signals count its 10 years', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-6a');
    const ranges = fig.locator('input[type=range]');
    await slide(ranges.nth(0), 6);
    await expect(readout(fig, 'home')).toHaveText('20 שנים');
    await expect(readout(fig, 'trav')).toHaveText('16 שנים');
    await ticked(page, 'fig-9-6a:longer');
    await fig.getByRole('button', { name: 'איפוס' }).click();
    await fig.getByRole('button', { name: 'מכדור הארץ', exact: true }).click();
    await ticked(page, 'fig-9-6a:signals');
    await slide(ranges.nth(2), 4);
    await expect(readout(fig, 'sig')).toHaveText('2');
    await slide(ranges.nth(2), 8);
    await expect(readout(fig, 'sig')).toHaveText('10');
  });

  test('in the pole frame the exit door acts 22.2 ns first; at 0.5c the doors hit the pole', async ({ page }) => {
    const fig = await openFigure(page, 'fig-9-6b');
    // pole 6.0 m, barn 5.0 m, β = 0.8 (.scratch/ch9/9-6/lesson.ts)
    await expect(readout(fig, 'pole')).toHaveText('3.6 m');
    await expect(readout(fig, 'barn')).toHaveText('5 m');
    await expect(readout(fig, 'gap')).toHaveText('0 ns');
    await expect(readout(fig, 'hit')).toHaveText('אף דלת לא נוגעת במוט');
    await fig.getByRole('button', { name: 'של המוט', exact: true }).click();
    await ticked(page, 'fig-9-6b:pole-frame');
    await expect(readout(fig, 'pole')).toHaveText('6 m');
    await expect(readout(fig, 'barn')).toHaveText('3 m');
    await expect(readout(fig, 'gap')).toHaveText('22.2 ns');
    const ranges = fig.locator('input[type=range]'); // β, now
    await slide(ranges.nth(1), -3);
    await page.waitForTimeout(200);
    expect(((await progress(page))?.tasks ?? {})['fig-9-6b:exit-first']).toBeFalsy();
    await slide(ranges.nth(1), -6.65);
    await ticked(page, 'fig-9-6b:exit-first');
    await slide(ranges.nth(0), 0.5);
    await expect(readout(fig, 'hit')).toHaveText('הדלתות פוגעות במוט');
    await ticked(page, 'fig-9-6b:no-fit');
  });
});

test.describe('questions', () => {
  test('numeric: multiplying by γ is caught and tagged; the proper time is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-9.6-twin-ages"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('16.7');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page))?.attempts?.at(-1))
      .toMatchObject({ qid: 'Q-9.6-twin-ages', correct: false, misconception: 'MC-9-proper-time-rest-frame' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('6');
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
