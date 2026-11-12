import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/8-4/';

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
const task = (page: Page, id: string) => expect.poll(async () => (await progress(page))?.tasks?.[id]).toBeTruthy();

test.describe('live figures', () => {
  test('scrolling through the text never completes a task', async ({ page }) => {
    await page.goto(LESSON);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
    });
    // clicking every step (they set states, including the end of a run) must not tick either
    const steps = page.locator('[data-step]');
    const n = await steps.count();
    for (let i = 0; i < n; i++) await steps.nth(i).evaluate((el: HTMLElement) => el.click());
    await page.waitForTimeout(400);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const p = await progress(page);
    expect(Object.keys(p?.tasks ?? {}).filter((k) => k.startsWith('fig-8-4'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-8-4a', '#fig-8-4b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('race: a disc on 20° rolls at g sin θ/1.5 = 2.23 m/s²; less friction makes the ring slip first, and the learner’s release ticks', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-4a');
    const ranges = fig.locator('input[type=range]'); // θ, μ, time
    // numbers in .scratch/ch8/8-4/lesson.ts
    await expect(readout(fig, 'a')).toHaveText('2.23 m/s²');
    await expect(readout(fig, 'mumin')).toHaveText('0.121');
    await expect(readout(fig, 'f')).toHaveText('0.114');
    // μ = 0.15 at 20°: the ring needs 0.182 and slips, the solid sphere needs 0.104 and rolls
    await slide(ranges.nth(1), 0.15);
    await task(page, 'fig-8-4a:ring-slips');
    await fig.getByRole('button', { name: 'טבעת', exact: true }).click();
    await expect(fig.locator('[data-readout="state"]')).toHaveText('גלגול עם החלקה');
    await expect(readout(fig, 'mumin')).toHaveText('0.182');
    await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
    await task(page, 'fig-8-4a:race-run');
    await slide(ranges.nth(0), 35);
    await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
    await task(page, 'fig-8-4a:steeper-same-order');
    // μ = 0.05 at 35°: every round body slips, all at g(sin θ − μ cos θ)
    await slide(ranges.nth(1), 0.05);
    await fig.getByRole('button', { name: 'שחררו', exact: true }).click();
    await task(page, 'fig-8-4a:all-slip');
  });

  test('skid: a ball thrown without spin rolls at (5/7)v₀ = 4.29 m/s whatever μ; backspin brings it back', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-4b');
    const ranges = fig.locator('input[type=range]'); // v₀, Rω₀, μₖ, time
    await expect(readout(fig, 'troll')).toHaveText('1.17 s');
    await expect(readout(fig, 'vf')).toHaveText('4.29 m/s');
    await expect(readout(fig, 'kfrac')).toHaveText('0.714');
    const play = fig.getByRole('button', { name: 'הפעלה', exact: true });
    await play.click();
    await task(page, 'fig-8-4b:no-spin');
    await slide(ranges.nth(2), 0.6);
    await expect(readout(fig, 'troll')).toHaveText('0.292 s');
    await expect(readout(fig, 'vf')).toHaveText('4.29 m/s');
    await play.click();
    await task(page, 'fig-8-4b:mu-free');
    // v₀ = 3.0 m/s, Rω₀ = −10 m/s: L_Q/(mR) = 3 − 4 = −1 m/s, v_f = −1/1.4 = −0.714 m/s
    await slide(ranges.nth(0), 3);
    await slide(ranges.nth(1), -10);
    await slide(ranges.nth(2), 0.15);
    await expect(readout(fig, 'vf')).toHaveText('−0.714 m/s');
    await expect(readout(fig, 'troll')).toHaveText('2.53 s');
    await play.click();
    await task(page, 'fig-8-4b:come-back');
    // rolling from the start: v₀ = Rω₀
    await slide(ranges.nth(1), 3);
    await expect(readout(fig, 'troll')).toHaveText('0 s');
    await task(page, 'fig-8-4b:no-friction-roll');
  });
});

test.describe('questions', () => {
  test('numeric: energy conservation in a skid (6.76) is caught and tagged; (5/7)v₀ is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-8.4-bowling-final-speed"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('6.76');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page)).attempts.at(-1))
      .toMatchObject({ qid: 'Q-8.4-bowling-final-speed', correct: false, misconception: 'MC-8-slipping-energy-conserved' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('5.71');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
