import { test, expect, type Page } from './fixture';
import { createHash } from 'node:crypto';

test('language can be switched, saved, and returned to system language', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByText('English', { exact: true }).click();
  await expect(page.getByRole('heading', { name: /Turn someday into a start/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Turn someday into a start/ })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Follow system', { exact: true }).click();
  await expect(page.getByRole('heading', { name: /把想做的，变成开始的/ })).toBeVisible();
});

async function schedule(page: Page, title: string, seconds = 7) {
  const response = await page.request.post('/api/tasks', { data: { title, scheduledAt: new Date(Date.now() + seconds * 1000).toISOString(), proofMode: 'default' } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).task;
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8hQAAAAASUVORK5CYII=', 'base64');

test('create custom task, reuse template, and persist after reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '把想做的，变成开始的。' })).toBeVisible();
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await page.getByLabel('我准备做什么').fill('写研究论文');
  await page.getByRole('button', { name: '自己填写', exact: true }).click();
  await page.getByLabel('自定义凭证要求').fill('拍下已经写了摘要的文档');
  await page.getByLabel('保存为「常做的事」').check();
  const tomorrow = new Date(Date.now() + 86400000);
  await page.getByLabel('开始日期').fill(`${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`);
  await page.getByRole('button', { name: '和自己约定好' }).click();
  await expect(page.getByRole('status')).toContainText('约定好啦');
  await page.reload();
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '常做的事' }).click();
  const card = page.locator('.template-card').filter({ has: page.getByRole('heading', { name: '写研究论文', exact: true }) });
  await expect(card).toContainText('拍下已经写了摘要的文档');
  await card.getByRole('button', { name: '安排一次' }).click();
  await expect(page.getByLabel('我准备做什么')).toHaveValue('写研究论文');
  await expect(page.getByLabel('自定义凭证要求')).toHaveValue('拍下已经写了摘要的文档');
});

