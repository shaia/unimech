import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/0-5/';

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

test.describe('lesson 0.5: ordinary differential equations', () => {
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

  test('the cooling field: slope −7 °C/min at 90 °C, 45.8 °C after τ; the equilibrium, cold and barrel tasks tick', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-5a');
    const slider = fig.locator('input[type=range]').first();
    const launch = fig.getByRole('button', { name: 'שגרו פתרון מההתחלה' });
    await expect(fig.locator('[data-readout="count"]')).toContainText('0');

    await setSlider(slider, 90);
    await launch.click();
    await expect(fig.locator('[data-readout="ic"]')).toContainText('T(0 min) = 90 °C');
    await expect(fig.locator('[data-readout="slope"]')).toContainText('−7 °C/min');
    await expect(fig.locator('[data-readout="later"]')).toContainText('T = 45.8 °C');

    await setSlider(slider, 60);
    await launch.click();
    await setSlider(slider, 20);
    await launch.click();
    await expect(fig.locator('[data-readout="slope"]')).toContainText('0 °C/min');
    await expect.poll(() => task(page, 'fig-0-5a:equilibrium')).toBeTruthy();
    await expect.poll(() => task(page, 'fig-0-5a:three')).toBeTruthy();

    await setSlider(slider, 10);
    await launch.click();
    await expect(fig.locator('[data-readout="later"]')).toContainText('T = 16.3 °C');
    await expect.poll(() => task(page, 'fig-0-5a:cold')).toBeTruthy();

    // the barrel empties in finite time, 2√h₀/k: 100 s from 1.0 m, 50 s from a quarter of it
    await fig.getByRole('button', { name: 'חבית מתרוקנת', exact: true }).click();
    await setSlider(slider, 1);
    await launch.click();
    await expect(fig.locator('[data-readout="empty"]')).toContainText('t = 100 s');
    expect(await task(page, 'fig-0-5a:tank-four')).toBeFalsy();
    await setSlider(slider, 0.25);
    await launch.click();
    await expect(fig.locator('[data-readout="empty"]')).toContainText('t = 50 s');
    await expect.poll(() => task(page, 'fig-0-5a:tank-four')).toBeTruthy();
  });

  test('the roots: −0.5 ± 2.96i, a double root at γ = 2ω₀, ±3i without damping, one crossing when v₀ < s₂x₀', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-5b');
    const [gamma, , v0] = [0, 1, 2].map((i) => fig.locator('input[type=range]').nth(i));
    const roots = fig.locator('[data-readout="roots"]');
    await expect(roots).toContainText('s₁ = −0.5 + 2.96i, s₂ = −0.5 − 2.96i');

    await setSlider(gamma, 6);
    await expect(roots).toContainText('s₁ = s₂ = −3');
    await expect.poll(() => task(page, 'fig-0-5b:double')).toBeTruthy();

    await setSlider(gamma, 0);
    await expect(roots).toContainText('s₁ = 3i, s₂ = −3i');
    await expect.poll(() => task(page, 'fig-0-5b:no-damping')).toBeTruthy();

    // γ = 10, ω₀ = 3: s = −1 and −9; with x₀ = 0.10 m the body crosses x = 0 only if v₀ < −0.9 m/s
    await setSlider(gamma, 10);
    await expect(roots).toContainText('s₁ = −1, s₂ = −9');
    await expect(fig.locator('[data-readout="crossings"]')).toContainText(': 0');
    expect(await task(page, 'fig-0-5b:over-cross')).toBeFalsy();
    await setSlider(v0, -2);
    await expect(fig.locator('[data-readout="crossings"]')).toContainText(': 1');
    await expect.poll(() => task(page, 'fig-0-5b:over-cross')).toBeTruthy();

    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
