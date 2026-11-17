import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/10-4/';

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
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-10-4'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-10-4a', '#fig-10-4b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('Compton: Δλ = λ_C at 90°, 2λ_C at 180°, nothing at 0° (.scratch/ch10/10-4/lesson.ts)', async ({ page }) => {
    const fig = await openFigure(page, 'fig-10-4a');
    // E = 0.511 MeV, θ = 90°: λ = λ_C = 2.43 pm, λ′ = 2λ_C, λ′/λ = 2
    await expect(readout(fig, 'dl')).toHaveText('Δλ = 2.43 pm');
    await expect(readout(fig, 'ratio')).toHaveText('λ′/λ = 2');
    const theta = fig.locator('input[type=range]').nth(0);
    await slide(theta, 180);
    await expect(readout(fig, 'dl')).toHaveText('Δλ = 4.85 pm');
    await expect(readout(fig, 'ratio')).toHaveText('λ′/λ = 3');
    await ticked(page, 'fig-10-4a:back');
    await slide(theta, 0);
    await expect(readout(fig, 'dl')).toHaveText('Δλ = 0 pm');
    await expect(readout(fig, 'K')).toHaveText('K = 0 MeV, φ = —');
    await ticked(page, 'fig-10-4a:forward');
  });

  test('Compton: Δλ does not depend on E; a 10 keV photon changes its wavelength by 2% at 90°', async ({ page }) => {
    const fig = await openFigure(page, 'fig-10-4a');
    const energy = fig.locator('input[type=range]').nth(1); // index into 0.010 … 2.00 MeV
    await slide(energy, 7); // 2.00 MeV
    await expect(readout(fig, 'dl')).toHaveText('Δλ = 2.43 pm');
    await expect(readout(fig, 'ratio')).toHaveText('λ′/λ = 4.91');
    await ticked(page, 'fig-10-4a:same-shift');
    await slide(energy, 0); // 0.010 MeV
    await expect(readout(fig, 'E')).toHaveText('E = 0.01 MeV, λ = 124 pm');
    await expect(readout(fig, 'dl')).toHaveText('Δλ = 2.43 pm');
    await expect(readout(fig, 'ratio')).toHaveText('λ′/λ = 1.02');
    await ticked(page, 'fig-10-4a:soft');
  });

  test('binding: the deuteron lacks 2.224 MeV; d + d → ⁴He releases 23.85 MeV; the hydrogen atom 13.6 eV', async ({ page }) => {
    const fig = await openFigure(page, 'fig-10-4b');
    await expect(readout(fig, 'B')).toHaveText('B = Δm·c² = 2.224 MeV');
    await expect(readout(fig, 'per')).toHaveText('B/A = 1.11 MeV');
    await fig.getByRole('button', { name: 'קנה מידה מלא', exact: true }).click();
    await ticked(page, 'fig-10-4b:full');
    await fig.getByRole('button', { name: 'היתוך', exact: true }).click();
    await expect(readout(fig, 'B')).toHaveText('Q = Δm·c² = 23.85 MeV');
    await ticked(page, 'fig-10-4b:fusion');
    await fig.getByRole('button', { name: 'אטום מימן', exact: true }).click();
    await expect(readout(fig, 'B')).toHaveText('B = Δm·c² = 13.6 eV');
    await expect(readout(fig, 'frac')).toHaveText('B/Σmc² = 1.45·10⁻⁸');
    await ticked(page, 'fig-10-4b:atom');
  });
});

test.describe('questions', () => {
  test('numeric: the unshifted wavelength is wrong, 11.2 pm is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-10.4-compton-shift"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('10');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page))?.attempts?.at(-1))
      .toMatchObject({ qid: 'Q-10.4-compton-shift', correct: false });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('11.2');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('a bound system heavier than its parts is caught and tagged', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-10.4-bound-lighter"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.getByRole('radio', { name: 'היא גדולה מסכום המסות שלהם, כי אנרגיית הקשר מוסיפה מסה.', exact: true }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page))?.attempts?.at(-1))
      .toMatchObject({ qid: 'Q-10.4-bound-lighter', correct: false, misconception: 'MC-10-bound-heavier' });
  });

  test('no sideways overflow at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(LESSON);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
