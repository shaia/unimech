import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/8-1/';

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
const task = (page: Page, key: string) => async () => (await progress(page))?.tasks?.[key];

test('scrolling through the text never completes a task', async ({ page }) => {
  await page.goto(LESSON);
  // scrolls to and clicks every step, including those that put an end of the rod at rest, the wheel rolling with
  // the stone's path on, and the disc at its instant of rest
  expect(await walkSteps(page)).toBeGreaterThan(15);
  await page.waitForTimeout(500);
  await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
  const tasks = (await progress(page))?.tasks ?? {};
  expect(Object.keys(tasks).filter((k) => k.startsWith('fig-8-1'))).toEqual([]);
});

test('all three figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-8-1a', '#fig-8-1b', '#fig-8-1c']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('a rod on ice: v = v_cm + ω × r at the ends, and the point at rest at v_cm/ω', async ({ page }) => {
  const fig = await openFigure(page, 'fig-8-1a');
  const ranges = fig.locator('input[type=range]'); // Vx, Vy, ω, t
  // v_cm = (0, 0.80) m/s, ω = 2.0 rad/s, L = 1.0 m (.scratch/ch8/8-1/lesson.ts): ends 1.8 and 0.2 m/s, Q 0.40 m away
  await expect(readout(fig, 'vA')).toContainText('1.8 m/s');
  await expect(readout(fig, 'vB')).toContainText('0.2 m/s');
  await expect(readout(fig, 'Q')).toContainText('0.4 m');
  // ω = 1.6 rad/s: v_cm/ω = 0.50 m, the end B stands
  await slide(ranges.nth(2), 1.6);
  await expect(readout(fig, 'vB')).toContainText('= 0 m/s');
  await expect.poll(task(page, 'fig-8-1a:end-at-rest')).toBeTruthy();
  // ω = 1.0 rad/s: Q 0.80 m from the CM, outside the rod
  await slide(ranges.nth(2), 1);
  await expect(readout(fig, 'Q')).toContainText('0.8 m');
  await expect.poll(task(page, 'fig-8-1a:q-outside')).toBeTruthy();
  await expect.poll(task(page, 'fig-8-1a:q-clockwise')).toBeFalsy();
  await slide(ranges.nth(2), -2);
  await expect(readout(fig, 'omega')).toContainText('−2');
  await expect.poll(task(page, 'fig-8-1a:q-clockwise')).toBeTruthy();
  await expect(fig.locator('.sim-tasks li.done')).toHaveCount(3);
});

test('a wheel: rolling stops the contact point and doubles the top; too fast a spin slides it backward', async ({ page }) => {
  const fig = await openFigure(page, 'fig-8-1b');
  const ranges = fig.locator('input[type=range]'); // V, ω, t
  // R = 0.40 m, v_cm = 1.0 m/s, ω = −2.5 rad/s: rolling
  await expect(readout(fig, 'contact')).toContainText('v = 0 m/s');
  await expect(readout(fig, 'top')).toContainText('v = 2 m/s');
  // locked wheel: the contact point slides forward at v_cm
  await slide(ranges.nth(1), 0);
  await expect(readout(fig, 'contact')).toContainText('v = 1 m/s');
  // v_cm = 1.2 m/s, then ω found by hand: −3.0 rad/s
  await slide(ranges.nth(0), 1.2);
  await expect.poll(task(page, 'fig-8-1b:roll-by-hand')).toBeFalsy();
  await slide(ranges.nth(1), -3);
  await expect(readout(fig, 'contact')).toContainText('v = 0 m/s');
  await expect.poll(task(page, 'fig-8-1b:roll-by-hand')).toBeTruthy();
  // ω = −6 rad/s: the contact point slides backward at 1.2 − 2.4 = −1.2 m/s
  await slide(ranges.nth(1), -6);
  await expect(readout(fig, 'contact')).toContainText('−1.2');
  await expect.poll(task(page, 'fig-8-1b:spin-out')).toBeTruthy();
  // rolling again by the button, the stone's path on, the time to the end of the run
  await fig.getByRole('button', { name: 'גלגול בלי החלקה', exact: true }).click();
  await expect(readout(fig, 'contact')).toContainText('v = 0 m/s');
  await fig.getByRole('button', { name: 'מסלול האבן', exact: true }).click();
  await slide(ranges.nth(2), 0.6);
  await expect.poll(task(page, 'fig-8-1b:cycloid')).toBeTruthy();
});

test('constant α: the disc stops at t = 4.0 s and P still accelerates; a_c = |a_t| when ω² = |α|', async ({ page }) => {
  const fig = await openFigure(page, 'fig-8-1c');
  const ranges = fig.locator('input[type=range]'); // ω₀, α, r, t
  // ω₀ = 3.0 rad/s, α = −0.75 rad/s², r = 0.50 m
  await expect(readout(fig, 'rev')).toContainText('t = 4 s');
  await slide(ranges.nth(3), 2);
  await expect(readout(fig, 'theta')).toContainText('4.5 rad');
  await expect(readout(fig, 'a')).toContainText('1.19');
  await slide(ranges.nth(3), 4);
  await expect(readout(fig, 'omega')).toContainText('= 0 rad/s');
  await expect(readout(fig, 'a')).toContainText('0.375');
  await expect.poll(task(page, 'fig-8-1c:stop-instant')).toBeTruthy();
  // ω = 0.866 rad/s at t = 2.845 s; the slider's step is 0.02 s
  await slide(ranges.nth(3), 2.84);
  await expect.poll(task(page, 'fig-8-1c:equal-parts')).toBeTruthy();
  await slide(ranges.nth(2), 0.25);
  await expect(readout(fig, 'omega')).toContainText('0.87');
  await expect.poll(task(page, 'fig-8-1c:half-radius')).toBeTruthy();
});

test('check: "the far child has the same speed" is caught and tagged, then the right choice is accepted', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-8.1-same-omega"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: /ולכן המהירות הזוויתית של B היא חצי/ }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-8.1-same-omega',
    misconception: 'MC-8-same-speed-at-every-radius',
    confident: true,
  });
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await q.getByRole('radio', { name: /וגודל המהירות של B כפול מזה של A/ }).click();
  await q.getByRole('button', { name: 'בדיקה · לא בטוחים' }).click();
  await expect(q).toHaveClass(/is-right/);
});
