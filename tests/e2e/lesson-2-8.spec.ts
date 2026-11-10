import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/2-8/';

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

const noSideways = async (page: Page) => {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sw).toBeLessThanOrEqual(0);
};

test.describe('live figures', () => {
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

  test('ramp F = 3.0t on 2.0 kg: at t = 2.0 s the speed is 3.0 m/s, half of a(2)·t', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-8a');
    await setSlider(fig.locator('input[type=range]').first(), 2);
    await expect(fig.locator('[data-readout="F"]')).toContainText('6.00 N');
    await expect(fig.locator('[data-readout="v"]')).toContainText('3.00 m/s');
    await expect(fig.locator('[data-readout="x"]')).toContainText('2.00 m');
    expect((await progress(page)).tasks['fig-2-8a:ramp-two']).toBeTruthy();
    await noSideways(page);
  });

  test('F₀cos ωt from rest: the body turns back at 2F₀/(mω²) = 1.0 m; F₀sin ωt: it drifts to 2π m in two periods', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-8a');
    await fig.getByRole('button', { name: 'קוסינוס' }).click();
    const time = fig.locator('input[type=range]').first();
    await setSlider(time, Math.PI / 2);
    await expect(fig.locator('[data-readout="x"]')).toContainText('1.00 m');
    expect((await progress(page)).tasks['fig-2-8a:cos-max']).toBeTruthy();
    await fig.getByRole('button', { name: 'סינוס', exact: true }).click();
    await setSlider(time, 2 * Math.PI);
    await expect(fig.locator('[data-readout="x"]')).toContainText('6.28 m');
    expect((await progress(page)).tasks['fig-2-8a:sin-drift']).toBeTruthy();
  });

  test('spring: at x = 0.20 m the chain rule and the time steps give the same speed', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-8b');
    // x = 0.40 cos 5t reaches 0.20 m at t = 0.209 s
    await setSlider(fig.locator('input[type=range]').first(), 0.2094);
    await expect(fig.locator('[data-readout="x"]')).toContainText('0.20 m');
    const chain = (await fig.locator('[data-readout="v-chain"] b').textContent()) ?? '';
    const rk4 = (await fig.locator('[data-readout="v-rk4"] b').textContent()) ?? '';
    expect(chain).toContain('1.7');
    expect(chain).toBe(rk4);
    expect((await progress(page)).tasks['fig-2-8b:spring-half']).toBeTruthy();
    await noSideways(page);
  });

  test('fall from 3R_E: 9.13 km/s at the surface, 5.27 km/s under the constant start force', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-8b');
    await fig.getByRole('button', { name: 'נפילה לכדור הארץ' }).click();
    await fig.getByRole('button', { name: 'כוח קבוע F(x₀)' }).click();
    const time = fig.locator('input[type=range]').first();
    const max = Number(await time.getAttribute('max'));
    await setSlider(time, max);
    await expect(fig.locator('[data-readout="x"]')).toContainText('1.00 R_E');
    await expect(fig.locator('[data-readout="v-chain"]')).toContainText('9.13 km/s');
    await expect(fig.locator('[data-readout="ghost"]')).toContainText('5.27 km/s');
    expect((await progress(page)).tasks['fig-2-8b:gravity-ghost']).toBeTruthy();
    await noSideways(page);
  });
});
