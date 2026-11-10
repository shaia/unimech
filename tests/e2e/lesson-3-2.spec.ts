import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/3-2/';

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

/** The screen point of a world point (metres) on the figure's square canvas: the plane spans ±2.2 m. */
async function screenOf(canvas: Locator, x: number, y: number) {
  const b = (await canvas.boundingBox())!;
  const ppm = Math.min(b.width, b.height) / 4.4;
  return { x: b.x + b.width / 2 + x * ppm, y: b.y + b.height / 2 - y * ppm };
}

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

  test('uniform gravity: the work from A to B is −mgΔy = −4.90 J on every path, and zero around the loop', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-2a');
    await expect(fig.locator('[data-readout="W1"]')).toContainText('−4.90 J');
    await expect(fig.locator('[data-readout="W2"]')).toContainText('−4.90 J');
    await setSlider(fig.locator('input[type=range]').first(), -2.2);
    await expect(fig.locator('[data-readout="W2"]')).toContainText('−4.90 J');
    await expect(fig.locator('[data-readout="loop"]')).toContainText('0.00 J');
    expect((await progress(page)).tasks['fig-3-2a:gravity-bulge']).toBeTruthy();
  });

  test('the vortex k(−y, x): path-dependent work, and the loop work is the curl 2k times the enclosed area', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-2a');
    await fig.getByRole('button', { name: 'k(−y, x)' }).click();
    await expect(fig.locator('[data-readout="W1"]')).toContainText('2.97 J');
    await expect(fig.locator('[data-readout="W2"]')).toContainText('−1.94 J');
    await expect(fig.locator('[data-readout="loop"]')).toContainText('4.91 J');
    await expect(fig.locator('[data-readout="curl"]')).toContainText('3.00 N/m');
    await expect(fig.locator('[data-readout="stokes"]')).toContainText('4.91 J');
    // a wider arc: the area is |AB|·bulge/3 = 2.45 m², the loop work 7.36 J
    await setSlider(fig.locator('input[type=range]').first(), 2.4);
    await expect(fig.locator('[data-readout="loop"]')).toContainText('7.36 J');
    expect((await progress(page)).tasks['fig-3-2a:vortex-loop']).toBeTruthy();
    // the S: two lobes of opposite sense cancel, so two different paths agree although the field is not conservative
    await fig.getByRole('button', { name: 'מסלול 2: S' }).click();
    await setSlider(fig.locator('input[type=range]').first(), 1.2);
    await expect(fig.locator('[data-readout="W2"]')).toContainText('2.97 J');
    await expect(fig.locator('[data-readout="loop"]')).toContainText('0.00 J');
    expect((await progress(page)).tasks['fig-3-2a:s-curve']).toBeTruthy();
    await noSideways(page);
  });

  test('the shear k(y, 0): the curl is −k = −2.00 N/m wherever the probe goes', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-2a');
    await fig.getByRole('button', { name: 'k(y, 0)' }).click();
    await expect(fig.locator('[data-readout="loop"]')).toContainText('−3.27 J');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    for (let i = 0; i < 12; i++) await canvas.press('ArrowLeft');
    await expect(fig.locator('[data-readout="curl"]')).toContainText('−2.00 N/m');
    expect((await progress(page)).tasks['fig-3-2a:shear-probe']).toBeTruthy();
  });

  test('level curves: F is perpendicular to them, and B on the level curve of A gets zero work', async ({ page }) => {
    const fig = await openFigure(page, 'fig-3-2b');
    await fig.getByRole('button', { name: 'קפיץ' }).click();
    await expect(fig.locator('[data-readout="W1"]')).toContainText('3.38 J');
    await expect(fig.locator('[data-readout="dropU"]')).toContainText('3.38 J');
    const canvas = fig.locator('canvas');
    await canvas.focus();
    await canvas.press('ArrowDown');
    await expect(fig.locator('[data-readout="angle"]')).toContainText('90.0°');
    expect((await progress(page)).tasks['fig-3-2b:contour-perp']).toBeTruthy();
    // drag B from (1.4, −0.2) to (0, −1.921), on the circle |r| = |A| = 1.921 m
    const from = await screenOf(canvas, 1.4, -0.2);
    const to = await screenOf(canvas, 0, -1.921);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    const w = Number(((await fig.locator('[data-readout="W1"] b').textContent()) ?? '').match(/(−?[\d.]+) J/)![1].replace('−', '-'));
    expect(Math.abs(w)).toBeLessThan(0.15);
    expect((await progress(page)).tasks['fig-3-2b:same-contour']).toBeTruthy();
    await noSideways(page);
  });
});
