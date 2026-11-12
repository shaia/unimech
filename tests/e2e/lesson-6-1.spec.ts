import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/6-1/';

/** Set a range input the way a learner's drag does: value, then an input event. */
const slide = (range: Locator, value: number) =>
  range.evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** Open a figure, wait for hydration, stop the text steps and reset it. */
async function openFigure(page: Page, id: string) {
  await page.goto(LESSON);
  const fig = page.locator(`#${id}`);
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('canvas'));
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

const task = (page: Page, id: string) => expect.poll(async () => (await progress(page))?.tasks?.[id]);

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
  const tasks = (await progress(page))?.tasks ?? {};
  expect(Object.keys(tasks).filter((k) => k.startsWith('fig-6-1'))).toEqual([]);
});

test('both figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-6-1a', '#fig-6-1b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('outside the shell the rings sum to GM/r²: 0.377 with 12 rings and 0.391 = 1/1.6² with 200', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-1a');
  const [r, n] = [fig.locator('input[type=range]').nth(0), fig.locator('input[type=range]').nth(1)];
  // shell.ts: shellSum(1, 1, 1, 1.6, 12).g = 0.377; GM/r² = 0.391
  await expect(fig.locator('[data-readout="r"] b')).toHaveText('1.6 R');
  await expect(fig.locator('[data-readout="gsum"] b')).toHaveText('0.377 GM/R²');
  await expect(fig.locator('[data-readout="g"] b')).toHaveText('0.391 GM/R²');
  await expect(fig.locator('[data-readout="out"] b')).toHaveText('0');
  await slide(n, 200);
  await expect(fig.locator('[data-readout="gsum"] b')).toHaveText('0.391 GM/R²');
  await slide(r, 2.4);
  await task(page, 'fig-6-1a:outside').toBeTruthy();
});

test('inside the shell the near rings pull out and the far rings in; with more rings the sum goes to zero', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-1a');
  const [r, n] = [fig.locator('input[type=range]').nth(0), fig.locator('input[type=range]').nth(1)];
  const tasks = fig.locator('.sim-tasks li'); // outside, inside, play, rings
  await slide(r, 0.6);
  // shell.ts, r = 0.6R, 12 rings: inward 0.277, outward 0.239, net 0.0378; 200 rings: net 1.79·10⁻⁴
  await expect(fig.locator('[data-readout="in"] b')).toHaveText('0.277');
  await expect(fig.locator('[data-readout="out"] b')).toHaveText('0.239');
  await expect(fig.locator('[data-readout="gsum"] b')).toHaveText('0.0378 GM/R²');
  await expect(fig.locator('[data-readout="g"] b')).toHaveText('0 GM/R²');
  await expect(fig.locator('[data-readout="U"] b')).toHaveText('−1 GM/R');
  await task(page, 'fig-6-1a:inside').toBeTruthy();
  await expect(tasks.nth(3)).not.toHaveClass(/done/);
  await slide(n, 200);
  await expect(fig.locator('[data-readout="gsum"] b')).toHaveText('1.79·10⁻⁴ GM/R²');
  await task(page, 'fig-6-1a:rings').toBeTruthy();
  await fig.getByRole('button', { name: 'סכמו טבעת אחר טבעת', exact: true }).click();
  await task(page, 'fig-6-1a:play').toBeTruthy();
  // the sum plays ring by ring and ends on all 200
  await expect(fig.locator('[data-readout="k"] b')).toHaveText('200', { timeout: 15000 });
  await expect(fig.locator('[data-readout="gsum"] b')).toHaveText('1.79·10⁻⁴ GM/R²');
});

test('inside a uniform sphere g = GMr/R³: 0.4 at 0.4R, where the mass inside is 0.064M; U/m at 0.6R is −1.32 GM/R', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-1b');
  const r = fig.locator('input[type=range]').nth(0);
  await expect(fig.locator('[data-readout="g"] b')).toHaveText('0.4 GM/R²');
  await expect(fig.locator('[data-readout="gsum"] b')).toHaveText('0.4 GM/R²');
  await expect(fig.locator('[data-readout="Mr"] b')).toHaveText('0.064');
  await slide(r, 0.6);
  await expect(fig.locator('[data-readout="g"] b')).toHaveText('0.6 GM/R²');
  await task(page, 'fig-6-1b:solid-inside').toBeTruthy();
  await fig.getByRole('button', { name: 'גרף של U', exact: true }).click();
  // spherePotential(1, 1, 1, 0.6) = −(3 − 0.36)/2 = −1.32
  await expect(fig.locator('[data-readout="U"] b')).toHaveText('−1.32 GM/R');
  await task(page, 'fig-6-1b:potential').toBeTruthy();
  // outside, the same body pulls like a point mass: 1/1.3² = 0.592
  await slide(r, 1.3);
  await expect(fig.locator('[data-readout="g"] b')).toHaveText('0.592 GM/R²');
});

test('"the near wall pulls harder" is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-6.1-shell-inside"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'כוח לכיוון הדופן הקרובה, כי היא קרובה יותר.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-6.1-shell-inside',
    misconception: 'MC-6-shell-zero-only-center',
    confident: true,
  });
});
