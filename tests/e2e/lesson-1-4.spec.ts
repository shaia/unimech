import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/1-4/';

const setSlider = (slider: Locator, value: number) =>
  slider.evaluate((el: HTMLInputElement, v: number) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** Move a slider to its right end (the end of the run, for the time slider). */
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

test.describe('lesson 1.4: polar coordinates', () => {
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

  test('the bug on the rod: the Coriolis term is 2ṙθ̇ = 3 m/s² and r̈ = 0; the tasks tick', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-4a');
    await expect(fig.locator('[data-readout="r"]')).toContainText('r = 0.2 m');
    for (const name of ['r̈', '−rθ̇²', 'rθ̈', '2ṙθ̇']) await fig.getByRole('button', { name, exact: true }).click();
    await expect(fig.locator('[data-readout="term-coriolis"]')).toContainText('2ṙθ̇ = 3 m/s²');
    await expect(fig.locator('[data-readout="term-radial"]')).toContainText('r̈ = 0 m/s²');
    await expect(fig.locator('[data-readout="term-centripetal"]')).toContainText('−rθ̇² = −1.8 m/s²');
    expect(await task(page, 'fig-1-4a:bug-terms')).toBeTruthy();
    for (const name of ['r̈', '−rθ̇²', 'rθ̈']) await fig.getByRole('button', { name, exact: true }).click();
    expect(await task(page, 'fig-1-4a:bug-sideways')).toBeTruthy();
    await toEnd(fig.locator('input[type=range]').first());
    await expect(fig.locator('[data-readout="r"]')).toContainText('r = 1 m');
    // the Coriolis term does not change as the bug walks out
    await expect(fig.locator('[data-readout="term-coriolis"]')).toContainText('2ṙθ̇ = 3 m/s²');
    expect(await task(page, 'fig-1-4a:bug-far')).toBeTruthy();
  });

  test('the Δr̂ construction: as Δθ shrinks, |Δr̂|/Δθ → 1 and Δr̂ turns perpendicular to r̂', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-4b');
    const delta = fig.locator('[data-readout="delta"]');
    await expect(delta).toBeVisible();
    await setSlider(fig.locator('input[type=range]').nth(1), 0.05);
    await expect(delta).toContainText('|Δr̂|/Δθ = 1');
    await expect(delta).toContainText('91°');
    expect(await task(page, 'fig-1-4b:shrink-delta')).toBeTruthy();
  });

  test('the four terms in action: the straight line has a = 0, the pull spins up, the bead escapes', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-4c');
    await fig.getByRole('button', { name: 'קו ישר', exact: true }).click();
    await expect(fig.locator('[data-readout="accel"]')).toContainText('|a| = 0 m/s²');
    expect(await task(page, 'fig-1-4c:line-zero')).toBeTruthy();

    await fig.getByRole('button', { name: 'משיכה דרך חור', exact: true }).click();
    await expect(fig.locator('[data-readout="thetadot"]')).toContainText('θ̇ = 0.5 rad/s');
    await toEnd(fig.locator('input[type=range]').first());
    // r = 0.4 m and r²θ̇ = 0.5 m²/s, so θ̇ = 0.5/0.16 = 3.125 rad/s, on the rounding edge: floating point
    // shows 3.12 or 3.13; a_θ stays zero
    await expect(fig.locator('[data-readout="r"]')).toContainText('r = 0.4 m');
    await expect(fig.locator('[data-readout="thetadot"]')).toContainText(/θ̇ = 3\.1[23] rad\/s/);
    // the readout writes a<sub>θ</sub>: its text content is "aθ"
    await expect(fig.locator('[data-readout="a"]')).toContainText('aθ = 0 m/s²');
    expect(await task(page, 'fig-1-4c:pull-half')).toBeTruthy();

    await fig.getByRole('button', { name: 'חרוז חופשי על מוט', exact: true }).click();
    await toEnd(fig.locator('input[type=range]').first());
    await expect(fig.locator('[data-readout="r"]')).toContainText('r = 1 m');
    await expect(fig.locator('[data-readout="a"]')).toContainText('ar = 0 m/s²');
    expect(await task(page, 'fig-1-4c:bead-double')).toBeTruthy();

    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
