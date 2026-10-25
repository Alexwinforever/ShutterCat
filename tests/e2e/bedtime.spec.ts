import { test, expect } from './fixture';

test('bedtime default has no photo requirement and an editable start time', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await page.getByRole('button', { name: '☾ 按时睡觉', exact: true }).click();
  await expect(page.getByText('无需照片，到点开启六小时睡眠守护', { exact: true })).toBeVisible();
  await expect(page.getByLabel('选择凭证照片')).toHaveCount(0);
  await page.getByLabel('我确认开始时间，理解开始后六小时内不能在 App 中解除').check();
  await page.getByRole('button', { name: '安排睡眠', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const data = await (await page.request.get('/api/state')).json();
  expect(data.state.tasks[0].kind).toBe('bedtime'); expect(data.state.tasks[0].reward).toBe(0);
  await page.getByRole('button', { name: '全部记录', exact: true }).click();
  await page.locator('.history-row').filter({ hasText: '按时睡觉' }).click();
  await page.getByRole('button', { name: '修改开始时间', exact: true }).click();
  await expect(page.getByRole('heading', { name: '修改睡眠时间', exact: true })).toBeVisible();
  await page.getByLabel('开始时间', { exact: true }).fill('22:30');
  const next = new Date(Date.now() + 2 * 86400000);
  const date = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  await page.getByLabel('开始日期', { exact: true }).fill(date);
  await page.getByLabel('我确认开始时间，理解开始后六小时内不能在 App 中解除').check();
  await page.getByRole('button', { name: '保存睡眠时间', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const updated = await (await page.request.get('/api/state')).json(); expect(updated.state.reminderCredits).toBe(2);
  expect(updated.state.tasks[0].scheduledAt).not.toBe(data.state.tasks[0].scheduledAt);
  await page.getByRole('button', { name: '常做的事', exact: true }).first().click();
  await expect(page.locator('.bedtime-template')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'artifacts/bedtime-template-mobile.png', fullPage: true });
});

test('Android requires enabled guard and an app selection before scheduling', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).MeowAndroid = { postMessage: (raw: string) => {
      if (['status', 'sync'].includes(JSON.parse(raw).action)) setTimeout(() => (window as any).meowNativeReply?.({ authorized: true, guardEnabled: true, serviceRunning: true, selectedCount: 0, bedtimeSupported: true }), 0);
    } };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await page.getByRole('button', { name: '☾ 按时睡觉', exact: true }).click();
  await page.getByLabel('我确认开始时间，理解开始后六小时内不能在 App 中解除').check();
  await expect(page.getByRole('button', { name: '安排睡眠', exact: true })).toBeDisabled();
  await expect(page.getByText('请先开启守护并选择娱乐 App', { exact: true })).toBeVisible();
});
