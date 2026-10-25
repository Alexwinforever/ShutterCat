import { test, expect } from './fixture';

test('three credits, concurrent retry, payment gate, and same-day check-in', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.coin-pill strong')).toHaveText('200');
  const task = (key: string) => page.request.post('/api/tasks', { data: { key, title: '测试提醒', scheduledAt: new Date(Date.now() + 600000).toISOString(), proofMode: 'default' } });
  const [a, b] = await Promise.all([task('one'), task('one')]);
  expect(a.ok()).toBeTruthy(); expect(b.ok()).toBeTruthy();
  expect((await a.json()).task.id).toBe((await b.json()).task.id);
  expect((await task('two')).ok()).toBeTruthy();
  expect((await task('three')).ok()).toBeTruthy();
  expect((await task('four')).status()).toBe(402);
  const invalid = await page.request.post('/api/tasks', { data: { title: '', scheduledAt: 'invalid' } });
  expect(invalid.status()).toBe(400);
  const state = (await (await page.request.get('/api/state')).json()).state;
  expect(state.tasks).toHaveLength(3); expect(state.reminderCredits).toBe(0);
  await page.reload();
  await page.locator('.membership-entry').click();
  await expect(page.getByText('免费提醒剩余 0 次', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: '今日签到', exact: true }).click();
  await expect(page.getByRole('button', { name: '今日已签到' })).toBeDisabled();
  await page.request.post('/api/check-in');
  const checked = (await (await page.request.get('/api/state')).json()).state;
  expect(checked.checkIn.streak).toBe(1); expect(checked.reminderCredits).toBe(0);
  await expect(page.getByRole('button', { name: '订阅', exact: true })).toHaveCount(3);
  for (const button of await page.getByRole('button', { name: '订阅', exact: true }).all()) await expect(button).toBeDisabled();
});

test('old recovery endpoints cannot switch an authenticated account', async ({ page }) => {
  expect((await page.request.post('/api/account/recovery')).status()).toBe(410);
  expect((await page.request.post('/api/account/restore', { data: { recoveryCode: 'meow-' + '0'.repeat(64) } })).status()).toBe(410);
});

test('forged purchase does not activate subscription when Play is unconfigured', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('.coin-pill strong')).toHaveText('200');
  const response = await page.request.post('/api/billing/verify', { data: { purchaseToken: 'forged-token', expiresAt: '2099-01-01', productId: 'shuttercat_yearly' } });
  expect(response.status()).toBe(503);
  expect((await (await page.request.get('/api/state')).json()).state.subscription).toBeUndefined();
});
