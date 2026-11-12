import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/8-8/';

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
const task = (page: Page, key: string) => expect.poll(async () => (await progress(page))?.tasks?.[key]);

test.describe('live figures', () => {
  test('scrolling through the text never completes a task', async ({ page }) => {
    await page.goto(LESSON);
    await page.evaluate(async () => {
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await frame();
      }
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-step]'))) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        await frame();
        el.click();
      }
    });
    await page.waitForTimeout(400);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const p = await progress(page);
    expect(Object.keys(p?.tasks ?? {}).filter((k) => k.startsWith('fig-8-8'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-8-8a', '#fig-8-8b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('tilted dumbbell: L is 55° from ω and the bearings give 0.634 N·m; none on the principal axes; τ ∝ ω²', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-8a');
    const ranges = fig.locator('input[type=range]'); // θ, ω, rotation angle
    // the figure starts with the rod across the axle (θ = 90°, so it does not answer the Predict): L along ω, no torque
    await expect(readout(fig, 'tau')).toHaveText('0 N·m');
    await expect(readout(fig, 'angle')).toHaveText('0°');
    // m = 0.30 kg at r = 0.25 m, θ = 35°, ω = 6.0 rad/s (numbers in .scratch/ch8/8-8/lesson.ts)
    await slide(ranges.nth(0), 35);
    await expect(readout(fig, 'L')).toHaveText('0.129 kg·m²/s');
    await expect(readout(fig, 'angle')).toHaveText('55°');
    await expect(readout(fig, 'tau')).toHaveText('0.634 N·m');
    await expect(readout(fig, 'F')).toHaveText('1.06 N');
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await task(page, 'fig-8-8a:spin-tilted').toBeTruthy();
    await fig.getByRole('button', { name: 'עצירה', exact: true }).click();
    await slide(ranges.nth(0), 90);
    await expect(readout(fig, 'tau')).toHaveText('0 N·m');
    await expect(readout(fig, 'angle')).toHaveText('0°');
    await slide(ranges.nth(0), 0);
    await expect(readout(fig, 'L')).toHaveText('0 kg·m²/s');
    await task(page, 'fig-8-8a:principal').toBeTruthy();
    await slide(ranges.nth(0), 45);
    await expect(readout(fig, 'tau')).toHaveText('0.675 N·m');
    await task(page, 'fig-8-8a:max-torque').toBeTruthy();
    await slide(ranges.nth(0), 35);
    await slide(ranges.nth(1), 3);
    await expect(readout(fig, 'tau')).toHaveText('0.159 N·m');
    await task(page, 'fig-8-8a:omega-half').toBeTruthy();
  });

  test('gyroscope: Ω = Mgd/(I₃ω₃) = 1.80 rad/s, doubles at half the spin, ignores the tilt; the post pushes Mg', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-8b');
    const ranges = fig.locator('input[type=range]'); // ω₃, θ, time
    // disc rotor 0.20 kg, R = 0.035 m, d = 0.045 m, ω₃ = 400 rad/s, θ = 60°
    await expect(readout(fig, 'OmegaFast')).toHaveText('1.8 rad/s');
    await expect(readout(fig, 'Tp')).toHaveText('3.49 s');
    await expect(readout(fig, 'N')).toHaveText('1.96 N');
    await expect(readout(fig, 'Omega')).toHaveText('1.82 rad/s');
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await task(page, 'fig-8-8b:precess').toBeTruthy();
    await fig.getByRole('button', { name: 'עצירה', exact: true }).click();
    await slide(ranges.nth(0), 200);
    await expect(readout(fig, 'OmegaFast')).toHaveText('3.6 rad/s');
    await task(page, 'fig-8-8b:half-spin').toBeTruthy();
    await slide(ranges.nth(1), 80);
    await expect(readout(fig, 'OmegaFast')).toHaveText('3.6 rad/s');
    await task(page, 'fig-8-8b:tilt').toBeTruthy();
    await fig.getByRole('button', { name: 'שחרור בלי נקיפה', exact: true }).click();
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await task(page, 'fig-8-8b:release').toBeTruthy();
    await fig.getByRole('button', { name: 'עצירה', exact: true }).click();
    await slide(ranges.nth(0), 0);
    await expect(readout(fig, 'OmegaFast')).toHaveText('—');
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await task(page, 'fig-8-8b:no-spin').toBeTruthy();
  });

  test('the released gyroscope dips first: at 0.9 s of a 200 rad/s release the axis is below 60° and the post pushes less than Mg', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-8b');
    const ranges = fig.locator('input[type=range]');
    await slide(ranges.nth(0), 200);
    await fig.getByRole('button', { name: 'שחרור בלי נקיפה', exact: true }).click();
    await slide(ranges.nth(2), 0.9);
    await expect(readout(fig, 'theta')).toHaveText('60.6°');
    await expect(readout(fig, 'N')).toHaveText('0.872 N');
  });
});

test.describe('questions', () => {
  test('"a spinning gyroscope weighs less" is caught and tagged; Mg is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-8.8-support-force"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.getByRole('radio', { name: /הסיבוב המהיר נושא חלק מהמשקל/ }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page)).attempts.at(-1))
      .toMatchObject({ qid: 'Q-8.8-support-force', misconception: 'MC-8-gyroscope-defies-gravity', confident: true });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await q.getByRole('radio', { name: /^בדיוק/ }).click();
    await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
    await expect(q).toHaveClass(/is-right/);
  });
});
