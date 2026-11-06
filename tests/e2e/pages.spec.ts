import { expect, test, type Page } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Checks every built page must pass: Hebrew RTL, no console errors, no KaTeX errors, no sideways
 * overflow, no dead internal links. Pages are discovered from dist/, so a new lesson is covered
 * as soon as it is built.
 */

const DIST = join(import.meta.dirname, '../../dist');
const lessonPages = existsSync(join(DIST, 'lessons'))
  ? readdirSync(join(DIST, 'lessons')).map((d) => `/lessons/${d}/`)
  : [];
const extra = ['me', 'formulas', 'glossary', 'practice', 'test', 'workbook', 'summary'].flatMap((d) =>
  existsSync(join(DIST, d)) ? walkPages(join(DIST, d), `/${d}/`) : [],
);
const PAGES = ['/', ...lessonPages, ...extra];

function walkPages(dir: string, at: string): string[] {
  const here = existsSync(join(dir, 'index.html')) ? [at] : [];
  const subs = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => walkPages(join(dir, e.name), `${at}${e.name}/`));
  return [...here, ...subs];
}

/** Fail the test on any console error or uncaught exception. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test.describe('every page', () => {
  for (const path of PAGES) {
    test(`${path} renders in Hebrew RTL with no errors`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html')).toHaveAttribute('lang', 'he');
      await expect(page.locator('.katex-error')).toHaveCount(0);
      // scroll through so every lazily hydrated island mounts
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
      });
      await page.waitForTimeout(300);
      expect(errors).toEqual([]);
      // nothing may widen the page: sideways scrolling on a phone misplaces every tap. Worked solutions are closed
      // at load, and a long inline formula inside one widened the page only once it was opened, so open them all.
      await page.evaluate(() => document.querySelectorAll('details').forEach((d) => d.setAttribute('open', '')));
      const { sw, cw } = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      expect(sw).toBeLessThanOrEqual(cw);
    });

    test(`${path} has no dead internal links`, async ({ page, request }) => {
      await page.goto(path);
      // one request per page, not per anchor: My Path links every planned lesson to a section (#pl-…) of the same
      // few multi-megabyte practice pages, and fetching each anchor separately ran past the test timeout
      const urls = await page.$$eval('a[href]', (as) =>
        [...new Set(as.map((a) => (a as HTMLAnchorElement).href.split('#')[0]))].filter((h) => h.startsWith(location.origin)),
      );
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        const res = await request.get(url);
        expect(res.status(), url).toBe(200);
      }
    });
  }
});

