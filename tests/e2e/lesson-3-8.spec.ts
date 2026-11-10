import { expect, test, type Locator } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress } from './helpers';

const LESSON = '/lessons/3-8/';

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

/** The figure's sliders, in order: m₂, ω₀, time. */
const sliders = (fig: Locator) => fig.locator('input[type=range]');

test('all three figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-3-8a', '#fig-3-8b', '#fig-3-8c']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('a thrown rigid dumbbell keeps L_rel and ω; gravity has no torque about the CM, and L_O drops by its torque about O', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-8a');
  const tasks = fig.locator('.sim-tasks li'); // throw, gravity, mass
  // m₁ = 0.30 kg, m₂ = 0.15 kg, d = 0.80 m: μ = 0.10 kg, I = 0.064 kg·m², L_rel = 0.768 at 12 rad/s (systemangular.ts)
  await expect(fig.locator('[data-readout="Lrel"] b')).toHaveText('0.768 kg·m²/s');
  await expect(fig.locator('[data-readout="Krel"] b')).toHaveText('4.61 J');
  await fig.getByRole('button', { name: 'זרקו', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  // after the landing (or at once in still mode): the same L_rel and ω, and R×MV = −½MgVₓT² = −4.30
  await expect(fig.locator('[data-readout="omega"] b')).toHaveText('12 rad/s', { timeout: 10000 });
  await expect(fig.locator('[data-readout="Lrel"] b')).toHaveText('0.768 kg·m²/s');
  await expect(fig.locator('[data-readout="Lorb"] b')).toHaveText('−4.3 kg·m²/s');
  await expect(fig.locator('[data-readout="tauO"] b')).toHaveText('−9.74 N·m');
  await expect(fig.locator('[data-readout="tauCM"] b')).toHaveText('0 N·m');
  // scrubbing with the weights shown ticks the gravity task, and only then
  await slide(sliders(fig).nth(2), 0.3);
  await expect(tasks.nth(1)).not.toHaveClass(/done/);
  await fig.getByRole('button', { name: 'כובד וזרועות' }).click();
  await slide(sliders(fig).nth(2), 0.4);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await expect(fig.locator('[data-readout="tauCM"] b')).toHaveText('0 N·m');
  // a heavier m₂ and a throw tick the mass task; ω stays 12
  await slide(sliders(fig).nth(0), 0.45);
  await fig.getByRole('button', { name: 'זרקו', exact: true }).click();
  await expect(tasks.nth(2)).toHaveClass(/done/);
  await expect(fig.locator('[data-readout="omega"] b')).toHaveText('12 rad/s', { timeout: 10000 });
  const p = await progress(page);
  expect(p.tasks['fig-3-8a:throw']).toBeTruthy();
  expect(p.tasks['fig-3-8a:gravity']).toBeTruthy();
  expect(p.tasks['fig-3-8a:mass']).toBeTruthy();
});

test('moving O changes only the CM part of L_O; at the top ½MV² is smallest and K_rel unchanged', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-8b');
  const tasks = fig.locator('.sim-tasks li'); // origin, top
  await fig.getByRole('button', { name: 'O מתחת לשיא' }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  // at the launch, about the point under the top: R×MV = −(D/2)·M·Vᵧ = −2.15, L_rel still 0.768
  await expect(fig.locator('[data-readout="Lorb"] b')).toHaveText('−2.15 kg·m²/s');
  await expect(fig.locator('[data-readout="Lrel"] b')).toHaveText('0.768 kg·m²/s');
  // the top is at T/2 = 0.442 s: ½MVₓ² = 1.41 J
  await slide(sliders(fig).nth(2), 0.442);
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await expect(fig.locator('[data-readout="Kcm"] b')).toHaveText('1.41 J');
  await expect(fig.locator('[data-readout="Krel"] b')).toHaveText('4.61 J');
});

test('a spring keeps L_rel while ω drops; the hypothetical non-central pair spins the system up', async ({ page }) => {
  const fig = await openFigure(page, 'fig-3-8c');
  const tasks = fig.locator('.sim-tasks li'); // pair, spring
  await fig.getByRole('button', { name: 'זוג לא מרכזי (ניסוי מחשבתי)' }).click();
  await fig.getByRole('button', { name: 'זרקו', exact: true }).click();
  await expect(tasks.nth(0)).toHaveClass(/done/);
  // L_rel = 0.768 + F d T = 1.47, ω = 12 + 12.5 T = 23.0 at the landing
  await expect(fig.locator('[data-readout="Lrel"] b')).toHaveText('1.47 kg·m²/s', { timeout: 10000 });
  await expect(fig.locator('[data-readout="omega"] b')).toHaveText('23 rad/s');
  await fig.getByRole('button', { name: 'זוג לא מרכזי (ניסוי מחשבתי)' }).click();
  await fig.getByRole('button', { name: 'קפיץ', exact: true }).click();
  await fig.getByRole('button', { name: 'זרקו', exact: true }).click();
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await expect(fig.locator('[data-readout="Lrel"] b')).toHaveText('0.768 kg·m²/s', { timeout: 10000 });
  // the first full stretch, near t = 0.108 s: d = 1.06 m, ω = 6.89 rad/s
  await slide(sliders(fig).nth(2), 0.108);
  await expect(fig.locator('[data-readout="d"] b')).toHaveText('1.06 m');
  await expect(fig.locator('[data-readout="omega"] b')).toHaveText('6.89 rad/s');
  await expect(fig.locator('[data-readout="Lrel"] b')).toHaveText('0.768 kg·m²/s');
});

test('"gravity turns the heavy end down" on the thrown hammer is caught and tagged', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-3.8-baton-spin"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  await q.getByRole('radio', { name: /מסובב את הראש הכבד/ }).click();
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  expect((await progress(page)).attempts.at(-1)).toMatchObject({
    qid: 'Q-3.8-baton-spin',
    misconception: 'MC-3-gravity-torque-about-cm',
    confident: true,
  });
});
