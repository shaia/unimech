import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/8-6/';

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

const readout = (fig: Locator, key: string) => fig.locator(`[data-readout="${key}"]`);

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
    const p = await progress(page);
    expect(Object.keys(p?.tasks ?? {}).filter((k) => k.startsWith('fig-8-6'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-8-6a', '#fig-8-6b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('weights pulled in: L = Iω stays 1.81, ω 2.0 → 3.48, K 1.81 → 3.15 J = K₀ + W; a dropped ring keeps L and makes heat', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-6a');
    const tasks = fig.locator('.sim-tasks li'); // pull, out, ring
    const r = fig.locator('input[type=range]').first();
    // platform ½·4.0·0.50² = 0.500, two 1.0 kg weights at 0.45 m: I = 0.905, ω = 2.0 (.scratch/ch8/8-6/lesson.ts)
    await expect(readout(fig, 'L')).toContainText('1.81');
    await expect(readout(fig, 'K')).toContainText('1.81');
    await slide(r, 0.1);
    await expect(readout(fig, 'omega')).toContainText('3.48');
    await expect(readout(fig, 'L')).toContainText('1.81');
    await expect(readout(fig, 'K')).toContainText('3.15');
    await expect(readout(fig, 'W')).toContainText('1.34');
    await expect(tasks.nth(0)).toHaveClass(/done/);
    await expect(tasks.nth(1)).not.toHaveClass(/done/);
    await slide(r, 0.45);
    await expect(readout(fig, 'W')).toContainText('= 0 J');
    await expect(tasks.nth(1)).toHaveClass(/done/);
    // the ring (2.0 kg, 0.48 m) dropped at 0.45 m: ω_f = 1.81/1.366 = 1.33 rad/s, Q = 0.611 J
    await fig.getByRole('button', { name: 'הפילו את הטבעת' }).click();
    await expect(readout(fig, 'omega')).toContainText('1.33', { timeout: 8000 });
    await expect(readout(fig, 'L')).toContainText('1.81');
    await expect(readout(fig, 'Q')).toContainText('0.611');
    await expect(tasks.nth(2)).toHaveClass(/done/);
    await expect.poll(async () => (await progress(page))?.tasks?.['fig-8-6a:ring']).toBeTruthy();
  });

  test('a pinned rod keeps L about P, not p; the pin gives no impulse at 2L/3; a free rod spins faster; elastic keeps K', async ({ page }) => {
    const fig = await openFigure(page, 'fig-8-6b');
    const tasks = fig.locator('.sim-tasks li'); // pin, percussion, free, elastic
    const s = fig.locator('input[type=range]').first();
    // rod 1.5 kg, 1.2 m pinned at the top; puck 0.30 kg at 4.0 m/s sticks at the far end: ω = 1.25, J_P = 0.375 N·s
    await expect(readout(fig, 'omega')).toContainText('1.25');
    await expect(readout(fig, 'JP')).toContainText('0.375');
    await expect(readout(fig, 'L')).toContainText('1.44 → 1.44');
    await fig.getByRole('button', { name: 'שגרו', exact: true }).click();
    await expect(tasks.nth(0)).toHaveClass(/done/);
    // the centre of percussion: s = 2L/3 = 0.80 m
    await slide(s, 0.8);
    await expect(readout(fig, 'JP')).toContainText('= 0 N');
    await expect(tasks.nth(1)).toHaveClass(/done/);
    // free, at the end: ω = μvb/(I_cm + μb²) = 2.22 rad/s; p and L about O kept
    await fig.getByRole('button', { name: 'חופשי', exact: true }).click();
    await slide(s, 1.2);
    await expect(readout(fig, 'omega')).toContainText('2.22');
    await expect(readout(fig, 'p')).toContainText('1.2 → 1.2');
    await fig.getByRole('button', { name: 'שגרו', exact: true }).click();
    await expect(tasks.nth(2)).toHaveClass(/done/);
    await expect(tasks.nth(3)).not.toHaveClass(/done/);
    // elastic: twice the impulse, ω = 4.44, the puck comes back at 0.444 m/s, K 2.4 → 2.4 J
    await fig.getByRole('button', { name: 'אלסטית', exact: true }).click();
    await expect(readout(fig, 'omega')).toContainText('4.44');
    await expect(readout(fig, 'vAfter')).toContainText('−0.444');
    await expect(readout(fig, 'K')).toContainText('2.4 → 2.4');
    await fig.getByRole('button', { name: 'שגרו', exact: true }).click();
    await expect(tasks.nth(3)).toHaveClass(/done/);
    await expect.poll(async () => (await progress(page))?.tasks?.['fig-8-6b:elastic']).toBeTruthy();
  });
});

test('"momentum is conserved with a pivot" is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-8.6-pivot-conserved"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: 'גם התנע הקווי וגם התנע הזוויתי סביב הציר.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect
    .poll(async () => (await progress(page))?.attempts?.at(-1))
    .toMatchObject({ qid: 'Q-8.6-pivot-conserved', misconception: 'MC-8-momentum-conserved-with-pivot', confident: true });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: 'רק התנע הזוויתי סביב הציר.', exact: true }).click();
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});
