import { expect, test } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every built workbook page: ten practice problems and two challenge problems, each with its final
 * answer and full solution closed until asked for, and nothing that widens the page once opened.
 */

const DIST = join(import.meta.dirname, '../../dist/workbook');
const PAGES = existsSync(DIST) ? readdirSync(DIST).map((d) => `/workbook/${d}/`) : [];

const pageWidth = (page: import('@playwright/test').Page) =>
  page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));

for (const path of PAGES) {
  test(`${path}: 10 + 2 problems with answers hidden until opened`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('.level-group [data-workbook-item]')).toHaveCount(10);
    await expect(page.locator('.wb-challenge')).toHaveCount(2);
    await expect(page.locator('.wb-challenge .wb-source a')).toHaveCount(2);

    const details = page.locator('.wb-item details');
    await expect(details).toHaveCount(24);
    expect(await details.evaluateAll((ds) => ds.filter((d) => (d as HTMLDetailsElement).open).length)).toBe(0);

    const first = page.locator('.wb-item').first();
    const answer = first.locator('.wb-answer .solution-body');
    await expect(answer).toBeHidden();
    await first.locator('.wb-answer > summary').click();
    await expect(answer).toBeVisible();
    await expect(first.locator('.wb-solution .sol-step').first()).toBeHidden();

    // a revealed long formula must scroll inside its box, never widen the page (CLAUDE.md, phones)
    await details.evaluateAll((ds) => ds.forEach((d) => ((d as HTMLDetailsElement).open = true)));
    await expect(page.locator('.katex-error')).toHaveCount(0);
    const { sw, cw } = await pageWidth(page);
    expect(sw).toBeLessThanOrEqual(cw);
  });
}
