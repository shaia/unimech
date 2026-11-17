import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/10-2/';

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

/** The sliders in panel order: β, then rest energy and momentum of A, then (two particles) of B. */
const sliders = (fig: Locator) => {
  const r = fig.locator('input[type=range]');
  return { beta: r.nth(0), ma: r.nth(1), pa: r.nth(2), mb: r.nth(3), pb: r.nth(4) };
};

/** A task's stored tick, read until the asynchronous write lands. */
const ticked = (page: Page, key: string) => expect.poll(async () => ((await progress(page))?.tasks ?? {})[key]).toBeTruthy();

const readout = (fig: Locator, key: string) => fig.locator(`[data-readout="${key}"] b`);

test.describe('live figures', () => {
  test('scrolling through the text never completes a task', async ({ page }) => {
    await page.goto(LESSON);
    await walkSteps(page);
    await expect(page.locator('.sim-tasks li.done')).toHaveCount(0);
    const tasks = (await progress(page))?.tasks ?? {};
    expect(Object.keys(tasks).filter((k) => k.startsWith('fig-10-2'))).toHaveLength(0);
  });

  test('both figures draw, in LTR physics space', async ({ page }) => {
    await page.goto(LESSON);
    for (const id of ['#fig-10-2a', '#fig-10-2b']) {
      const canvas = page.locator(`${id} canvas`);
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toHaveCSS('direction', 'ltr');
      await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
    }
  });

  test('a pion with pc = 105 MeV is at rest in the frame at 0.6c, and its √(E² − (pc)²) is 140 MeV in every frame', async ({ page }) => {
    const fig = await openFigure(page, 'fig-10-2a');
    const s = sliders(fig);
    // .scratch/ch10/10-2/lesson.ts: E = 175 MeV, v = 0.6c; boost 0.6 → (140, 0); boost 0.8 → (151.7, −58.3)
    await slide(s.pa, 105);
    await expect(readout(fig, 'a-lab')).toHaveText('E = 175 MeV, pc = 105 MeV, v/c = 0.6');
    await slide(s.beta, 0.6);
    await expect(readout(fig, 'a-frame')).toHaveText('E′ = 140 MeV, p′c = 0 MeV, v′/c = 0');
    await ticked(page, 'fig-10-2a:rest-frame');
    await ticked(page, 'fig-10-2a:boost');
    await slide(s.beta, 0.8);
    await expect(readout(fig, 'a-frame')).toHaveText('E′ = 152 MeV, p′c = −58.3 MeV, v′/c = −0.385');
    await expect(readout(fig, 'a-mass')).toHaveText('140 MeV');
    await expect(readout(fig, 'a-mass-p')).toHaveText('140 MeV');
  });

  test('a massless particle stays on E = pc under a boost, red-shifted by √((1 − β)/(1 + β))', async ({ page }) => {
    const fig = await openFigure(page, 'fig-10-2a');
    const s = sliders(fig);
    await slide(s.ma, 0);
    await slide(s.pa, 200);
    expect(((await progress(page))?.tasks ?? {})['fig-10-2a:photon']).toBeFalsy();
    await slide(s.beta, 0.6);
    await expect(readout(fig, 'a-frame')).toHaveText('E′ = 100 MeV, p′c = 100 MeV, v′/c = 1');
    await ticked(page, 'fig-10-2a:photon');
    await slide(s.beta, -0.6);
    await expect(readout(fig, 'a-frame')).toHaveText('E′ = 400 MeV, p′c = 400 MeV, v′/c = 1');
  });

  test('two opposite 100 MeV photons weigh 200 MeV/c² in every frame', async ({ page }) => {
    const fig = await openFigure(page, 'fig-10-2b');
    await expect(readout(fig, 'sys-mass')).toHaveText('200 MeV');
    await expect(readout(fig, 'sum-masses')).toHaveText('0 MeV');
    await slide(sliders(fig).beta, 0.6);
    await expect(readout(fig, 'sys-frame')).toHaveText('E′tot = 250 MeV, p′totc = −150 MeV');
    await expect(readout(fig, 'sys-mass-p')).toHaveText('200 MeV');
    await ticked(page, 'fig-10-2b:system');
  });

  test('two pions, one at rest: Mc² = 297 MeV, and the centre-of-mass frame moves at c/3', async ({ page }) => {
    const fig = await openFigure(page, 'fig-10-2b');
    const s = sliders(fig);
    await slide(s.ma, 140);
    await slide(s.pa, 105);
    await slide(s.mb, 140);
    await slide(s.pb, 0);
    await expect(readout(fig, 'sys-mass')).toHaveText('297 MeV');
    await expect(readout(fig, 'sum-masses')).toHaveText('280 MeV');
    expect(((await progress(page))?.tasks ?? {})['fig-10-2b:cm-frame']).toBeFalsy();
    await slide(s.beta, 0.33);
    await ticked(page, 'fig-10-2b:cm-frame');
    await expect(readout(fig, 'sys-mass-p')).toHaveText('297 MeV');
  });
});

test.describe('questions', () => {
  test('numeric: the rest energy as the energy in a moving frame is caught and tagged; γmc² = 1172.5 MeV is right', async ({ page }) => {
    await page.goto('/practice/ch10/');
    const q = page.locator('[data-qid="Q-10.2-rest-boost"]');
    await q.scrollIntoViewIfNeeded();
    await hydrated(q);
    const input = q.locator('input[type=text]');
    await input.fill('938');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect
      .poll(async () => (await progress(page))?.attempts?.at(-1))
      .toMatchObject({ qid: 'Q-10.2-rest-boost', correct: false, misconception: 'MC-10-energy-invariant' });
    await q.getByRole('button', { name: 'נסו שוב' }).click();
    await input.fill('1172.5');
    await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
    await expect(q).toHaveClass(/is-right/);
  });

  test('no sideways overflow at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(LESSON);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
  });
});
