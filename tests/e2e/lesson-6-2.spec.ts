import { expect, test, type Locator, type Page } from '@playwright/test';
import { freezeSteps, hydrated, inked, progress, walkSteps } from './helpers';

const LESSON = '/lessons/6-2/';

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

const task = (page: Page, key: string) => async () => (await progress(page))?.tasks?.[key];

test('both figures draw, in LTR physics space', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-6-2a', '#fig-6-2b']) {
    const canvas = page.locator(`${id} canvas`);
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveCSS('direction', 'ltr');
    await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
  }
});

test('m₁/m₂ = 0.5: μ = 2/3 m₁, the CM a third of the way from body 2, v₁/v₂ = 2; equal masses tick the task', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-2a');
  // twobody.ts: d₁ = (m₂/M) r, d₂ = (m₁/M) r, μ = m₁/(1 + m₁/m₂)
  await expect(fig.locator('[data-readout="q"]')).toHaveText('m₁/m₂ = 0.5');
  await expect(fig.locator('[data-readout="mu"]')).toHaveText('μ = 0.667 m₁');
  await expect(fig.locator('[data-readout="d"] b')).toHaveText('d₁ = 0.667 r, d₂ = 0.333 r');
  await expect(fig.locator('[data-readout="speeds"]')).toHaveText('v₁/v₂ = 2');
  const tasks = fig.locator('.sim-tasks li'); // equal, relative, earth-moon
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await slide(fig.locator('input[type=range]').nth(0), 1);
  await expect(fig.locator('[data-readout="d"] b')).toHaveText('d₁ = 0.5 r, d₂ = 0.5 r');
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await expect.poll(task(page, 'fig-6-2a:equal')).toBeTruthy();
});

test('the relative view and the Earth–Moon preset tick their tasks; the CM is 4670 km from the Earth’s centre', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-2a');
  const tasks = fig.locator('.sim-tasks li');
  await fig.getByRole('button', { name: 'התנועה היחסית' }).click();
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await expect.poll(task(page, 'fig-6-2a:relative')).toBeTruthy();
  await fig.getByRole('button', { name: 'כדור הארץ והירח' }).click();
  await expect(fig.locator('[data-readout="earth"] b')).toHaveText('4670 km < R = 6370 km');
  await expect(fig.locator('[data-readout="q"]')).toHaveText('m₁/m₂ = 0.0123');
  await expect(tasks.nth(2)).toHaveClass(/done/);
  await expect.poll(task(page, 'fig-6-2a:earth-moon')).toBeTruthy();
  const canvas = fig.locator('canvas');
  await expect.poll(() => inked(canvas)).toBeGreaterThan(200);
});

test('e ≥ 0.5 in the CM view, then the relative view, tick the two ellipse tasks', async ({ page }) => {
  const fig = await openFigure(page, 'fig-6-2b');
  const tasks = fig.locator('.sim-tasks li'); // ellipse, relative-ellipse
  await slide(fig.locator('input[type=range]').nth(1), 0.3);
  await expect(tasks.nth(0)).not.toHaveClass(/done/);
  await slide(fig.locator('input[type=range]').nth(1), 0.6);
  await expect(tasks.nth(0)).toHaveClass(/done/);
  await fig.getByRole('button', { name: 'התנועה היחסית' }).click();
  await expect(tasks.nth(1)).toHaveClass(/done/);
  await expect.poll(task(page, 'fig-6-2b:ellipse')).toBeTruthy();
  await expect.poll(task(page, 'fig-6-2b:relative-ellipse')).toBeTruthy();
});

test('scrolling through the text never completes a task', async ({ page }) => {
  await page.goto(LESSON);
  for (const id of ['#fig-6-2a', '#fig-6-2b']) {
    await page.locator(`${id} canvas`).scrollIntoViewIfNeeded();
    await hydrated(page.locator(`${id} canvas`));
  }
  expect(await walkSteps(page)).toBeGreaterThan(8);
  // and once more, fast, in reverse: steps arriving faster than the figures' effects run
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-step]')).reverse()) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  await page.waitForTimeout(800);
  const tasks = ((await progress(page))?.tasks ?? {}) as Record<string, unknown>;
  expect(Object.keys(tasks).filter((k) => k.startsWith('fig-6-2'))).toEqual([]);
});

test('check: the speed without 2π is caught, then the Sun’s 12.4 m/s is accepted', async ({ page }) => {
  await page.goto(LESSON);
  const q = page.locator('[data-qid="Q-6.2-sun-wobble"]');
  await q.scrollIntoViewIfNeeded();
  await hydrated(q);
  const input = q.locator('input[type=text]');
  await input.fill('1.98');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).not.toHaveClass(/is-right/);
  await q.getByRole('button', { name: 'נסו שוב' }).click();
  await input.fill('12.4');
  await q.getByRole('button', { name: 'בדיקה · בטוחים', exact: true }).click();
  await expect(q).toHaveClass(/is-right/);
});
