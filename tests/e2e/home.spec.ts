import { expect, test } from '@playwright/test';

// The cover is a static drawing until the pop-up book gets a mechanics board (plan.md, phase 1).
test.describe('the cover and the contents', () => {
  test('the cover draws the launch, and the contents list every chapter of the course map', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    const art = page.locator('.cover-figure svg.cover-art');
    await expect(art).toBeVisible();
    // the track: one dot per 0.06 s over the 0.6 s fall, and four velocity arrows
    await expect(art.locator('.dots circle')).toHaveCount(11);
    await expect(art.locator('.arrows g')).toHaveCount(4);
    await expect(page.locator('h1')).toHaveText('מכניקה ויחסות פרטית');
    // chapters 0-10: the mathematical introduction, then the nine items of the 77101 syllabus (relativity in two)
    await expect(page.locator('.chapters > li.chapter')).toHaveCount(11);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('still mode draws the whole track at once', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('unimech:settings', JSON.stringify({ still: true, theme: 'auto' })));
    await page.goto('/');
    const last = page.locator('svg.cover-art .dots circle').last();
    await expect(last).toBeVisible();
    expect(await last.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  });
});
