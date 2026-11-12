import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/8-5/';

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

/** Press an arrow key on the figure's canvas n times (each press moves P by 0.1 m). */
async function press(canvas: Locator, key: string, n: number) {
  await canvas.focus();
  for (let i = 0; i < n; i++) await canvas.press(key);
}

const done = (page: Page, key: string) => expect.poll(async () => !!(await progress(page))?.tasks?.[key]).toBe(true);

test.describe('live figures', () => {
  test('scrolling through the text never completes a task', async ({ page }) => {
    await page.goto(LESSON);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
    });
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const p = await progress(page);
    expect(Object.keys(p?.tasks ?? {}).filter((k) => k.startsWith('fig-8-5'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-8-5a', '#fig-8-5b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('the ladder: Στ = 0 about every point, the floor’s forces drop out about the foot, and climbing makes it slip', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-5a');
    const ranges = fig.locator('input[type=range]'); // θ, s, μ_s
    // L 5.0 m, M 15 kg, person 75 kg at 2.0 m, θ 65°, μ_s 0.30 (.scratch/ch8/8-5/lesson.ts): N₂ = f = 171 N, μ_sN₁ = 265 N
    await expect(fig.locator('[data-readout="fneed"]')).toContainText('171');
    await expect(fig.locator('[data-readout="fmax"]')).toContainText('265');
    await expect(fig.locator('[data-readout="sumTau"]')).toContainText('Στ = 0');
    await fig.getByRole('button', { name: /^B:/ }).click();
    await expect(fig.locator('[data-row="N1"] td').nth(3)).toHaveText('0');
    await expect(fig.locator('[data-row="N2"] td').nth(3)).toHaveText('−777');
    await expect(fig.locator('[data-readout="sumTau"]')).toContainText('Στ = 0');
    await done(page, 'fig-8-5a:foot');
    // one metre straight up from the foot: 0.42 m from the ladder, in the air
    await press(fig.locator('canvas'), 'ArrowUp', 10);
    await expect(fig.locator('[data-readout="sumTau"]')).toContainText('Στ = 0');
    await done(page, 'fig-8-5a:off-ladder');
    await slide(ranges.nth(1), 5);
    await expect(fig.locator('[data-readout="state"]')).toContainText('מחליק');
    await expect(fig.locator('[data-readout="fneed"]')).toContainText('377');
    await expect(fig.locator('[data-readout="smax"]')).toContainText('3.36');
    await done(page, 'fig-8-5a:climb-slip');
    await slide(ranges.nth(0), 75);
    await expect(fig.locator('[data-readout="state"]')).toHaveText('הסולם עומד');
    await done(page, 'fig-8-5a:steeper');
  });

  test('a couple has the same torque about every point; one force alone does not; a box past the support tips the plank', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-5b');
    const canvas = fig.locator('canvas');
    // 10 N at each end of a 2.0 m rod: τ = 20 N·m about every point
    await expect(fig.locator('[data-readout="sumTau"]')).toContainText('Στ = 20');
    await press(canvas, 'ArrowUp', 10);
    await expect(fig.locator('[data-readout="sumTau"]')).toContainText('Στ = 20');
    await done(page, 'fig-8-5b:couple-move');
    await fig.getByRole('button', { name: 'רק כוח אחד' }).click();
    await press(canvas, 'ArrowUp', 1);
    // F₂ = 10 N up at (1, 0); P = (0, 1.1): τ = 10 N·m
    await expect(fig.locator('[data-readout="sumTau"]')).toContainText('Στ = 10');
    await done(page, 'fig-8-5b:one-force');
    await fig.getByRole('button', { name: 'קורה על שתי תמיכות' }).click();
    // plank 4.0 m, 30 kg on supports at 0.5 and 2.5 m, 40 kg box at 1.5 m: N₁ = 270 N, N₂ = 417 N
    await expect(fig.locator('[data-row="N1"] td').nth(1)).toHaveText('270');
    await expect(fig.locator('[data-row="N2"] td').nth(1)).toHaveText('417');
    await slide(fig.locator('input[type=range]').first(), 2.7);
    await done(page, 'fig-8-5b:box-over');
    await expect(fig.locator('[data-readout="state"]')).toHaveText('הקורה עומדת');
    await slide(fig.locator('input[type=range]').first(), 3.2);
    await expect(fig.locator('[data-readout="state"]')).toContainText('מתהפכת');
    await done(page, 'fig-8-5b:tip');
  });
});

test('"zero net force means equilibrium" is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-8.5-couple"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'כן, כי הכוח השקול עליו אפס.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect
    .poll(async () => (await progress(page))?.attempts?.at(-1))
    .toMatchObject({ qid: 'Q-8.5-couple', misconception: 'MC-8-net-force-zero-is-equilibrium', confident: true });
});
