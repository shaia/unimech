import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/0-2/';

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

/** Press a key on the figure's canvas `n` times (Space selects the next vector, arrows move its tip one square). */
async function press(fig: Locator, key: string, n = 1) {
  const canvas = fig.locator('.sim-stage canvas');
  await canvas.focus();
  for (let i = 0; i < n; i++) await canvas.press(key);
}

const task = async (page: Page, id: string) => (await progress(page))?.tasks?.[id];

test.describe('lesson 0.2: vectors', () => {
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

  test('sum on a grid: (4, 1) + (−1, 3) = (3, 4), 5 N; a 3-4-5 vector, B along A, and B = −A cancel', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-2a');
    await expect(fig.locator('[data-readout="sum"]')).toContainText('A+B = (3, 4) N');
    await expect(fig.locator('[data-readout="sum-mag"]')).toContainText('|A+B| = 5 N');
    // A: (4, 1) → (3, 4)
    await press(fig, 'ArrowLeft');
    await press(fig, 'ArrowUp', 3);
    await expect(fig.locator('[data-readout="a"]')).toContainText('A = (3, 4) N');
    await expect(fig.locator('[data-readout="a-mag"]')).toContainText('|A| = 5 N');
    await expect.poll(() => task(page, 'fig-0-2a:make-3-4')).toBeTruthy();
    // B: (−1, 3) → (3, 4), along A: the magnitudes add
    await press(fig, 'Space');
    await press(fig, 'ArrowRight', 4);
    await press(fig, 'ArrowUp');
    await expect(fig.locator('[data-readout="sum-mag"]')).toContainText('|A+B| = 10 N');
    await expect.poll(() => task(page, 'fig-0-2a:same-line')).toBeTruthy();
    // B: (3, 4) → (−3, −4) = −A
    await press(fig, 'ArrowLeft', 6);
    await press(fig, 'ArrowDown', 8);
    await expect(fig.locator('[data-readout="sum"]')).toContainText('A+B = (0, 0) N');
    await expect.poll(() => task(page, 'fig-0-2a:cancel')).toBeTruthy();
    // the difference A − B, from B's tip to A's tip
    await fig.getByRole('button', { name: 'A−B' }).click();
    await expect(fig.locator('[data-readout="diff"]')).toContainText('A−B = (6, 8) N');
  });

  test('the dot product: F·d = 2·4 + 3·1 = 11 J, the projection 2.67 N; obtuse is negative, perpendicular is zero', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-2b');
    await expect(fig.locator('[data-readout="dot"]')).toContainText('= 11 J');
    await expect(fig.locator('[data-readout="dot-cos"]')).toContainText('= 11 J');
    await expect(fig.locator('[data-readout="proj"]')).toContainText('F∥ = 2.67 N');
    await expect(fig.locator('[data-readout="theta"]')).toContainText('θ = 42°');
    // select d (Space selects F first, then d) and turn it past 90°: (4, 1) → (−4, 1)
    await press(fig, 'Space', 2);
    await press(fig, 'ArrowLeft', 8);
    await expect(fig.locator('[data-readout="dot"]')).toContainText('= −5 J');
    await expect.poll(() => task(page, 'fig-0-2b:dot-obtuse')).toBeTruthy();
    // (−4, 1) → (−3, 2), perpendicular to F = (2, 3)
    await press(fig, 'ArrowRight');
    await press(fig, 'ArrowUp');
    await expect(fig.locator('[data-readout="dot"]')).toContainText('= 0 J');
    await expect(fig.locator('[data-readout="theta"]')).toContainText('θ = 90°');
    await expect.poll(() => task(page, 'fig-0-2b:dot-zero-tilted')).toBeTruthy();
  });

  test('out of and into the page: looking straight at the page shows ⊙ and ⊗', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-2c');
    await setSlider(fig.locator('input[type=range]').first(), 90);
    await expect(fig).toContainText('מבט ישר על הדף');
    // DepthArrow marks its tasks in an effect after the render: wait for the store
    await expect.poll(() => task(page, 'fig-0-2c:see-out')).toBeTruthy();
    await fig.getByRole('button', { name: '⊗ לתוך הדף' }).click();
    await expect.poll(() => task(page, 'fig-0-2c:see-in')).toBeTruthy();
  });

  test('the cross product: (r×F)z = 3·3 − 1·1 = 8 N·m out of the page; the order flips it; parallel gives zero', async ({ page }) => {
    const fig = await openFigure(page, 'fig-0-2d');
    await expect(fig.locator('[data-readout="cross"]')).toContainText('= 8 N·m');
    await expect(fig.locator('[data-readout="cross-sin"]')).toContainText('= 8 N·m');
    await expect(fig.locator('[data-readout="cross-dir"]')).toContainText('החוצה מהדף');
    await fig.getByRole('button', { name: /סדר הפוך/ }).click();
    await expect(fig.locator('[data-readout="cross"]')).toContainText('(F×r)z');
    await expect(fig.locator('[data-readout="cross"]')).toContainText('= −8 N·m');
    await expect(fig.locator('[data-readout="cross-dir"]')).toContainText('לתוך הדף');
    await expect.poll(() => task(page, 'fig-0-2d:cross-swap')).toBeTruthy();
    await fig.getByRole('button', { name: /סדר הפוך/ }).click();
    // F: (1, 3) → (1, −3): the turn from r to F is now clockwise
    await press(fig, 'Space', 2);
    await press(fig, 'ArrowDown', 6);
    await expect(fig.locator('[data-readout="cross"]')).toContainText('= −10 N·m');
    await expect.poll(() => task(page, 'fig-0-2d:cross-into')).toBeTruthy();
    // F: (1, −3) → (3, 1), along r
    await press(fig, 'ArrowRight', 2);
    await press(fig, 'ArrowUp', 4);
    await expect(fig.locator('[data-readout="cross-dir"]')).toContainText('אפס');
    await expect.poll(() => task(page, 'fig-0-2d:cross-parallel')).toBeTruthy();

    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
