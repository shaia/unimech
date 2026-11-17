import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/10-3/';

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
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-10-3'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-10-3a', '#fig-10-3b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('decay at rest: the light product takes most of Q; equal masses share it equally', async ({ page }) => {
    const fig = await openFigure(page, 'fig-10-3a');
    // π⁺ → μ⁺ν: K_μ = 4.13, K_ν = 29.9 of Q = 34 MeV (.scratch/ch10/10-3/lesson.ts)
    await expect(readout(fig, 'q')).toHaveText('Q = 34 MeV');
    await expect(readout(fig, 'k1')).toHaveText('4.13 MeV');
    await expect(readout(fig, 'k2')).toHaveText('29.9 MeV');
    await fig.getByRole('button', { name: 'Λ⁰ → p + π⁻', exact: true }).click();
    await expect(readout(fig, 'pstar')).toHaveText('p* = 101 MeV/c');
    await expect(readout(fig, 'k1')).toHaveText('5.41 MeV');
    await expect(readout(fig, 'k2')).toHaveText('32.6 MeV');
    await expect(readout(fig, 'newton')).toHaveText('4.94 + 33.1 MeV');
    await fig.getByRole('button', { name: 'K⁰ → π⁺ + π⁻', exact: true }).click();
    await expect(readout(fig, 'k1')).toHaveText('109 MeV');
    await expect(readout(fig, 'k2')).toHaveText('109 MeV');
    await ticked(page, 'fig-10-3a:equal');
  });

  test('decay in flight: the products carry γMc² and γβMc, their invariant mass is M, and they are thrown forward', async ({ page }) => {
    const fig = await openFigure(page, 'fig-10-3a');
    const ranges = fig.locator('input[type=range]'); // β, θ*
    await slide(ranges.nth(0), 0.6);
    await slide(ranges.nth(1), 90);
    // γ = 1.25, the muon emitted perpendicular in the pion's frame (the lesson's step): E = 175 MeV, p = 105 MeV/c;
    // the muon γE′ = 137.7 MeV, the neutrino 37.3 MeV (.scratch/review/ch10/10-3/recompute.ts)
    await expect(readout(fig, 'lab-e')).toHaveText('138 + 37.3 = 175 MeV = γMc²');
    await expect(readout(fig, 'lab-p')).toContainText('γβMc = 105');
    await expect(readout(fig, 'mass')).toHaveText('140 MeV/c²');
    await ticked(page, 'fig-10-3a:boost');
    await slide(ranges.nth(0), 0.9);
    await slide(ranges.nth(1), 90);
    await expect(readout(fig, 'angle')).toHaveText('33.3°');
    await ticked(page, 'fig-10-3a:forward');
  });

  test('threshold: 6mc² on a fixed target, mc² per beam head on; the π⁰ needs 280 MeV', async ({ page }) => {
    const fig = await openFigure(page, 'fig-10-3b');
    await expect(readout(fig, 'sqrt-s')).toHaveText('√s = 3024 MeV');
    await expect(readout(fig, 'need')).toHaveText('3752 MeV');
    await expect(readout(fig, 'kth-fixed')).toHaveText('5628 MeV');
    await expect(readout(fig, 'kth-collider')).toHaveText('938 MeV');
    const k = () => fig.locator('input[type=range]').first();
    await slide(k(), 5628);
    await expect(readout(fig, 'sqrt-s')).toHaveText('√s = 3752 MeV');
    await expect(readout(fig, 'status')).toHaveText('מעל הסף: התגובה אפשרית');
    await expect(readout(fig, 'beta-cm')).toHaveText('0.866c');
    await ticked(page, 'fig-10-3b:cross');
    await fig.getByRole('button', { name: 'התנגשות חזיתית', exact: true }).click();
    await slide(k(), 900);
    await expect(readout(fig, 'status')).toHaveText('מתחת לסף: התגובה לא יכולה לקרות');
    await slide(k(), 938);
    await expect(readout(fig, 'sqrt-s')).toHaveText('√s = 3752 MeV');
    await ticked(page, 'fig-10-3b:collider');
    await fig.getByRole('button', { name: 'p + p → p + p + π⁰', exact: true }).click();
    await fig.getByRole('button', { name: 'מטרה נייחת', exact: true }).click();
    await expect(readout(fig, 'kth-fixed')).toHaveText('280 MeV');
    await expect(readout(fig, 'kth-collider')).toHaveText('67.5 MeV');
    await slide(k(), 280);
    await expect(readout(fig, 'status')).toHaveText('מעל הסף: התגובה אפשרית');
    await ticked(page, 'fig-10-3b:pion');
  });
});

test.describe('questions', () => {
  test('numeric: the equal share is caught and tagged; the muon’s 4.13 MeV is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-10.3-muon-kinetic"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('17');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page))?.attempts?.at(-1))
      .toMatchObject({ qid: 'Q-10.3-muon-kinetic', correct: false, misconception: 'MC-10-equal-share' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('4.13');
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
