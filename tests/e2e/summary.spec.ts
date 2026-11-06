import { expect, test } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Every built chapter summary has its five sections, in order, and links back into the lessons. */

const DIST = join(import.meta.dirname, '../../dist/summary');
const PAGES = existsSync(DIST) ? readdirSync(DIST).map((d) => `/summary/${d}/`) : [];
const SECTIONS = ['הרעיון הגדול', 'מה חייבים לזכור', 'טעויות נפוצות', 'איך פותרים', 'רשימת בדיקה לפני מבחן'];

for (const path of PAGES) {
  test(`${path} has the five summary sections and links to lessons`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('.summary-body h2')).toHaveText(SECTIONS.map((s) => new RegExp(s)));
    expect(await page.locator('.summary-body a[href*="/lessons/"]').count()).toBeGreaterThan(0);
  });
}
