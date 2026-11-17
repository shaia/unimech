import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/0-6/';

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

/** Press a key n times on the figure's canvas (the keyboard moves the selected point by half a unit). */
async function press(canvas: Locator, key: string, n: number) {
  await canvas.focus();
  for (let i = 0; i < n; i++) await canvas.press(key);
}

const task = async (page: Page, id: string) => (await progress(page))?.tasks?.[id];

test.describe('lesson 0.6: complex numbers', () => {
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

  test('polar form: −3 + 1.5i is at 153°, not at the calculator’s −26.6°; the conjugate mirrors it', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-6a');
    await expect(fig.locator('[data-readout="z"]')).toContainText('z = 2 + 1.5i');
    await expect(fig.locator('[data-readout="mod"]')).toContainText('|z| = 2.5');
    await expect(fig.locator('[data-readout="arg"]')).toContainText('36.9°');
    const canvas = fig.locator('.sim-stage canvas');
    await press(canvas, 'ArrowLeft', 10);
    await expect(fig.locator('[data-readout="z"]')).toContainText('z = −3 + 1.5i');
    await expect(fig.locator('[data-readout="arg"]')).toContainText('2.68 rad = 153°');
    await expect(fig.locator('[data-readout="atan"]')).toContainText('−26.6°');
    await expect.poll(() => task(page, 'fig-0-6a:second-quadrant')).toBeTruthy();
    await fig.getByRole('button', { name: 'צמוד', exact: true }).click();
    await expect(fig.locator('[data-readout="conj"]')).toContainText('z̄ = −3 − 1.5i');
    await expect(fig.locator('[data-readout="conj"]')).toContainText('zz̄ = 11.3');
    await expect.poll(() => task(page, 'fig-0-6a:conjugate')).toBeTruthy();
  });

  test('multiplication: lengths multiply and angles add; w = i turns z a quarter turn; z·z̄ is real', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-6a');
    await fig.getByRole('button', { name: 'כפל', exact: true }).click();
    // z = 2 + 1.5i, w = 1 + i
    await expect(fig.locator('[data-readout="zw"]')).toContainText('= 0.5 + 3.5i');
    await expect(fig.locator('[data-readout="mods"]')).toContainText('2.5·1.41 = 3.54');
    await fig.getByRole('button', { name: 'w = i', exact: true }).click();
    await expect(fig.locator('[data-readout="zw"]')).toContainText('= −1.5 + 2i');
    await expect.poll(() => task(page, 'fig-0-6a:times-i')).toBeTruthy();
    await fig.getByRole('button', { name: 'w = z̄', exact: true }).click();
    await expect(fig.locator('[data-readout="zw"]')).toContainText('= 6.25');
    await expect.poll(() => task(page, 'fig-0-6a:real-product')).toBeTruthy();
  });

  test('an oscillation as Re(Ãe^(iωt)): a purely imaginary Ã starts at x = 0; the velocity arrow is on', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-6b');
    await expect(fig.locator('[data-readout="amp"]')).toContainText('Ã = 2');
    await expect(fig.locator('[data-readout="x"]')).toContainText('x(t) = 2 cos(t + 0)');
    await fig.getByRole('button', { name: 'מהירות', exact: true }).click();
    await expect.poll(() => task(page, 'fig-0-6b:velocity')).toBeTruthy();
    const canvas = fig.locator('.sim-stage canvas');
    await press(canvas, 'ArrowLeft', 4);
    await press(canvas, 'ArrowUp', 2);
    await expect(fig.locator('[data-readout="amp"]')).toContainText('Ã = i');
    await expect(fig.locator('[data-readout="x"]')).toContainText('x(t) = 1 cos(t + 1.57)');
    await expect.poll(() => task(page, 'fig-0-6b:start-zero')).toBeTruthy();
  });

  test('adding two oscillations of one frequency: equal and opposite cancel, a quarter period apart gives √2', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-6b');
    await fig.getByRole('button', { name: 'חיבור תנודות', exact: true }).click();
    // A₁ = 2, A₂ = 1.5, Δφ = 120°
    await expect(fig.locator('[data-readout="sum"]')).toContainText('|Ã₁ + Ã₂| = 1.8');
    const sliders = fig.locator('input[type=range]');
    await setSlider(sliders.nth(1), 2);
    await setSlider(sliders.nth(2), 180);
    await expect(fig.locator('[data-readout="sum"]')).toContainText('|Ã₁ + Ã₂| = 0');
    await expect.poll(() => task(page, 'fig-0-6b:cancel')).toBeTruthy();
    await setSlider(sliders.nth(2), 90);
    await expect(fig.locator('[data-readout="sum"]')).toContainText('|Ã₁ + Ã₂| = 2.83');
    await expect.poll(() => task(page, 'fig-0-6b:quarter')).toBeTruthy();

    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
