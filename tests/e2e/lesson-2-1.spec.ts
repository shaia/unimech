import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/2-1/';

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

test.describe('lesson 2.1: inertial frames and the second law', () => {
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

  test('an accelerating car: no force on the free puck, a′ = −A in the car, and it reaches the back wall after 1.41 s', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-1a');
    await setSlider(fig.locator('input[type=range]').nth(1), 2);
    await expect(fig.locator('[data-readout="F"]')).toContainText('ΣF = 0 N');
    await expect(fig.locator('[data-readout="a"]')).toContainText('a = 0 m/s²');
    await expect(fig.locator('[data-readout="a"]')).toContainText('החוק השני מתקיים');
    await expect(fig.locator('[data-readout="ap"]')).toContainText('a′ = −2 m/s²');
    await expect(fig.locator('[data-readout="ap"]')).toContainText('החוק השני לא מתקיים');
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await expect(fig.locator('[data-readout="end"]')).toContainText('האחורית', { timeout: 10_000 });
    await expect(fig.locator('[data-readout="end"]')).toContainText('1.41 s');
    expect(await task(page, 'fig-2-1a:accelerate')).toBeTruthy();
  });

  test('a tied puck: the string pulls with m·A, the law holds on the ground and fails in the car', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-1a');
    await fig.getByRole('button', { name: 'חוט קושר את הדסקית לדופן' }).click();
    await expect(fig.locator('[data-readout="F"]')).toContainText('ΣF = 2 N');
    await expect(fig.locator('[data-readout="a"]')).toContainText('a = 2 m/s²');
    await expect(fig.locator('[data-readout="a"]')).toContainText('החוק השני מתקיים');
    await expect(fig.locator('[data-readout="ap"]')).toContainText('a′ = 0 m/s²');
    await expect(fig.locator('[data-readout="ap"]')).toContainText('החוק השני לא מתקיים');
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await expect.poll(() => task(page, 'fig-2-1a:tied'), { timeout: 10_000 }).toBeTruthy();
  });

  test('a car at constant velocity is inertial: the free puck stays in its place', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-1a');
    await setSlider(fig.locator('input[type=range]').nth(0), 2);
    await setSlider(fig.locator('input[type=range]').nth(1), 0);
    await expect(fig.locator('[data-readout="ap"]')).toContainText('החוק השני מתקיים');
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await expect(fig.locator('[data-readout="end"]')).toContainText('הדסקית נשארה במקומה בקרון', { timeout: 10_000 });
    expect(await task(page, 'fig-2-1a:steady')).toBeTruthy();
  });

  test('the forces table: components add, not magnitudes; a = ΣF/m; balance, mass and a bent path', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-1b');
    await expect(fig.locator('[data-readout="sum"]')).toContainText('ΣF = (4, 3) N');
    await expect(fig.locator('[data-readout="Fmag"]')).toContainText('5 N');
    await expect(fig.locator('[data-readout="mags"]')).toContainText('7 N');
    await expect(fig.locator('[data-readout="a"]')).toContainText('(2, 1.5) m/s²');
    await expect(fig.locator('[data-readout="amag"]')).toContainText('2.5 m/s²');

    await fig.getByRole('button', { name: 'ראש לזנב' }).click();
    expect(await task(page, 'fig-2-1b:chain')).toBeTruthy();

    await setSlider(fig.locator('input[type=range]').nth(2), 4);
    await expect(fig.locator('[data-readout="amag"]')).toContainText('1.25 m/s²');
    expect(await task(page, 'fig-2-1b:mass')).toBeTruthy();

    await fig.getByRole('button', { name: 'F₂' }).click();
    await setSlider(fig.locator('input[type=range]').nth(0), 4);
    await setSlider(fig.locator('input[type=range]').nth(1), 180);
    await expect(fig.locator('[data-readout="Fmag"]')).toContainText('|ΣF| = 0 N');
    expect(await task(page, 'fig-2-1b:balance')).toBeTruthy();

    await fig.getByRole('button', { name: 'איפוס' }).click();
    await setSlider(fig.locator('input[type=range]').nth(3), 2);
    await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
    await expect.poll(() => task(page, 'fig-2-1b:curve'), { timeout: 10_000 }).toBeTruthy();

    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });

  test('predict: the flap opens only after committing, and the summary revisits it', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-2-1"]');
    await predict.scrollIntoViewIfNeeded();
    await hydrated(predict);
    await expect(predict).not.toHaveClass(/is-open/);
    const commit = predict.getByRole('button', { name: 'זה החיזוי שלי' });
    await expect(commit).toBeDisabled();
    await predict.locator('label.q-choice').first().click();
    await commit.click();
    await expect(predict).toHaveClass(/is-open/);
    expect((await progress(page)).predictions['pred-2-1'].choice).toBe('0');
    await page.locator('.revisit').scrollIntoViewIfNeeded();
    await expect(page.locator('.revisit')).toContainText('החיזוי שלכם');
  });

  test('check: the components question flags adding magnitudes, then accepts 3.16', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-2.1-components"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('3.62');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('חיברתם את');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('3.16');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });
});
