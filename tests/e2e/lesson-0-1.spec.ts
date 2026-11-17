import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/0-1/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

async function openFigure(page: Page, id: string) {
  await page.goto(LESSON);
  const fig = page.locator(`#${id}`);
  await fig.scrollIntoViewIfNeeded();
  await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
  await freezeSteps(page);
  // a text step may have changed the figure before the freeze: start from its own state
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const task = async (page: Page, id: string) => (await progress(page))?.tasks?.[id];

/** Set the exponent sliders of the dimension figure, in the order of the problem's variables. */
async function setExps(fig: Locator, exps: number[]) {
  const sliders = fig.locator('input[type=range]');
  await expect(sliders).toHaveCount(exps.length);
  for (let i = 0; i < exps.length; i++) await setSlider(sliders.nth(i), exps[i]);
}

test.describe('lesson 0.1: units, dimensions and orders of magnitude', () => {
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

  test('the two figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(2);
    for (let i = 0; i < 2; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('the pendulum balances only at m⁰ L^½ g^−½, and the other problems tick their tasks', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-1a');
    const status = fig.locator('[data-readout="status"]');
    await expect(status).toContainText('לא מאוזן');

    // the pendulum: a nonzero mass exponent can never balance the mass row
    await setExps(fig, [1, 0.5, -0.5]);
    await expect(status).toContainText('לא מאוזן');
    expect(await task(page, 'fig-0-1a:pendulum-balance')).toBeFalsy();
    await setExps(fig, [0, 0.5, -0.5]);
    await expect(status).toContainText('מאוזן: הביטוי הוא זמן');
    await expect(fig.locator('[data-readout="dims"]')).toContainText('M0 L0 T1');
    await expect.poll(() => task(page, 'fig-0-1a:pendulum-balance')).toBeTruthy();

    // the spring: T ∝ √(m/k), the amplitude A drops out
    await fig.getByRole('button', { name: 'מסה על קפיץ', exact: true }).click();
    await setExps(fig, [0.5, -0.5, 0]);
    await expect(status).toContainText('מאוזן: הביטוי הוא זמן');
    await expect.poll(() => task(page, 'fig-0-1a:spring-balance')).toBeTruthy();

    // the orbit: Kepler's third law, T ∝ r^{3/2}/√(GM)
    await fig.getByRole('button', { name: 'מסלול מעגלי', exact: true }).click();
    await setExps(fig, [-0.5, -0.5, 1.5]);
    await expect(status).toContainText('מאוזן: הביטוי הוא זמן');
    await expect.poll(() => task(page, 'fig-0-1a:orbit-balance')).toBeTruthy();

    // the amplitude θ₀ is dimensionless: two different powers of it both balance
    await fig.getByRole('button', { name: 'מטוטלת עם אמפליטודה', exact: true }).click();
    await setExps(fig, [0, 0.5, -0.5, 0]);
    await expect(status).toContainText('מאוזן: הביטוי הוא זמן');
    await expect(fig.locator('[data-readout="free"]')).toBeVisible();
    expect(await task(page, 'fig-0-1a:amplitude-two')).toBeFalsy();
    await setSlider(fig.locator('input[type=range]').nth(3), 1.5);
    await expect(status).toContainText('מאוזן: הביטוי הוא זמן');
    await expect.poll(() => task(page, 'fig-0-1a:amplitude-two')).toBeTruthy();
  });

  test('the Earth from water misses its order of magnitude, from rock it does not; the Moon gives 1.46 m/s²', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-1b');
    await expect(fig.locator('[data-readout="estimate"]')).toContainText('?');

    await fig.getByRole('button', { name: /^מים/ }).click();
    await expect(fig.locator('[data-readout="estimate"]')).toContainText('1.08·10²⁴ kg');
    await expect(fig.locator('[data-readout="order"]')).toContainText('סדר גודל אחר');
    expect(await task(page, 'fig-0-1b:earth-order')).toBeFalsy();

    await fig.getByRole('button', { name: /^סלע/ }).click();
    await expect(fig.locator('[data-readout="estimate"]')).toContainText('3.25·10²⁴ kg');
    await expect(fig.locator('[data-readout="order"]')).toContainText('אותו סדר גודל');
    await expect.poll(() => task(page, 'fig-0-1b:earth-order')).toBeTruthy();

    await fig.getByRole('button', { name: 'תאוצת הנפילה על הירח', exact: true }).click();
    await expect(fig.locator('[data-readout="estimate"]')).toContainText('?');
    await fig.getByRole('button', { name: /^סלע/ }).click();
    await expect(fig.locator('[data-readout="estimate"]')).toContainText('1.46 m/s²');
    await expect(fig.locator('[data-readout="reference"]')).toContainText('1.62 m/s²');
    await expect.poll(() => task(page, 'fig-0-1b:moon-order')).toBeTruthy();

    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
