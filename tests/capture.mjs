import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ baseURL: 'http://127.0.0.1:8787', viewport: { width: 1440, height: 1060 } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:8787');
await page.locator('.coin-pill strong').filter({ hasText: '200' }).waitFor();
for (const [i, title] of ['写论文的第一段', '读 10 页书', '出门运动'].entries()) {
  await page.request.post('/api/tasks', { data: { title, scheduledAt: new Date(Date.now() + (i + 1) * 3600000).toISOString(), proofMode: 'default' } });
}
await page.reload();
await page.locator('.task-row').first().waitFor();
await page.screenshot({ path: 'artifacts/desktop-week.png', fullPage: true });
await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '猫猫小窝' }).click();
await page.screenshot({ path: 'artifacts/desktop-cats.png', fullPage: true });
await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: '常做的事' }).click();
await page.screenshot({ path: 'artifacts/desktop-templates.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('navigation', { name: '移动导航' }).getByRole('button', { name: '一周', exact: true }).click();
await page.screenshot({ path: 'artifacts/mobile-week.png', fullPage: true });
await page.getByRole('button', { name: '添加任务', exact: true }).click();
await page.getByLabel('我准备做什么').fill('写论文的第一段');
await page.screenshot({ path: 'artifacts/mobile-create.png' });
await page.getByRole('button', { name: '关闭', exact: true }).click();
await page.getByRole('navigation', { name: '移动导航' }).getByRole('button', { name: '猫猫小窝' }).click();
await page.screenshot({ path: 'artifacts/mobile-cats.png', fullPage: true });
await page.getByRole('navigation', { name: '移动导航' }).getByRole('button', { name: '常做的事' }).click();
await page.screenshot({ path: 'artifacts/mobile-templates.png', fullPage: true });
await page.request.post('/api/tasks', { data: { title: '拍下第一步', scheduledAt: new Date(Date.now() + 7000).toISOString(), proofMode: 'default' } });
await page.reload();
await page.getByRole('button', { name: '去提交开始凭证', exact: true }).waitFor({ timeout: 25000 });
await page.getByRole('button', { name: '去提交开始凭证', exact: true }).click();
await page.screenshot({ path: 'artifacts/mobile-proof.png' });
console.log('Saved desktop + mobile screenshots to artifacts/');
await browser.close();
