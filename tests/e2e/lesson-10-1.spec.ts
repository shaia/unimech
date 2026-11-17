import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/10-1/';

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

/** index of a pc value [MeV] on the figure's ladder 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, … */
const PC = { 1: 3, 10: 6, 50: 8, 100: 9 } as const;

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
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-10-1'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-10-1a', '#fig-10-1b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('K = (γ − 1)mc² beats ½mv²: 0.25 against 0.18 at 0.6c, within 1% at 0.1c, twice at 0.8c; p passes mc', async ({ page }) => {
    const fig = await openFigure(page, 'fig-10-1a');
    // .scratch/ch10/10-1/numbers.ts
    await expect(readout(fig, 'beta')).toHaveText('β = 0.6, γ = 1.25');
    await expect(readout(fig, 'p')).toHaveText('p = 0.75 mc');
    await expect(readout(fig, 'k')).toHaveText('K = 0.25 mc²');
    await expect(readout(fig, 'k-newton')).toHaveText('½mv² = 0.18 mc²');
    await expect(readout(fig, 'ratio')).toHaveText('K/(½mv²) = 1.39');
    const beta = fig.locator('input[type=range]').first();
    await slide(beta, 0.1);
    await expect(readout(fig, 'ratio')).toHaveText('K/(½mv²) = 1.01');
    await ticked(page, 'fig-10-1a:small');
    await slide(beta, 0.8);
    await expect(readout(fig, 'ratio')).toHaveText('K/(½mv²) = 2.08');
    await ticked(page, 'fig-10-1a:double');
    await fig.getByRole('button', { name: 'תנע', exact: true }).click();
    await slide(beta, 0.9);
    await expect(readout(fig, 'p')).toHaveText('p = 2.06 mc');
    await expect(readout(fig, 'p-newton')).toHaveText('mv = 0.9 mc');
    await ticked(page, 'fig-10-1a:beyond-mc');
    await slide(beta, 0.95);
    await ticked(page, 'fig-10-1a:near-c');
  });

  test("the thought experiment: Newton's sum of y momenta is −2mu(1 − 1/γ), −0.4 mu at 0.6c; no task ticks there", async ({ page }) => {
    const fig = await openFigure(page, 'fig-10-1a');
    await fig.getByRole('button', { name: 'ניסוי מחשבתי', exact: true }).click();
    // .scratch/review/ch10/10-1/recompute.ts: −2(1 − 1/1.25) = −0.4
    await expect(readout(fig, 'newton-sum')).toHaveText('−2mu + 2mu/γ = −0.4 mu');
    await expect(readout(fig, 'proper-sum')).toHaveText('−2mu + 2mu = 0');
    const beta = fig.locator('input[type=range]').first();
    await slide(beta, 0.8);
    // γ = 5/3: −2(1 − 0.6) = −0.8
    await expect(readout(fig, 'newton-sum')).toHaveText('−2mu + 2mu/γ = −0.8 mu');
    await slide(beta, 0.05);
    await slide(beta, 0.97);
    await page.waitForTimeout(300);
    const tasks = (await progress(page))?.tasks ?? {};
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-10-1a'))).toHaveLength(0);
    await expect(fig.locator('canvas')).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(fig.locator('canvas'))).toBeGreaterThan(200);
  });

  test('E² = (pc)² + (mc²)²: an electron at 1 MeV/c; a photon at c at every momentum; Newton and the light-like limit', async ({ page }) => {
    const fig = await openFigure(page, 'fig-10-1b');
    await expect(readout(fig, 'e')).toHaveText('E = 1.12 MeV');
    await expect(readout(fig, 'k')).toHaveText('K = 0.612 MeV');
    await expect(readout(fig, 'beta')).toHaveText('β = pc/E = 0.89');
    await expect(readout(fig, 'newton')).toHaveText('p²/2m = 0.978 MeV');
    const pc = fig.locator('input[type=range]').first();
    await fig.getByRole('button', { name: 'פוטון', exact: true }).click();
    await expect(readout(fig, 'beta')).toHaveText('β = pc/E = 1');
    await slide(pc, PC[100]);
    await expect(readout(fig, 'e')).toHaveText('E = 100 MeV');
    await expect(readout(fig, 'beta')).toHaveText('β = pc/E = 1');
    await ticked(page, 'fig-10-1b:massless');
    // the same momentum, three particles
    await fig.getByRole('button', { name: 'אלקטרון', exact: true }).click();
    await expect(readout(fig, 'beta')).toHaveText('β = pc/E = 1 − 1.3·10⁻⁵');
    await fig.getByRole('button', { name: 'מיואון', exact: true }).click();
    await ticked(page, 'fig-10-1b:same-p');
    // a proton at pc = 50 MeV: K and p²/2m agree
    await fig.getByRole('button', { name: 'פרוטון', exact: true }).click();
    await slide(pc, PC[50]);
    await expect(readout(fig, 'k')).toHaveText('K = 1.33 MeV');
    await expect(readout(fig, 'newton')).toHaveText('p²/2m = 1.33 MeV');
    await ticked(page, 'fig-10-1b:newton');
    // an electron at pc = 10 MeV, about 20 mc²
    await fig.getByRole('button', { name: 'אלקטרון', exact: true }).click();
    await slide(pc, PC[10]);
    await ticked(page, 'fig-10-1b:ultra');
  });
});

test.describe('questions', () => {
  test("numeric: Newton's ½mv² is caught and tagged; (γ − 1)mc² is right", async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-10.1-electron-kinetic"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('0.1635');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page))?.attempts?.at(-1))
      .toMatchObject({ qid: 'Q-10.1-electron-kinetic', correct: false, misconception: 'MC-10-classical-ke' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('0.341');
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
