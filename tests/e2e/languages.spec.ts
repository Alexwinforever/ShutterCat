import { test, expect } from './fixture';

const choices = [
  ['zh-CN', '简体中文', '把想做的，变成开始的'],
  ['zh-TW', '繁體中文', '把想做的，變成開始的'],
  ['en', 'English', 'Turn someday into a start'],
  ['ja', '日本語', '「いつか」を、最初の一歩に'],
  ['ko', '한국어', '하고 싶은 일을 시작으로'],
  ['es', 'Español', 'Convierte tus ganas en un comienzo'],
];

test('all languages fit mobile navigation and preserve user text', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.locator('.coin-pill strong')).toHaveText('200');
  const response = await page.request.post('/api/tasks', { data: { title: 'My 自定义 task', scheduledAt: new Date(Date.now() + 60000).toISOString(), proofMode: 'custom', proof: 'Keep my original text' } });
  expect(response.ok()).toBeTruthy();
  for (const [code, name, heading] of choices) {
    await page.locator('.settings-button').click();
    await page.getByRole('radio', { name, exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('lang', code);
    await expect(page.locator('.page-heading h1')).toContainText(heading);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.keyboard.press('Escape');
    for (let tab = 0; tab < 3; tab++) {
      await page.locator('.mobile-nav button').nth(tab).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    }
    await page.locator('.mobile-nav button').first().click();
  }
  const state = (await (await page.request.get('/api/state')).json()).state;
  expect(state.tasks[0]).toMatchObject({ title: 'My 自定义 task', proof: 'Keep my original text' });
});

test('native language is restored and receives changes from settings', async ({ page }) => {
  await page.addInitScript((platform: string) => {
    localStorage.setItem('shuttercat.locale', 'en');
    let language = 'es';
    const receive = (message: { action: string; payload?: { language: string } }) => {
      if (message.action === 'setLanguage') language = message.payload!.language;
      if (message.action === 'status' || message.action === 'sync') window.meowNativeReply?.({ authorized: false, selectedCount: 0, locale: language });
    };
    if (platform === 'android') {
      (window as unknown as { MeowAndroid: { postMessage: (raw: string) => void } }).MeowAndroid = { postMessage: raw => receive(JSON.parse(raw)) };
    } else window.webkit = { messageHandlers: { meow: { postMessage: message => receive(message as Parameters<typeof receive>[0]) } } };
  }, 'android');
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.locator('.settings-button').click();
  await page.getByRole('radio', { name: '日本語', exact: true }).check();
  await page.evaluate(() => {
    const bridge = (window as unknown as { MeowAndroid?: { postMessage: (raw: string) => void } }).MeowAndroid;
    if (bridge) bridge.postMessage(JSON.stringify({ action: 'status' }));
    else window.webkit?.messageHandlers?.meow?.postMessage({ action: 'status' });
  });
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  expect(await page.evaluate(() => localStorage.getItem('shuttercat.locale'))).toBe('ja');
});
