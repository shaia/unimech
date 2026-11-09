import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/1-5/';

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

test.describe('lesson 1.5: relative motion and the Galilean transformation', () => {
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

  test('both figures draw, in LTR physics space', async ({ page }) => {
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

  test('the cart toss: v = v′ + V, the same acceleration in both frames, and the ball lands in the hand', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-5a');
    await expect(fig.locator('[data-readout="v"]')).toContainText('v = (3, 5) m/s');
    await expect(fig.locator('[data-readout="vp"]')).toContainText('v′ = (0, 5) m/s');
    await expect(fig.locator('[data-readout="a"]')).toContainText('a = (0, −9.8)');
    await expect(fig.locator('[data-readout="ap"]')).toContainText('a′ = (0, −9.8)');
    await fig.getByRole('button', { name: 'זריקה', exact: true }).click();
    await expect(fig.locator('[data-readout="land"]')).toContainText('הכדור נוחת ביד', { timeout: 10_000 });
    expect(await task(page, 'fig-1-5a:toss-moving')).toBeTruthy();
    // a different cart speed changes the velocities, not the accelerations
    await setSlider(fig.locator('input[type=range]').first(), 1);
    await expect(fig.locator('[data-readout="ap"]')).toContainText('a′ = (0, −9.8)');
  });

  test('throwing backward at the cart speed makes the ball go straight up on the ground', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-5a');
    await setSlider(fig.locator('input[type=range]').nth(1), -3);
    await expect(fig.locator('[data-readout="v"]')).toContainText('v = (0, 5) m/s');
    await expect(fig.locator('[data-readout="vp"]')).toContainText('v′ = (−3, 5) m/s');
    expect(await task(page, 'fig-1-5a:straight-up-ground')).toBeTruthy();
  });

  test('a braking cart: a′ = a − A, and the ball lands 1.04 m ahead of the hand', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-5a');
    await setSlider(fig.locator('input[type=range]').nth(3), -2);
    await expect(fig.locator('[data-readout="ap"]')).toContainText('a′ = (2, −9.8)');
    await expect(fig.locator('[data-readout="a"]')).toContainText('a = (0, −9.8)');
    await fig.getByRole('button', { name: 'זריקה', exact: true }).click();
    await expect(fig.locator('[data-readout="land"]')).toContainText('1.04 m לפני היד', { timeout: 10_000 });
    expect(await task(page, 'fig-1-5a:brake')).toBeTruthy();
  });

  test('the river: the current does not change the crossing time, and 49° upstream lands opposite', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-5b');
    await expect(fig.locator('[data-readout="time"]')).toContainText('30 s');
    await expect(fig.locator('[data-readout="drift"]')).toContainText('45 m במורד הזרם');
    await expect(fig.locator('[data-readout="speed"]')).toContainText('2.5 m/s');
    await setSlider(fig.locator('input[type=range]').nth(1), 1);
    await expect(fig.locator('[data-readout="time"]')).toContainText('30 s');
    await expect(fig.locator('[data-readout="drift"]')).toContainText('30 m במורד הזרם');
    expect(await task(page, 'fig-1-5b:fastest')).toBeTruthy();

    await fig.getByRole('button', { name: 'איפוס' }).click();
    await setSlider(fig.locator('input[type=range]').nth(2), 49);
    await expect(fig.locator('[data-readout="drift"]')).toContainText('מול נקודת היציאה');
    await expect(fig.locator('[data-readout="time"]')).toContainText('45.7 s');
    expect(await task(page, 'fig-1-5b:opposite')).toBeTruthy();

    await fig.getByRole('button', { name: 'המים', exact: true }).click();
    await expect(fig.locator('[data-readout="frame"]')).toContainText('מבט מהמים');
    expect(await task(page, 'fig-1-5b:water-frame')).toBeTruthy();

    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });

  test('predict: the flap opens only after committing, and the summary revisits it', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-5"]');
    await predict.scrollIntoViewIfNeeded();
    await hydrated(predict);
    await expect(predict).not.toHaveClass(/is-open/);
    const commit = predict.getByRole('button', { name: 'זה החיזוי שלי' });
    await expect(commit).toBeDisabled();
    await predict.locator('label.q-choice').first().click();
    await commit.click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-1-5'].choice).toBe('0');
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });

  test('check: the river crossing flags dividing by the full speed, then accepts 60 s', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.5-river-cross"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('48');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('חילקתם ב-');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('60');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });
});
