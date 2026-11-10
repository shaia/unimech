import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, inked, progress } from './helpers';

const LESSON = '/lessons/2-2/';

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
const button = (fig: Locator, name: string) => fig.getByRole('button', { name, exact: true });

test.describe('lesson 2.2: the third law and free-body diagrams', () => {
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

  test('the book: the partner of its weight acts on the Earth; in a rising elevator N₁ = m(g + a) = 11.8 N', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-2a');
    await expect(fig.locator('[data-readout="f-N1"]')).toContainText('N1 = 9.8 N');
    await button(fig, 'mg מכדור הארץ').click();
    await expect(fig.locator('[data-readout="pair"]')).toContainText('על כדור הארץ');
    expect(await task(page, 'fig-2-2a:book-pair')).toBeTruthy();
    await setSlider(fig.locator('input[type=range]').first(), 2);
    await button(fig, 'N1 מהשולחן').click();
    await expect(fig.locator('[data-readout="f-N1"]')).toContainText('N1 = 11.8 N');
    await expect(fig.locator('[data-readout="f-mg"]')).toContainText('mg = 9.8 N');
    // the partner of N₁: the book presses on the table with the same 11.8 N
    await expect(fig.locator('[data-readout="pair"]')).toContainText('11.8 N');
    expect(await task(page, 'fig-2-2a:book-elevator')).toBeTruthy();
  });

  test('blocks in contact: 3 N between them pushed on the heavy block, 9 N pushed on the light one; 6 N and 2 N with three', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-2b');
    await expect(fig.locator('[data-readout="f-P"]')).toContainText('P = 3 N');
    await expect(fig.locator('[data-readout="a"]')).toContainText('a = 3 m/s²');
    await button(fig, 'דחיפה מימין').click();
    await expect(fig.locator('[data-readout="f-P"]')).toContainText('P = 9 N');
    expect(await task(page, 'fig-2-2b:contact-side')).toBeTruthy();
    await button(fig, 'דחיפה משמאל').click();
    await button(fig, 'שלושה גושים').click();
    await button(fig, 'גוש 2').click();
    await expect(fig.locator('[data-readout="f-Q"]')).toContainText('Q = 2 N');
    await button(fig, 'P מגוש 1').click();
    await expect(fig.locator('[data-readout="f-P"]')).toContainText('P = 6 N');
    await expect(fig.locator('[data-readout="pair"]')).toContainText('על גוש 1');
    expect(await task(page, 'fig-2-2b:contact-middle')).toBeTruthy();
  });

  test('the stack and the horse: friction on B comes from A; the cart pulls the horse back with 700 N', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-2b');
    await button(fig, 'גוש על גוש').click();
    await button(fig, 'גוש B').click();
    await button(fig, 'f מגוש A').click();
    await expect(fig.locator('[data-readout="f-f"]')).toContainText('f = 2 N שמאלה');
    await expect(fig.locator('[data-readout="pair"]')).toContainText('על גוש A');
    await expect(fig.locator('[data-readout="mu"]')).toContainText('0.204');
    expect(await task(page, 'fig-2-2b:stack-friction')).toBeTruthy();

    await button(fig, 'סוס ועגלה').click();
    await button(fig, 'T מהעגלה').click();
    await expect(fig.locator('[data-readout="f-T"]')).toContainText('T = 700 N');
    await expect(fig.locator('[data-readout="pair"]')).toContainText('על העגלה');
    await expect(fig.locator('[data-readout="a"]')).toContainText('a = 1 m/s²');
    expect(await task(page, 'fig-2-2b:horse-pair')).toBeTruthy();
  });

  test('the table and the hanging weight: T = 7.84 N, → mg as M grows, → 0 as M shrinks', async ({ page }) => {
    const fig = await openFigure(page, 'fig-2-2c');
    await button(fig, 'T מהחוט').click();
    await expect(fig.locator('[data-readout="f-T"]')).toContainText('T = 7.84 N');
    await expect(fig.locator('[data-readout="pair"]')).toContainText('על החוט');
    expect(await task(page, 'fig-2-2c:pulley-rope')).toBeTruthy();
    const slider = fig.locator('input[type=range]').first();
    await setSlider(slider, 20);
    await expect(fig.locator('[data-readout="f-T"]')).toContainText('T = 9.33 N');
    expect(await task(page, 'fig-2-2c:pulley-heavy')).toBeTruthy();
    await setSlider(slider, 0.5);
    await expect(fig.locator('[data-readout="f-T"]')).toContainText('T = 3.27 N');
    await expect(fig.locator('[data-readout="a"]')).toContainText('a = 6.53 m/s²');
    expect(await task(page, 'fig-2-2c:pulley-light')).toBeTruthy();

    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
