import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/0-3/';

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

test.describe('lesson 0.3: derivatives and approximations', () => {
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

  test('the secant: its slope 10.2 − 4.9h approaches ẏ = 10.2 m/s from both sides; the tangent is flat at the top', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-3a');
    const [t0, h] = [fig.locator('input[type=range]').nth(0), fig.locator('input[type=range]').nth(1)];
    await expect(fig.locator('[data-readout="secant"]')).toContainText('Δy/Δt = 5.3 m/s');
    await expect(fig.locator('[data-readout="tangent"]')).toContainText('ẏ(t₀) = 10.2 m/s');
    await setSlider(h, 0.01);
    await expect(fig.locator('[data-readout="secant"]')).toContainText('Δy/Δt = 10.15 m/s');
    await expect.poll(() => task(page, 'fig-0-3a:shrink-h')).toBeTruthy();
    await setSlider(h, -1);
    await expect(fig.locator('[data-readout="secant"]')).toContainText('Δy/Δt = 15.1 m/s');
    await expect.poll(() => task(page, 'fig-0-3a:from-left')).toBeTruthy();
    await setSlider(h, 0);
    await expect(fig.locator('[data-readout="secant"]')).toContainText('0/0');
    await setSlider(t0, 2.04);
    await expect(fig.locator('[data-readout="tangent"]')).toContainText('ẏ(t₀) = 8·10⁻³ m/s');
    await expect.poll(() => task(page, 'fig-0-3a:top')).toBeTruthy();
  });

  test('Taylor: sin θ ≈ θ holds to 1% within ±0.244 rad; cos to order 2, √(1+x) at x = 1, ln(1+x) about 1', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-3b');
    await expect(fig.locator('[data-readout="band"]')).toContainText('−0.244');
    await expect(fig.locator('[data-readout="band"]')).toContainText('0.244');

    await fig.getByRole('button', { name: 'cos θ', exact: true }).click();
    await fig.getByRole('button', { name: 'סדר 2', exact: true }).click();
    await expect(fig.locator('[data-readout="band"]')).toContainText('0.662');
    const probe = fig.locator('input[type=range]').nth(1);
    await setSlider(probe, 0.66);
    await expect.poll(() => task(page, 'fig-0-3b:cos-one-percent')).toBeTruthy();

    await fig.getByRole('button', { name: '√(1+x)', exact: true }).click();
    await setSlider(fig.locator('input[type=range]').nth(1), 1);
    await fig.getByRole('button', { name: 'סדר 1', exact: true }).click();
    await expect(fig.locator('[data-readout="error"]')).toContainText('6.1%');
    await fig.getByRole('button', { name: 'סדר 3', exact: true }).click();
    await expect(fig.locator('[data-readout="error"]')).toContainText('1.6%');
    await expect.poll(() => task(page, 'fig-0-3b:sqrt-order3')).toBeTruthy();

    await fig.getByRole('button', { name: 'ln(1+x)', exact: true }).click();
    await setSlider(fig.locator('input[type=range]').nth(0), 1);
    await expect(fig.locator('[data-readout="x0"]')).toContainText('x₀ = 1');
    await expect.poll(() => task(page, 'fig-0-3b:ln-x0')).toBeTruthy();

    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
