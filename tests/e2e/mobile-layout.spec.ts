import { test, expect, type Page } from './fixture';
import { CATS, initialState } from '../../shared/domain';

async function contained(page: Page, selector: string) {
  const failures = await page.locator(selector).evaluateAll(elements => elements.flatMap(element => {
    const r = element.getBoundingClientRect();
    if (!r.width || !r.height) return [];
    const problems = [];
    if (r.left < -1 || r.right > document.documentElement.clientWidth + 1) problems.push('outside viewport');
    if (element.scrollWidth > element.clientWidth + 1) problems.push('clipped content');
    return problems.length ? [{ element: element.className, problems }] : [];
  }));
  expect(failures, selector).toEqual([]);
}

test.describe('mobile PNG layout', () => {
  test.use({ isMobile: true, hasTouch: true });
  for (const width of [320, 360, 390, 414, 480]) {
    test(`content and five cats fit at ${width}px in every language`, async ({ page }) => {
      await page.setViewportSize({ width, height: 896 });
      const state = initialState();
      state.ownedCats = CATS.map(cat => cat.id);
      await page.route('**/api/state', route => route.fulfill({ json: { state } }));
      for (const language of ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es']) {
        await page.goto('/');
        await page.evaluate(locale => localStorage.setItem('shuttercat.locale', locale), language);
        await page.reload();
        await expect(page.locator('.hero-panel')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        for (let tab = 0; tab < 3; tab++) {
          await page.locator('.mobile-nav button').nth(tab).click();
          await contained(page, '.topbar, .topbar-actions > button, .page-heading, .page-heading > button, .week-panel, .hero-copy, .hero-art, .companion-panel, .template-card, .cat-card, .mobile-nav button, .collection-copy');
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
          expect(await page.evaluate(() => Math.abs((visualViewport?.width ?? innerWidth) - document.documentElement.clientWidth) < 1)).toBeTruthy();
          if (tab === 0) {
            const fits = await page.locator('.companion-art img').evaluate(img => {
              const image = img.getBoundingClientRect(), frame = img.parentElement!.getBoundingClientRect();
              const title = document.querySelector('.companion-panel h3')!.getBoundingClientRect();
              return image.right <= frame.right + 1 && image.bottom <= frame.bottom + 1 && image.bottom <= title.top;
            });
            expect(fits).toBeTruthy();
            if (width === 414 && language === 'en') await page.screenshot({ path: 'artifacts/mobile-layout-414-en.png', fullPage: true });
          }
          if (tab === 2) {
            const cats = page.locator('.cat-card-art img');
            await expect(cats).toHaveCount(5);
            await expect.poll(() => cats.evaluateAll(imgs => imgs.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBeTruthy();
            for (let i = 0; i < 5; i++) {
              await page.locator('.cat-card').nth(i).click();
              await contained(page, '.modal, .cat-reveal img, .cat-detail button');
              await page.keyboard.press('Escape');
            }
            if (width === 414 && language === 'en') await page.screenshot({ path: 'artifacts/mobile-cats-414-en.png', fullPage: true });
          }
        }
      }
    });
  }
});
