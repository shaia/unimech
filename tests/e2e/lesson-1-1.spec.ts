import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/1-1/';

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

  test('ellipse: at the end of the long axis d|r|/dt = 0 while the speed is Bω = 2 m/s', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-1a');
    await setSlider(fig.locator('input[type=range]').first(), 0);
    await expect(fig.locator('[data-readout="speed"]')).toContainText('2.00 m/s');
    await expect(fig.locator('[data-readout="dist-rate"]')).toContainText('0.00 m/s');
    expect((await progress(page)).tasks['fig-1-1a:ellipse-end']).toBeTruthy();
    await noSideways(page);
  });

  test('circle about O: constant speed 2.4 m/s, yet |a| = Rω² = 1.92 m/s²', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-1a');
    await fig.getByRole('button', { name: 'מעגל סביב O' }).click();
    await fig.getByRole('button', { name: 'תאוצה', exact: true }).click();
    await expect(fig.locator('[data-readout="speed"]')).toContainText('2.40 m/s');
    await expect(fig.locator('[data-readout="accel"]')).toContainText('1.92 m/s²');
    await expect(fig.locator('[data-readout="speed-rate"]')).toContainText('0.00 m/s²');
    expect((await progress(page)).tasks['fig-1-1a:circle-accel']).toBeTruthy();
  });

  test('rolling wheel: at the touch of the ground v = 0 and |a| = Rω² = 1 m/s²', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-1a');
    await fig.getByRole('button', { name: 'נקודה על גלגל מתגלגל' }).click();
    await fig.getByRole('button', { name: 'תאוצה', exact: true }).click();
    await setSlider(fig.locator('input[type=range]').first(), 0);
    await expect(fig.locator('[data-readout="speed"]')).toContainText('0.00 m/s');
    await expect(fig.locator('[data-readout="accel"]')).toContainText('1.00 m/s²');
    expect((await progress(page)).tasks['fig-1-1a:cusp']).toBeTruthy();
    await fig.getByRole('button', { name: 'מסלול קצה המהירות' }).click();
    await noSideways(page);
  });

  test('rotating acceleration: v(0) = (0, −2) m/s closes the path into a circle; another v(0) keeps a(t)', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-1b');
    const ranges = fig.locator('input[type=range]');
    await expect(fig.locator('[data-readout="drift"]')).toContainText('(0.50, 0.00)');
    await setSlider(ranges.nth(1), 0);
    await expect(fig.locator('[data-readout="v0"]')).toContainText('(0.0, −2.0)');
    await expect(fig.locator('[data-readout="drift"]')).toContainText('(0.00, 0.00)');
    expect((await progress(page)).tasks['fig-1-1b:find-circle']).toBeTruthy();
    const aBefore = await fig.locator('[data-readout="a"]').textContent();
    await setSlider(ranges.nth(1), -1.5);
    await expect(fig.locator('[data-readout="a"]')).toHaveText(aBefore ?? '');
    expect((await progress(page)).tasks['fig-1-1b:same-a']).toBeTruthy();
    await noSideways(page);
  });
});
