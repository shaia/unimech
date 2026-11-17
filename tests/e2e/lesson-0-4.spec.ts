import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/0-4/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** Move a slider to its right end (the end of the interval, for the upper-limit slider). */
const toEnd = (slider: Locator) =>
  slider.evaluate((el: HTMLInputElement) => {
    el.value = el.max;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

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

test.describe('lesson 0.4: integrals as accumulation', () => {
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

  test('the car that backs up: sums converge to the 3 m displacement, the midpoint is exact, the swing returns', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-4a');
    const sliders = fig.locator('input[type=range]');
    // three one-second pieces, each at its start: 4 + 2 + 0 = 6 m against the integral, 3 m
    await expect(fig.locator('[data-readout="sum"]')).toContainText('Σ vΔt = 6 m');
    await expect(fig.locator('[data-readout="exact"]')).toContainText('∫v dt = 3 m');
    await expect(fig.locator('[data-readout="distance"]')).toContainText('∫|v| dt = 5 m');

    await setSlider(sliders.first(), 32);
    await expect(fig.locator('[data-readout="sum"]')).toContainText('Σ vΔt = 3.28 m');
    await expect.poll(() => task(page, 'fig-0-4a:refine')).toBeTruthy();

    // a linear velocity: the midpoint rectangle of a single piece is the exact integral
    await fig.getByRole('button', { name: 'באמצע', exact: true }).click();
    await setSlider(sliders.first(), 1);
    await expect(fig.locator('[data-readout="sum"]')).toContainText('Σ vΔt = 3 m');
    await expect.poll(() => task(page, 'fig-0-4a:mid-exact')).toBeTruthy();

    // up to the stop at 2 s the car went 4 m; past it the integral falls
    await setSlider(sliders.nth(1), 2);
    await expect(fig.locator('[data-readout="exact"]')).toContainText('∫v dt = 4 m');
    await setSlider(sliders.nth(1), 2.5);
    await expect(fig.locator('[data-readout="exact"]')).toContainText('∫v dt = 3.75 m');
    await expect.poll(() => task(page, 'fig-0-4a:past-stop')).toBeTruthy();

    // one full period of the oscillation: displacement zero, distance 4A = 2 m
    await fig.getByRole('button', { name: 'תנודה', exact: true }).click();
    await toEnd(sliders.nth(1));
    await expect(fig.locator('[data-readout="exact"]')).toContainText('∫v dt = 0 m');
    await expect(fig.locator('[data-readout="distance"]')).toContainText('∫|v| dt = 2 m');
    await expect.poll(() => task(page, 'fig-0-4a:swing-period')).toBeTruthy();

    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });

  test('the rods: the tapered rod sums to 0.5 kg; its centre of mass is at 0.6 m, the symmetric one at the middle', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-4b');
    await expect(fig.locator('[data-readout="sum"]')).toContainText('Σ λΔx = 0.425 kg');
    await expect(fig.locator('[data-readout="exact"]')).toContainText('M = ∫λ dx = 0.5 kg');
    await setSlider(fig.locator('input[type=range]').first(), 32);
    await expect(fig.locator('[data-readout="sum"]')).toContainText('Σ λΔx = 0.491 kg');
    await expect.poll(() => task(page, 'fig-0-4b:rod-mass')).toBeTruthy();

    await fig.getByRole('button', { name: 'מרכז המסה', exact: true }).click();
    await expect(fig.locator('[data-readout="cm"]')).toContainText('0.6 m (אינטגרל)');
    await fig.getByRole('button', { name: 'מוט עבה באמצע', exact: true }).click();
    await expect(fig.locator('[data-readout="cm"]')).toContainText('0.5 m (אינטגרל)');
    await expect(fig.locator('[data-readout="exact"]')).toContainText('M = ∫λ dx = 0.5 kg');
    await expect.poll(() => task(page, 'fig-0-4b:rod-cm')).toBeTruthy();
  });
});
