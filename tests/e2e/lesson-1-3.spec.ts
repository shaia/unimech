import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/1-3/';

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

  test('uniform circle: a = v²/R = 0.75 m/s², and showing it ticks the inward task', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-3a');
    await expect(fig.locator('[data-readout="speed"]')).toContainText('1.5 m/s');
    await expect(fig.locator('[data-readout="omega"]')).toContainText('0.5 rad/s');
    await fig.getByRole('button', { name: 'תאוצה', exact: true }).click();
    await expect(fig.locator('[data-readout="accel"]')).toContainText('0.75 m/s²');
    expect((await progress(page)).tasks['fig-1-3a:uniform-inward']).toBeTruthy();
  });

  test('Δv/Δt turns toward a as Δt shrinks, and its size closes in on 0.75 m/s²', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-3a');
    await fig.getByRole('button', { name: 'בניית Δv' }).click();
    const angle = fig.locator('[data-readout="dv-angle"]');
    // the largest Δt is 2 s: Δv/Δt is ωΔt/2 = 0.5 rad = 28.6° off a
    await expect(angle).toContainText('29°');
    await setSlider(fig.locator('input[type=range]').nth(1), 0);
    await expect(fig.locator('[data-readout="dv"]')).toContainText('0.75 m/s²');
    await expect(angle).toContainText('0.29°');
    expect((await progress(page)).tasks['fig-1-3a:shrink-dt']).toBeTruthy();
    await noSideways(page);
  });

  test('slowing circle: a_t = −0.45 m/s² points against v, and finding it ticks the task', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-3b');
    await fig.getByRole('button', { name: 'מעגל, מאט' }).click();
    await expect(fig.locator('[data-readout="at"]')).toContainText('−0.45 m/s²');
    // t = 4 s: ω = 0.4 rad/s, a⊥ = 0.48 m/s², a_t/|a| = −0.68
    await setSlider(fig.locator('input[type=range]').nth(0), 4);
    await expect(fig.locator('[data-readout="an"]')).toContainText('0.48 m/s²');
    expect((await progress(page)).tasks['fig-1-3b:slowing-split']).toBeTruthy();
  });

  test('throw: ρ = 17.5 m at launch and v_x²/g = 2.07 m at the top, which ticks the curvature task', async ({ page }) => {
    const fig = await openFigure(page, 'fig-1-3c');
    const rho = fig.locator('[data-readout="rho"]');
    await expect(rho).toContainText('17.5 m');
    await setSlider(fig.locator('input[type=range]').nth(0), 0.8163);
    await expect(rho).toContainText('2.07 m');
    expect((await progress(page)).tasks['fig-1-3c:top-curvature']).toBeTruthy();
    await noSideways(page);
  });
});

test.describe('predict, then reveal', () => {
  test('the flap opens only after committing', async ({ page }) => {
    await page.goto(LESSON);
    const predict = page.locator('[data-predict-id="pred-1-3"]');
    await predict.scrollIntoViewIfNeeded();
    await expect(predict).not.toHaveClass(/is-open/);
    const choice = predict.locator('label.q-choice', { hasText: 'בדיוק אל מרכז העיקול' });
    await hydrated(choice);
    await choice.click();
    await predict.getByRole('button', { name: 'זה החיזוי שלי' }).click();
    await expect(predict).toHaveClass(/is-open/);
  });
});

test.describe('questions', () => {
  test('numeric: adding the components as numbers gets targeted feedback; only ω²R is tagged always-central', async ({ page }) => {
    await page.goto(LESSON);
    const q = page.locator('[data-qid="Q-1.3-alpha-total"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('3');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q.locator('.q-feedback')).toContainText('בפיתגורס');
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('2');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    const a = (await progress(page)).attempts.at(-1);
    expect(a).toMatchObject({ qid: 'Q-1.3-alpha-total', correct: false, misconception: 'MC-1-circular-acceleration-always-central' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('2.24');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
    await noSideways(page);
  });
});
