import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/5-5/';

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

const task = async (page: Page, id: string) => (await progress(page))?.tasks?.[id];

test.describe('lesson 5.5: coupled oscillators and normal modes', () => {
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
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-5-5a', '#fig-5-5b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('equal bodies: modes (1, 1) at √(k/m) and (1, −1) at √((k + 2k_c)/m); running a chosen mode ticks its task', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-5a');
    // m = 1.0 kg, k = 10 N/m, k_c = 1.0 N/m (.scratch/ch5/5-5/numbers.ts)
    await expect(fig.locator('[data-readout="w1"] b')).toHaveText('ω₁ = 3.16 rad/s, a₂/a₁ = 1');
    await expect(fig.locator('[data-readout="w2"] b')).toHaveText('ω₂ = 3.46 rad/s, a₂/a₁ = −1');
    await expect(fig.locator('[data-readout="ts"] b')).toHaveText('Δω = 0.302 rad/s, π/Δω = 10.4 s');
    // the default start is mode 1, but only the learner's own choice counts
    await fig.getByRole('button', { name: 'מהיר ×4', exact: true }).click();
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await page.waitForTimeout(1200);
    expect(await task(page, 'fig-5-5a:mode1')).toBeFalsy();
    await fig.getByRole('button', { name: 'אופן 1', exact: true }).click();
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await expect.poll(async () => task(page, 'fig-5-5a:mode1'), { timeout: 8000 }).toBeTruthy();
    await fig.getByRole('button', { name: 'אופן 2', exact: true }).click();
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await expect.poll(async () => task(page, 'fig-5-5a:mode2'), { timeout: 8000 }).toBeTruthy();
  });

  test('from body 1 alone the energy reaches body 2 at π/Δω; scrubbing there ticks the transfer task', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-5a');
    const ranges = fig.locator('input[type=range]'); // k_c, m₂, time
    await fig.getByRole('button', { name: 'רק גוף 1', exact: true }).click();
    await slide(ranges.nth(2), 5);
    expect(await task(page, 'fig-5-5a:transfer')).toBeFalsy();
    await slide(ranges.nth(2), 10.5);
    // at 10.5 s body 1 holds 0.19 % and body 2 99.3 % (.scratch/ch5/5-5/e2e-check.ts)
    await expect(fig.locator('[data-readout="energy"] b')).toHaveText('E₁/E = 0%, E₂/E = 99%');
    await expect.poll(async () => task(page, 'fig-5-5a:transfer')).toBeTruthy();
  });

  test('unequal bodies: modes are no longer (1, ±1) and the transfer is partial; a full beat ticks the detune task', async ({ page }) => {
    const fig = await openFigure(page, 'fig-5-5b');
    const ranges = fig.locator('input[type=range]');
    await slide(ranges.nth(0), 0.5);
    await slide(ranges.nth(1), 1.2);
    // m₂ = 1.2 kg, k_c = 0.5 N/m (.scratch/ch5/5-5/numbers.ts)
    await expect(fig.locator('[data-readout="w1"] b')).toHaveText('ω₁ = 2.94 rad/s, a₂/a₁ = 3.72');
    await expect(fig.locator('[data-readout="w2"] b')).toHaveText('ω₂ = 3.26 rad/s, a₂/a₁ = −0.224');
    await slide(ranges.nth(2), 20.5);
    await expect.poll(async () => task(page, 'fig-5-5b:detune')).toBeTruthy();
  });

  test('check: "each body has its own frequency" is tagged, then the in-phase answer is accepted', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-5.5-in-phase-mode"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    await q.getByRole('radio', { name: /כל גוף מתנודד בתדירות משלו/ }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    expect((await progress(page)).attempts.at(-1)).toMatchObject({
      qid: 'Q-5.5-in-phase-mode',
      misconception: 'MC-5-modes-each-mass-own-frequency',
    });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await q.getByRole('radio', { name: /לא נמתח בכלל/ }).click();
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });
});
