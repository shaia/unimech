import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/7-2/';

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
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-7-2'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-7-2a', '#fig-7-2b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('a vector fixed on the turntable does not change in S′, and changes at ω|Q| in S', async ({ page }) => {
    const fig = await openFigure(page, 'fig-7-2a');
    // Q = 0.30 m, ω = 1.5 rad/s: ω|Q| = 0.450 m/s (.scratch/ch7/7-2/fig.ts)
    await expect(readout(fig, 'rot')).toHaveText('0 m/s');
    await expect(readout(fig, 'wq')).toHaveText('0.45 m/s');
    await expect(readout(fig, 'in')).toHaveText('0.45 m/s');
    const ranges = fig.locator('input[type=range]'); // ω, angle of turn
    await slide(ranges.nth(0), 0.5);
    await expect(readout(fig, 'in')).toHaveText('0.15 m/s');
    await expect(readout(fig, 'rot')).toHaveText('0 m/s');
    await ticked(page, 'fig-7-2a:fixed-omega');
  });

  test('a turning unit vector changes by Δθ at 90° to itself as Δθ → 0', async ({ page }) => {
    const fig = await openFigure(page, 'fig-7-2a');
    await fig.getByRole('button', { name: 'וקטורי יחידה', exact: true }).click();
    // Δθ = 0.8 rad: |Δê|/Δθ = 0.974, angle 113°
    await expect(readout(fig, 'ratio')).toHaveText('0.974');
    await expect(readout(fig, 'angle')).toHaveText('113°');
    const ranges = fig.locator('input[type=range]'); // Δθ, angle of turn
    await slide(ranges.nth(0), 0.4);
    await page.waitForTimeout(200);
    expect(((await progress(page))?.tasks ?? {})['fig-7-2a:shrink']).toBeFalsy();
    await slide(ranges.nth(0), 0.1);
    await expect(readout(fig, 'angle')).toHaveText('92.9°');
    await ticked(page, 'fig-7-2a:shrink');
  });

  test("the bug's velocity in S is v′ + ω × r′: 0.492 m/s at r = 0.30 m; reaching the rim ticks the walk", async ({ page }) => {
    const fig = await openFigure(page, 'fig-7-2a');
    await fig.getByRole('button', { name: 'חיפושית', exact: true }).click();
    const ranges = fig.locator('input[type=range]'); // ω, v′, r
    await slide(ranges.nth(2), 0.3);
    await expect(readout(fig, 'rot')).toHaveText('0.2 m/s');
    await expect(readout(fig, 'wq')).toHaveText('0.45 m/s');
    await expect(readout(fig, 'in')).toHaveText('0.492 m/s');
    expect(((await progress(page))?.tasks ?? {})['fig-7-2a:bug-walk']).toBeFalsy();
    await slide(ranges.nth(2), 0.4);
    await ticked(page, 'fig-7-2a:bug-walk');
  });

  test('in S′ the friction balances the centrifugal and Coriolis forces; they vanish and appear as v′ and ω̇ change', async ({ page }) => {
    const fig = await openFigure(page, 'fig-7-2b');
    // m = 4.0 g, ω = 1.5, r = 0.30, v′ = 0.20: F = 3.61, F_cf = 2.70, F_cor = 2.40 mN, |a| = 0.903 m/s²
    await expect(readout(fig, 'f')).toHaveText('3.61 mN');
    await expect(readout(fig, 'fcf')).toHaveText('2.7 mN');
    await expect(readout(fig, 'fcor')).toHaveText('2.4 mN');
    await expect(readout(fig, 'a')).toHaveText('0.903 m/s²');
    const ranges = fig.locator('input[type=range]'); // ω, ω̇, r, v′
    await slide(ranges.nth(3), 0);
    await expect(readout(fig, 'fcor')).toHaveText('0 mN');
    await expect(readout(fig, 'f')).toHaveText('2.7 mN');
    await ticked(page, 'fig-7-2b:stand');
    await slide(ranges.nth(3), -0.2);
    await expect(readout(fig, 'fcor')).toHaveText('2.4 mN');
    await ticked(page, 'fig-7-2b:reverse');
    await slide(ranges.nth(3), 0);
    await slide(ranges.nth(1), 0.5);
    // ω̇ = 0.50 rad/s², standing bug: F_Euler = 0.600 mN, F = 2.77 mN
    await expect(readout(fig, 'feuler')).toHaveText('0.6 mN');
    await expect(readout(fig, 'f')).toHaveText('2.77 mN');
    await ticked(page, 'fig-7-2b:spin-up');
  });
});

test.describe('questions', () => {
  test('numeric: the speed relative to the turntable is caught and tagged; the vector sum is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-7.2-bug-velocity"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0.4');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page))?.attempts?.at(-1))
      .toMatchObject({ qid: 'Q-7.2-bug-velocity', correct: false, misconception: 'MC-7-derivative-frame-independent' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.5');
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
