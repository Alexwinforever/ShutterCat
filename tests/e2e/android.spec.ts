import { test, expect } from './fixture';

test('Android shield sync follows the selected companion and survives reload', async ({ page }) => {
  await page.addInitScript(() => {
    window.MeowAndroid = { postMessage: raw => {
      const message = JSON.parse(raw);
      if (message.action === 'sync') {
        (window as unknown as { shieldCat: string }).shieldCat = message.payload.activeCat;
      }
    }};
  });
  const syncedCat = () => page.evaluate(() => (window as unknown as { shieldCat: string }).shieldCat);
  await page.goto('/');
  await expect.poll(syncedCat).toBe('cloud');
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '猫猫小窝' }).click();
  await page.getByRole('button', { name: '遇见一只猫猫 · 100 喵币' }).click();
  await page.getByRole('button', { name: '让它做我的陪伴官' }).click();
  const state = (await (await page.request.get('/api/state')).json()).state;
  expect(state.activeCat).not.toBe('cloud');
  await expect.poll(syncedCat).toBe(state.activeCat);
  await page.reload();
  await expect.poll(syncedCat).toBe(state.activeCat);
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '猫猫小窝' }).click();
  await page.locator('.cat-card').first().click();
  await page.getByRole('button', { name: '让它做我的陪伴官' }).click();
  await expect.poll(syncedCat).toBe('cloud');
});

test('Android native bridge receives tasks and renders actual guard status', async ({ page }) => {
  await page.addInitScript(() => {
    const messages: { action: string; payload?: unknown }[] = [];
    (window as unknown as { nativeMessages: typeof messages }).nativeMessages = messages;
    window.MeowAndroid = { postMessage: raw => {
      const message = JSON.parse(raw); messages.push(message);
      if (message.action === 'status' || message.action === 'sync') {
        window.meowNativeReply?.({ authorized: true, selectedCount: 2, guardEnabled: false, serviceRunning: true, platform: 'android' });
      }
      if (message.action === 'authorize') window.meowNativeReply?.({ authorized: true, selectedCount: 2, guardEnabled: true, serviceRunning: true });
      if (message.action === 'disableGuard') window.meowNativeReply?.({ authorized: true, selectedCount: 2, guardEnabled: false, serviceRunning: true });
    }};
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.locator('.coin-pill strong')).toHaveText('200');
  await expect(page.locator('.page-footer')).toContainText('Android 客户端');
  await page.getByRole('button', { name: '专注守护设置', exact: true }).click();
  await expect(page.getByText(/无障碍权限：已开启.*守护：未运行/)).toBeVisible();
  await page.getByRole('button', { name: '开启安卓专注守护', exact: true }).click();
  await expect(page.getByText(/无障碍权限：已开启.*守护：运行中/)).toBeVisible();
  await page.getByRole('button', { name: '选择需要守护的 App', exact: true }).click();
  await page.getByRole('button', { name: '关闭守护（不结算任务）', exact: true }).click();
  await expect(page.getByText(/守护：未运行/)).toBeVisible();
  const actions = await page.evaluate(() => (window as unknown as { nativeMessages: { action: string }[] }).nativeMessages.map(m => m.action));
  expect(actions).toEqual(expect.arrayContaining(['status', 'sync', 'authorize', 'selectApps', 'disableGuard']));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(page.locator('.coin-pill strong')).toHaveText('200');
});

test('Android resume refreshes tasks and forwards settled state to native', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { syncs: unknown[] }).syncs = [];
    window.MeowAndroid = { postMessage: raw => {
      const message = JSON.parse(raw);
      if (message.action === 'sync') (window as unknown as { syncs: unknown[] }).syncs.push(message.payload.tasks);
    }};
  });
  await page.goto('/');
  await expect(page.locator('.coin-pill strong')).toHaveText('200');
  const response = await page.request.post('/api/tasks', { data: { title: '安卓恢复同步测试', scheduledAt: new Date(Date.now() + 60000).toISOString(), proofMode: 'default' } });
  expect(response.ok()).toBeTruthy();
  const { task } = await response.json();
  await page.evaluate(() => window.dispatchEvent(new Event('meowNativeResume')));
  await expect.poll(() => page.evaluate(id => {
    const lists = (window as unknown as { syncs: { id: string }[][] }).syncs;
    return lists.at(-1)?.some(t => t.id === id) ?? false;
  }, task.id)).toBeTruthy();
});
