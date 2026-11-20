import { expect, test } from '@playwright/test';

/**
 * The exam formula sheet (src/formula-sheet.ts) is a model of what a 77101 student may bring: two sheets, four A4
 * pages. Printed, it must stay within four pages; on screen, no formula may widen the page.
 */

test('the exam formula sheet prints on at most four A4 pages', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium' || info.project.name !== 'desktop', 'page.pdf() is Chromium-only; once is enough');
  await page.goto('/formulas/sheet/');
  await expect(page.locator('.fs-section')).not.toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  const pdf = (await page.pdf({ format: 'A4', preferCSSPageSize: true })).toString('latin1');
  const pages = pdf.match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
  expect(pages).toBeGreaterThan(0);
  expect(pages).toBeLessThanOrEqual(4);
});

test('the exam formula sheet has no KaTeX error and no sideways overflow', async ({ page }) => {
  await page.goto('/formulas/sheet/');
  await expect(page.locator('.katex-error')).toHaveCount(0);
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
});
