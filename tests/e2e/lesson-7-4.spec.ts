import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/7-4/';

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
    const steps = page.locator('[data-step]');
    const n = await steps.count();
    // a dispatched click: the step's own handler, never a link inside its text
    for (let i = 0; i < n; i++) await steps.nth(i).dispatchEvent('click');
    await page.waitForTimeout(400);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const tasks = (await progress(page))?.tasks ?? {};
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-7-4'))).toHaveLength(0);
  });

  test('all three figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-7-4a', '#fig-7-4b', '#fig-7-4c']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('at 40° the real plumb line leans 0.0977° and the readout says when ω is exaggerated', async ({ page }) => {
    const fig = await openFigure(page, 'fig-7-4a');
    const ranges = fig.locator('input[type=range]'); // latitude, ω's factor
    // λ = 40°: ω²R cos λ = 0.0259 m/s², |g_eff| = 9.78 m/s², α = 0.0977° (.scratch/ch7/7-4/lesson.ts)
    await expect(readout(fig, 'cf')).toHaveText('0.0259 m/s²');
    await expect(readout(fig, 'geff')).toHaveText('9.78 m/s²');
    await expect(readout(fig, 'alpha')).toHaveText('0.0977°');
    await slide(ranges.nth(1), 10);
    await expect(fig.locator('[data-readout="scale"]')).toContainText('ω מוגדלת פי 10');
    await expect(fig.locator('[data-readout="scale"]')).toContainText('α = 12°');
    await expect(readout(fig, 'alpha')).toHaveText('0.0977°');
    await ticked(page, 'fig-7-4a:exaggerate');
  });

  test('the equator and the pole: the smallest g_eff, and no lean at either; the lean is largest near 45°', async ({ page }) => {
    const fig = await openFigure(page, 'fig-7-4a');
    const lat = fig.locator('input[type=range]').first();
    await slide(lat, 0);
    await expect(readout(fig, 'geff')).toHaveText('9.766 m/s²');
    await expect(readout(fig, 'alpha')).toHaveText('0°');
    await slide(lat, 90);
    await expect(readout(fig, 'geff')).toHaveText('9.8 m/s²');
    await ticked(page, 'fig-7-4a:ends');
    await slide(lat, 45);
    await ticked(page, 'fig-7-4a:max-lat');
  });

  test('the Foucault plane turns once in a sidereal day at the pole, 27.6 h at 60°, never on the equator', async ({ page }) => {
    const fig = await openFigure(page, 'fig-7-4b');
    const ranges = fig.locator('input[type=range]'); // latitude, hours
    await expect(readout(fig, 'period')).toHaveText('27.6 h');
    await expect(readout(fig, 'rate')).toHaveText('13°/h');
    await expect(readout(fig, 'sense')).toHaveText('עם כיוון השעון');
    await slide(ranges.nth(0), 90);
    await expect(readout(fig, 'period')).toHaveText('23.9 h');
    await slide(ranges.nth(1), 24);
    await ticked(page, 'fig-7-4b:pole');
    await slide(ranges.nth(0), 0);
    await expect(readout(fig, 'period')).toHaveText('∞');
    await expect(readout(fig, 'sense')).toHaveText('לא מסתובב');
    await slide(ranges.nth(1), 12);
    await ticked(page, 'fig-7-4b:equator');
    await slide(ranges.nth(0), -60);
    await expect(readout(fig, 'sense')).toHaveText('נגד כיוון השעון');
    await slide(ranges.nth(1), 6);
    await ticked(page, 'fig-7-4b:south');
    await fig.getByRole('button', { name: 'מבט מקרוב', exact: true }).click();
    await ticked(page, 'fig-7-4b:closeup');
    await expect(fig.locator('[data-readout="scale"]')).toContainText('ω מוגדלת פי 200');
  });

  test('air released around a low circles it counter-clockwise in the north; a sink is barely deflected', async ({ page }) => {
    // three releases each play their animation in real time (≈ 26 s alone): the default 30 s leaves no margin under load
    test.setTimeout(60_000);
    const fig = await openFigure(page, 'fig-7-4c');
    const lat = fig.locator('input[type=range]').first();
    const release = fig.getByRole('button', { name: 'שחררו', exact: true });
    await release.click();
    await ticked(page, 'fig-7-4c:north');
    await expect(readout(fig, 'sense')).toHaveText('נגד כיוון השעון', { timeout: 12_000 });
    await slide(lat, -45);
    await release.click();
    await ticked(page, 'fig-7-4c:south-flow');
    await expect(readout(fig, 'sense')).toHaveText('עם כיוון השעון', { timeout: 12_000 });
    await slide(lat, 45);
    await fig.getByRole('button', { name: 'כיור', exact: true }).click();
    await release.click();
    await ticked(page, 'fig-7-4c:sink');
    // the largest sideways drift of the water: 0.013 mm
    await expect(readout(fig, 'sense')).toContainText('0.013 mm', { timeout: 12_000 });
  });
});

test.describe('questions', () => {
  test('mc: "the plumb line points at the centre" is tagged, then the lean toward the equator is accepted', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-7.4-plumb-direction"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.getByRole('radio', { name: /הוא מצביע בדיוק אל מרכז כדור הארץ/ }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    expect((await progress(page)).attempts.at(-1)).toMatchObject({ qid: 'Q-7.4-plumb-direction', correct: false, misconception: 'MC-7-plumb-points-to-center' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await q.getByRole('radio', { name: /המשקולת מוסטת דרומה/ }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('numeric: the eastward deflection of a 100 m drop is 1.87 cm', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-7.4-fall-deflection"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('1.87');
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
