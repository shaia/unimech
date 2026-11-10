import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/2-6/';

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

  test('banked curve: v₀ = √(gR tanθ) = 16.9 m/s needs no friction; slower, the friction points up the slope', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-6a');
    // flat road at 12 m/s: friction alone is the radial force, 0.184 mg
    await expect(fig.locator('[data-readout="friction"]')).toContainText('0.184 mg');
    await setSlider(fig.locator('input[type=range]').nth(1), 20);
    await expect(fig.locator('[data-readout="v0"]')).toContainText('16.9 m/s');
    await expect(fig.locator('[data-readout="range"]')).toContainText('6.72 – 24.2 m/s');
    await setSlider(fig.locator('input[type=range]').nth(0), 16.9);
    await expect(fig.locator('[data-readout="friction-dir"]')).toContainText('אין צורך');
    expect((await progress(page)).tasks['fig-2-6a:design-speed']).toBeTruthy();
    await setSlider(fig.locator('input[type=range]').nth(0), 10);
    await expect(fig.locator('[data-readout="friction"]')).toContainText('0.222 mg');
    await expect(fig.locator('[data-readout="friction-dir"]')).toContainText('במעלה');
    expect((await progress(page)).tasks['fig-2-6a:friction-up']).toBeTruthy();
    await noSideways(page);
  });

  test('conical pendulum: ω = 4 rad/s gives 52.2°, and T = 2mg at 60° ticks the task', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-6b');
    await expect(fig.locator('[data-readout="theta"]')).toContainText('52.2°');
    await expect(fig.locator('[data-readout="tension"]')).toContainText('1.63 mg');
    await setSlider(fig.locator('input[type=range]').nth(0), 4.43);
    await expect(fig.locator('[data-readout="theta"]')).toContainText('60°');
    expect((await progress(page)).tasks['fig-2-6b:tension-double']).toBeTruthy();
    await setSlider(fig.locator('input[type=range]').nth(0), 3);
    await expect(fig.locator('[data-readout="hangs"]')).toBeVisible();
  });

  test('vertical circle: √(5gR) = 7.00 m/s leaves T = 0 at the top; a rod pushes at the top below that', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-6c');
    await expect(fig.locator('[data-readout="support"]')).toContainText('6.74 mg');
    await setSlider(fig.locator('input[type=range]').nth(0), 7);
    // no readout changes at this step to wait on, and a slow runner reads the store before the figure saves the task
    await expect.poll(async () => (await progress(page)).tasks['fig-2-6c:top-min']).toBeTruthy();
    await setSlider(fig.locator('input[type=range]').nth(0), 6);
    await expect(fig.locator('[data-readout="slack"]')).toContainText('124°');
    await fig.getByRole('button', { name: 'מוט', exact: true }).click();
    await setSlider(fig.locator('input[type=range]').nth(0), 6.5);
    await setSlider(fig.locator('input[type=range]').nth(1), 180);
    await expect(fig.locator('[data-readout="support"]')).toContainText('−0.689 mg');
    expect((await progress(page)).tasks['fig-2-6c:rod-push']).toBeTruthy();
    await noSideways(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-2-6"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'כוח צנטריפוגלי' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: the plane-pendulum period gets targeted feedback, then the conical period is right', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.6-conical"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('2.01');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('מטוטלת רגילה');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('1.87');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSideways(page);
  });
});