test('photo completion and escape are single-settlement and session-isolated', async ({ page, browser }) => {
  await page.goto('/');
  await expect(page.locator('.coin-pill strong')).toHaveText('200');
  const first = await schedule(page, '写论文');
  const second = await schedule(page, '出门运动');
  await expect.poll(async () => {
    const result = await (await page.request.get('/api/state')).json();
    return result.state.tasks.filter((t: { status: string }) => t.status === 'waiting_proof').length;
  }, { timeout: 13000, intervals: [1000] }).toBe(2);
  const invalid = await page.request.post(`/api/tasks/${first.id}/proof`, { multipart: { storage: 'cloud', confirmed: 'true', hash: 'a'.repeat(64), photo: { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') } } });
  expect(invalid.status()).toBe(400);
  const form = { storage: 'local', confirmed: 'true', hash: createHash('sha256').update(png).digest('hex') };
  const [a, b] = await Promise.all([page.request.post(`/api/tasks/${first.id}/proof`, { multipart: form }), page.request.post(`/api/tasks/${first.id}/proof`, { multipart: form })]);
  expect(a.status()).toBe(200); expect(b.status()).toBe(200);
  const state = (await (await page.request.get('/api/state')).json()).state;
  expect(state.coins).toBe(250);
  expect(state.ledger.filter((entry: { taskId: string }) => entry.taskId === first.id)).toHaveLength(1);
  expect((await page.request.get(`/api/proofs/${first.id}`)).status()).toBe(404);
  const stranger = await browser.newContext();
  expect((await stranger.request.get(`http://127.0.0.1:8787/api/proofs/${first.id}`)).status()).toBe(401);
  await stranger.close();
  expect((await page.request.post(`/api/tasks/${first.id}/escape`, { data: { confirm: true } })).status()).toBe(409);
  await page.reload();
  await page.locator('.task-row').filter({ hasText: '出门运动' }).click();
  await page.getByRole('button', { name: /这次先放下，接受/ }).click();
  await page.getByRole('button', { name: '接受惩罚，放下这次任务' }).click();
  await expect(page.locator('.coin-pill strong')).toHaveText('150');
  await page.request.post(`/api/tasks/${second.id}/escape`, { data: { confirm: true } });
  expect((await (await page.request.get('/api/state')).json()).state.coins).toBe(150);
  expect((await page.request.delete(`/api/proofs/${first.id}`)).status()).toBe(200);
  expect((await page.request.get(`/api/proofs/${first.id}`)).status()).toBe(404);
});

test('upload real photo through UI with local-only persistence', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.coin-pill strong')).toHaveText('200');
  const task = await schedule(page, '整理书桌');
  await expect.poll(async () => (await (await page.request.get('/api/state')).json()).state.tasks[0].status, { timeout: 13000, intervals: [1000] }).toBe('waiting_proof');
  await page.reload();
  await page.locator('.task-row').filter({ hasText: '整理书桌' }).click();
  await page.getByLabel('选择凭证照片').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByAltText('将要提交的任务凭证照片')).toBeVisible();
  await page.getByLabel('我确认照片展示了任务已经开始').check();
  await page.getByRole('button', { name: '提交照片，领取 50 喵币' }).click();
  await expect(page.locator('.coin-pill strong')).toHaveText('250');
  const stored = (await (await page.request.get('/api/state')).json()).state.tasks[0];
  expect(stored.proofStorage).toBe('local'); expect(stored.proofKey).toBeUndefined();
  expect((await page.request.get(`/api/proofs/${task.id}`)).status()).toBe(404);
  await page.locator('.task-row').filter({ hasText: '整理书桌' }).click();
  await expect(page.getByAltText('已提交的任务凭证')).toBeVisible();
});

test('cat draw, active companion, insufficient funds and transparent web Shield', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.coin-pill strong')).toHaveText('200');
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '猫猫小窝' }).click();
  await expect(page.locator('.cat-card')).toHaveCount(5);
  await expect(page.locator('.cat-card img.cat-art')).toHaveCount(5);
  await page.getByRole('button', { name: '遇见一只猫猫 · 100 喵币' }).click();
  await expect(page.getByRole('heading', { name: '新朋友来啦！' })).toBeVisible();
  await page.getByRole('button', { name: '让它做我的陪伴官' }).click();
  await expect(page.locator('.coin-pill strong')).toHaveText('100');
  const state = (await (await page.request.get('/api/state')).json()).state;
  expect(state.ownedCats).toHaveLength(2); expect(state.activeCat).not.toBe('cloud');
  const key = crypto.randomUUID();
  await page.request.post('/api/draw', { data: { key } });
  await page.request.post('/api/draw', { data: { key } });
  expect((await (await page.request.get('/api/state')).json()).state.coins).toBe(0);
  expect((await page.request.post('/api/draw', { data: { key: crypto.randomUUID() } })).status()).toBe(400);
  await page.getByRole('button', { name: /专注守护/ }).click();
  await expect(page.getByText(/当前为网页体验版，无法申请/)).toBeVisible();
});

test('mobile navigation and layout have no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.coin-pill strong')).toHaveText('200');
  for (const tab of ['一周', '常做的事', '猫猫小窝']) {
    await page.getByRole('navigation', { name: '移动导航' }).getByRole('button', { name: tab, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.getByRole('navigation', { name: '移动导航' }).getByRole('button', { name: '一周', exact: true }).click();
  await page.getByRole('button', { name: '专注守护设置', exact: true }).click();
  await expect(page.getByText(/当前为网页体验版，无法申请/)).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('reject invalid task, forged cross-origin mutation, invalid photo and future completion', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.coin-pill strong')).toHaveText('200');
  expect((await page.request.post('/api/tasks', { data: { title: '', scheduledAt: 'no' } })).status()).toBe(400);
  expect((await page.request.post('/api/draw', { headers: { Origin: 'https://evil.invalid' }, data: { key: 'x' } })).status()).toBe(403);
  const task = await schedule(page, '写论文', 60);
  expect((await page.request.post(`/api/tasks/${task.id}/escape`, { data: { confirm: true } })).status()).toBe(409);
  expect((await page.request.post(`/api/tasks/${task.id}/proof`, { multipart: { confirmed: 'true', storage: 'local', hash: 'a'.repeat(64) } })).status()).toBe(409);
  expect((await (await page.request.get('/api/state')).json()).state.coins).toBe(200);
});
