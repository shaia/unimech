import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/5-1/';

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
    const p = await progress(page);
    expect(Object.keys(p?.tasks ?? {}).filter((k) => k.startsWith('fig-5-1'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-5-1a', '#fig-5-1b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('horizontal spring: T = 2π√(m/k) = 1.26 s at any amplitude; a push outward gives A = 0.141 m and φ = −π/4', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-1a');
    const ranges = fig.locator('input[type=range]'); // m, k, x₀, v₀, time
    // m = 0.80 kg, k = 20 N/m: ω₀ = 5 rad/s (shm numbers in .scratch/ch5/5-1/lesson.ts)
    await expect(readout(fig, 'T')).toHaveText('1.26 s');
    await expect(readout(fig, 'A')).toHaveText('0.1 m');
    await slide(ranges.nth(2), 0.2);
    await expect(readout(fig, 'T')).toHaveText('1.26 s');
    await slide(ranges.nth(2), 0.1);
    await slide(ranges.nth(3), 0.5);
    await expect(readout(fig, 'A')).toHaveText('0.141 m');
    await expect(readout(fig, 'phi')).toHaveText('−0.785 rad');
  });

  test('the learner’s own settings tick the phase and amplitude tasks; series and parallel give 1.78 s and 0.889 s', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-1a');
    const ranges = fig.locator('input[type=range]');
    const tasks = fig.locator('.sim-tasks li'); // outward, amplitude-20, phase-half-pi, series-parallel
    const play = fig.getByRole('button', { name: 'הפעלה', exact: true });
    await expect(tasks.nth(2)).not.toHaveClass(/done/);
    // at the centre, moving toward −x: φ = +π/2
    await slide(ranges.nth(2), 0);
    await slide(ranges.nth(3), -0.5);
    await expect(readout(fig, 'phi')).toHaveText('1.57 rad');
    await expect.poll(async () => (await progress(page)).tasks['fig-5-1a:phase-half-pi']).toBeTruthy();
    // x₀ = 0.12 m, v₀ = 0.80 m/s: v₀/ω₀ = 0.16 m, A = 0.20 m
    await slide(ranges.nth(2), 0.12);
    await slide(ranges.nth(3), 0.8);
    await expect(readout(fig, 'A')).toHaveText('0.2 m');
    await expect.poll(async () => (await progress(page)).tasks['fig-5-1a:amplitude-20']).toBeTruthy();
    await play.click();
    await expect.poll(async () => (await progress(page)).tasks['fig-5-1a:outward']).toBeTruthy();
    await fig.getByRole('button', { name: 'שניים בטור', exact: true }).click();
    await expect(readout(fig, 'keq')).toHaveText('10 N/m');
    await expect(readout(fig, 'T')).toHaveText('1.78 s');
    await play.click();
    await expect(tasks.nth(3)).not.toHaveClass(/done/);
    await fig.getByRole('button', { name: 'שניים במקביל', exact: true }).click();
    await expect(readout(fig, 'T')).toHaveText('0.889 s');
    await play.click();
    await expect.poll(async () => (await progress(page)).tasks['fig-5-1a:series-parallel']).toBeTruthy();
    await expect(tasks.nth(3)).toHaveClass(/done/);
  });

  test('vertical spring: gravity moves the equilibrium (Δ = 0.147 m on Earth, 0.0243 m on the Moon) and leaves T = 0.77 s', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-1b');
    const ranges = fig.locator('input[type=range]'); // m, k, x₀, v₀, time
    await expect(readout(fig, 'D')).toHaveText('0.147 m');
    await expect(readout(fig, 'T')).toHaveText('0.77 s');
    // released at the relaxed length: A = Δ, the lowest point after T/2 = 0.385 s, stretched 2Δ = 0.294 m
    await fig.getByRole('button', { name: 'שחרור מהאורך הרפוי', exact: true }).click();
    await expect(readout(fig, 'A')).toHaveText('0.147 m');
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await expect.poll(async () => (await progress(page)).tasks['fig-5-1b:natural-release']).toBeTruthy();
    await slide(ranges.nth(4), 0.39);
    await expect(readout(fig, 'stretch')).toHaveText('0.294 m');
    await expect.poll(async () => (await progress(page)).tasks['fig-5-1b:lowest']).toBeTruthy();
    await fig.getByRole('button', { name: 'הירח', exact: true }).click();
    await expect(readout(fig, 'D')).toHaveText('0.0243 m');
    await expect(readout(fig, 'T')).toHaveText('0.77 s');
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await expect.poll(async () => (await progress(page)).tasks['fig-5-1b:moon']).toBeTruthy();
    await fig.getByRole('button', { name: 'בלי כובד', exact: true }).click();
    await expect(readout(fig, 'D')).toHaveText('0 m');
    await expect(readout(fig, 'T')).toHaveText('0.77 s');
  });
});

test.describe('questions', () => {
  test('numeric: "the amplitude is x₀" is caught and tagged; √(x₀² + (v₀/ω₀)²) is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.1-amplitude-from-ic"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('3');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    expect((await progress(page)).attempts.at(-1)).toMatchObject({
      qid: 'Q-5.1-amplitude-from-ic',
      correct: false,
      misconception: 'MC-5-amplitude-is-x0',
    });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('5.0');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
