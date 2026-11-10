import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/4-2/';

/** Set a range input the way a learner's drag does: value, then an input event. */
const slide = (range: Locator, value: number) =>
  range.evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

/** Open a figure, wait for hydration, stop the text steps and reset it. */
async function openFigure(page: import('@playwright/test').Page, id: string) {
  await page.goto(LESSON);
  const fig = page.locator(`#${id}`);
  await fig.scrollIntoViewIfNeeded();
  await hydrated(fig.locator('canvas'));
  await freezeSteps(page);
  await fig.getByRole('button', { name: 'איפוס' }).click();
  return fig;
}

test('both figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-4-2a', '#fig-4-2b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('the default collision: V = 1 m/s, u = 3 and −2 m/s, elastic result −2 and 3 m/s; playing it ticks the task', async ({ page }) => {
  const fig = await openFigure(page, 'fig-4-2a');
  const tasks = fig.locator('.sim-tasks li'); // reverse, plastic, recipe
  // 1.0 kg at +4.0 m/s, 1.5 kg at −1.0 m/s (cmframe.ts inCMFrame, collide)
  await expect(fig.locator('[data-readout="V"]')).toHaveText('V = 1 m/s');
  await expect(fig.locator('[data-readout="mu"]')).toHaveText('μ = 0.6 kg');
  await expect(fig.locator('[data-readout="u"] b')).toHaveText('u₁ = 3, u₂ = −2 m/s');
  await expect(fig.locator('[data-readout="after"] b')).toHaveText('v₁′ = −2, v₂′ = 3 m/s');
  await expect(fig.locator('[data-readout="K"] b')).toHaveText('K = 8.75 J = 1.25 J + 7.5 J');
  // the split is the one before the collision, labelled so next to the energy lost
  await expect(fig.locator('[data-readout="K"]')).toContainText('לפני');
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/, { timeout: 8000 });
  expect((await progress(page)).tasks['fig-4-2a:reverse']).toBeTruthy();
});

test('e = 0: both move at V and the whole relative energy is lost; the recipe walks four stages', async ({ page }) => {
  const fig = await openFigure(page, 'fig-4-2a');
  const tasks = fig.locator('.sim-tasks li');
  const ranges = fig.locator('input[type=range]'); // m1, v1, m2, v2, e, time
  await slide(ranges.nth(4), 0);
  await expect(fig.locator('[data-readout="after"] b')).toHaveText('v₁′ = 1, v₂′ = 1 m/s');
  await expect(fig.locator('[data-readout="lost"] b')).toHaveText('7.5 J');
  await fig.getByRole('button', { name: 'הפעלה', exact: true }).click();
  await expect(tasks.nth(1)).toHaveClass(/done/, { timeout: 8000 });
  const recipe = fig.getByRole('button', { name: 'המתכון: השלב הבא' });
  for (let i = 0; i < 3; i++) await recipe.click();
  await expect(tasks.nth(2)).not.toHaveClass(/done/);
  await recipe.click();
  await expect(tasks.nth(2)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-4-2a:plastic']).toBeTruthy();
  expect(p.tasks['fig-4-2a:recipe']).toBeTruthy();
});

test('shifting both velocities by −1 m/s keeps ½μv_rel² and makes P = 0: with e = 0 all of K is lost', async ({ page }) => {
  const fig = await openFigure(page, 'fig-4-2b');
  const tasks = fig.locator('.sim-tasks li'); // same-krel, zero-momentum
  const ranges = fig.locator('input[type=range]');
  await slide(ranges.nth(4), 0);
  await slide(ranges.nth(1), 3);
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await slide(ranges.nth(3), -2);
  // 1.0 kg at 3.0, 1.5 kg at −2.0: V = 0, K = ½μv_rel² = 7.5 J, all of it lost
  await expect(fig.locator('[data-readout="V"]')).toHaveText('V = 0 m/s');
  await expect(fig.locator('[data-readout="K"] b')).toHaveText('K = 7.5 J = 0 J + 7.5 J');
  await expect(fig.locator('[data-readout="lost"] b')).toHaveText('7.5 J');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  const p = await progress(page);
  expect(p.tasks['fig-4-2b:same-krel']).toBeTruthy();
  expect(p.tasks['fig-4-2b:zero-momentum']).toBeTruthy();
});

test('check: the CM-frame velocity given as the answer is tagged, then −2.0 m/s is accepted', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-4.2-cm-elastic-solve"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('-4.0');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-4.2-cm-elastic-solve',
    misconception: 'MC-4-cm-frame-is-lab-answer',
  });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('-2.0');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
