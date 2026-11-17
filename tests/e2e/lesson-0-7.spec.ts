import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/0-7/';

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

test.describe('lesson 0.7: polar, cylindrical and spherical coordinates; the gradient', () => {
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

  test('the four figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(4);
    for (let i = 0; i < 4; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('polar: at θ = 180° θ̂ points straight down; moving along a ray leaves r̂ and θ̂ alone', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-7a');
    const sliders = fig.locator('input[type=range]');
    await setSlider(sliders.nth(1), 180);
    await expect(fig.locator('[data-readout="xy"]')).toContainText('x = −1.5 m, y = 0 m');
    await expect(fig.locator('[data-readout="thetahat"]')).toContainText('θ̂ = (0, −1)');
    await expect.poll(() => task(page, 'fig-0-7a:theta-down')).toBeTruthy();
    await setSlider(sliders.nth(0), 0.5);
    await expect(fig.locator('[data-readout="rhat"]')).toContainText('r̂ = (−1, 0)');
    await setSlider(sliders.nth(0), 1.5);
    await expect(fig.locator('[data-readout="rhat"]')).toContainText('r̂ = (−1, 0)');
    await expect.poll(() => task(page, 'fig-0-7a:ray')).toBeTruthy();
  });

  test('area element: twice as far, twice the patch; small steps make the patch r dr dθ', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-7b');
    const sliders = fig.locator('input[type=range]');
    await expect(fig.locator('[data-readout="element"]')).toContainText('r dr dθ = 0.09 m²');
    await setSlider(sliders.nth(0), 2.0);
    await expect(fig.locator('[data-readout="element"]')).toContainText('r dr dθ = 0.18 m²');
    await expect.poll(() => task(page, 'fig-0-7b:double-r')).toBeTruthy();
    await setSlider(sliders.nth(2), 0.05);
    await setSlider(sliders.nth(3), 0.05);
    // exact / element = 1 + dr/(2r) = 1.0125
    await expect(fig.locator('[data-readout="ratio"]')).toContainText(/1\.0[12]/);
    await expect.poll(() => task(page, 'fig-0-7b:shrink')).toBeTruthy();
  });

  test('spherical element: the r sin θ dφ edge shrinks at the pole, and doubling r quadruples the element', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-7c');
    await fig.getByRole('button', { name: 'כדוריות', exact: true }).click();
    const sliders = fig.locator('input[type=range]');
    // r = 1 m, θ = 55°, dr = dθ = dφ = 0.3: r² sin θ dr dθ dφ = 0.0221 m³
    await expect(fig.locator('[data-readout="dV"]')).toContainText('0.0221 m³');
    await setSlider(sliders.nth(0), 2.0);
    await expect(fig.locator('[data-readout="dV"]')).toContainText('0.0885 m³');
    await expect.poll(() => task(page, 'fig-0-7c:far-r')).toBeTruthy();
    await setSlider(sliders.nth(1), 10);
    // r sin θ dφ = 2 · sin 10° · 0.3 = 0.104 m
    await expect(fig.locator('[data-readout="edges"]')).toContainText('r sin θ dφ = 0.104 m');
    await expect.poll(() => task(page, 'fig-0-7c:pole')).toBeTruthy();
  });

  test('gradient: df/ds is largest along ∇f, zero along the level curve; on the hill ∇h misses the top', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-7d');
    await expect(fig.locator('[data-readout="grad"]')).toContainText('∇f = (0.2, 0.1) m/m');
    await fig.getByRole('button', { name: /^ŝ ו-\s?df\/ds$/ }).click();
    const turn = fig.locator('input[type=range]').first();
    // ∇f points at atan(0.1/0.2) = 26.6°
    await setSlider(turn, 27);
    await expect(fig.locator('[data-readout="dfds"]')).toContainText('df/ds = 0.224 m/m');
    await expect.poll(() => task(page, 'fig-0-7d:max-dir')).toBeTruthy();
    await setSlider(turn, 117);
    await expect.poll(() => task(page, 'fig-0-7d:level-dir')).toBeTruthy();

    // drag P (by keyboard) more than 1 m with the level curve shown: the angle stays 90°
    const canvas = fig.locator('canvas');
    await canvas.focus();
    for (let i = 0; i < 12; i++) await canvas.press('ArrowRight');
    await expect(fig.locator('[data-readout="perp"]')).toContainText('90°');
    await expect.poll(() => task(page, 'fig-0-7d:perp')).toBeTruthy();

    await fig.getByRole('button', { name: 'גבעה מוארכת', exact: true }).click();
    await fig.getByRole('button', { name: 'הכיוון אל הפסגה', exact: true }).click();
    await canvas.focus();
    await canvas.press('ArrowUp');
    await expect.poll(() => task(page, 'fig-0-7d:not-summit')).toBeTruthy();

    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
