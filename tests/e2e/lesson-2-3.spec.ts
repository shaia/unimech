import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/2-3/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** Move a slider to its left end. */
const toMin = (slider: Locator) =>
  slider.evaluate((el: HTMLInputElement) => {
    el.value = el.min;
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

test.describe('lesson 2.3: weight, normal force, tension and springs', () => {
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

  test('the three figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    const canvases = page.locator('.sim-stage canvas');
    expect(await canvases.count()).toBe(3);
    for (let i = 0; i < 3; i++) {
      const c = canvases.nth(i);
      await c.scrollIntoViewIfNeeded();
      await expect(c).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(c)).toBeGreaterThan(200);
    }
  });

  test('the elevator: N = m(g + a), from 588 N at rest to zero in free fall; the tasks tick', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-3a');
    const slider = fig.locator('input[type=range]').first();
    await expect(fig.locator('[data-readout="N"]')).toContainText('N = 588 N');
    await setSlider(slider, 1.5);
    await expect(fig.locator('[data-readout="N"]')).toContainText('N = 678 N');
    expect(await task(page, 'fig-2-3a:elev-heavy')).toBeTruthy();
    await setSlider(slider, -1.5);
    await expect(fig.locator('[data-readout="N"]')).toContainText('N = 498 N');
    expect(await task(page, 'fig-2-3a:elev-light')).toBeTruthy();
    await toMin(slider);
    await expect(fig.locator('[data-readout="N"]')).toContainText('N = 0 N');
    expect(await task(page, 'fig-2-3a:elev-free')).toBeTruthy();
  });

  // the hump and slope steps put their own scene in figure 2.3א (.scratch/ch2/2-3/review.ts, tension.ts)
  const stepScene = async (page: Page, text: string) => {
    await page.goto(LESSON);
    const fig = page.locator('#fig-2-3a');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.locator('astro-island:not([ssr])')).toHaveCount(1);
    await page.locator('.step', { hasText: text }).click();
    return fig;
  };

  test('the hump step shows the car: N = m(g − v²/R) = 4240 N at 15 m/s, zero above √(gR)', async ({ page }) => {
    const fig = await stepScene(page, 'מכונית בפסגה של גבעה');
    await expect(fig.locator('[data-readout="N"]')).toContainText('N = 4240 N');
    await freezeSteps(page);
    await setSlider(fig.locator('input[type=range]').first(), 25);
    await expect(fig.locator('[data-readout="N"]')).toContainText('N = 0 N');
  });

  test('the slope step shows N = mg cos θ = 33.9 N without a push, 43.9 N with a 20 N horizontal push', async ({ page }) => {
    const fig = await stepScene(page, 'הגדילו את הדחיפה האופקית');
    await expect(fig.locator('[data-readout="N"]')).toContainText('N = 33.9 N');
    await freezeSteps(page);
    await setSlider(fig.locator('input[type=range]').nth(1), 20);
    await expect(fig.locator('[data-readout="N"]')).toContainText('N = 43.9 N');
  });

  test('springs: Δx = mg/k doubles with the mass, doubles in series and halves in parallel', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-3b');
    await expect(fig.locator('[data-readout="x"]')).toContainText('Δx = 2.94 cm');
    await setSlider(fig.locator('input[type=range]').first(), 0.6);
    await expect(fig.locator('[data-readout="x"]')).toContainText('Δx = 5.88 cm');
    expect(await task(page, 'fig-2-3b:spring-double')).toBeTruthy();
    await setSlider(fig.locator('input[type=range]').first(), 0.3);
    await fig.getByRole('button', { name: 'שניים בטור', exact: true }).click();
    await expect(fig.locator('[data-readout="k"]')).toContainText('k = 50 N/m');
    await expect(fig.locator('[data-readout="x"]')).toContainText('Δx = 5.88 cm');
    expect(await task(page, 'fig-2-3b:spring-series')).toBeTruthy();
    await fig.getByRole('button', { name: 'שניים במקביל', exact: true }).click();
    await expect(fig.locator('[data-readout="x"]')).toContainText('Δx = 1.47 cm');
    expect(await task(page, 'fig-2-3b:spring-parallel')).toBeTruthy();
  });

  test('tension: one T over the pulley, λg(L − y) down a hanging rope, T = F along a massless rope', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-3c');
    await expect(fig.locator('[data-readout="T"]')).toContainText('T = 23.5 N');
    await setSlider(fig.locator('input[type=range]').first(), 2);
    await expect(fig.locator('[data-readout="T"]')).toContainText('T = 19.6 N');
    await expect(fig.locator('[data-readout="a"]')).toContainText('a = 0 m/s²');
    expect(await task(page, 'fig-2-3c:atwood-equal')).toBeTruthy();

    await fig.getByRole('button', { name: 'חבל תלוי', exact: true }).click();
    await expect(fig.locator('[data-readout="Ttop"]')).toContainText('T(0) = 9.8 N');
    await expect(fig.locator('[data-readout="Tbottom"]')).toContainText('T(L) = 0 N');
    await setSlider(fig.locator('input[type=range]').first(), 1);
    await expect(fig.locator('[data-readout="T"]')).toContainText('T(y) = 4.9 N');
    expect(await task(page, 'fig-2-3c:hang-mid')).toBeTruthy();

    await fig.getByRole('button', { name: 'חבל שמושך גוש', exact: true }).click();
    await expect(fig.locator('[data-readout="a"]')).toContainText('a = 4 m/s²');
    await expect(fig.locator('[data-readout="Tblock"]')).toContainText('T(0) = 8 N');
    await setSlider(fig.locator('input[type=range]').nth(1), 0);
    await expect(fig.locator('[data-readout="a"]')).toContainText('a = 6 m/s²');
    await expect(fig.locator('[data-readout="T"]')).toContainText('T(s) = 12 N');
    expect(await task(page, 'fig-2-3c:pull-massless')).toBeTruthy();

    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
