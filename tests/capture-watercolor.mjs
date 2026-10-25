import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Fresh anonymous context: never modifies the user's existing tasks or images.
const output = 'artifacts/watercolor-v1';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:8787', viewport: { width: 1440, height: 1060 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.coin-pill strong')).toHaveText('200');
  // Tomorrow avoids midnight boundary failures when capturing sample tasks.
  const day = new Date();
  day.setDate(day.getDate() + 1);
  day.setHours(9, 0, 0, 0);
  for (const [i, title] of ['写论文的第一段', '读 10 页书', '出门运动'].entries()) {
    const result = await page.request.post('/api/tasks', { data: { title, scheduledAt: new Date(day.getTime() + i * 3600000).toISOString(), proofMode: 'default' } });
    expect(result.ok()).toBeTruthy();
  }
  await page.reload();
  await expect(page.locator('.coin-pill strong')).toHaveText('200');
  const tomorrowLabel = `${day.getMonth() + 1}月${day.getDate()}日`;
  // Sunday's tomorrow is outside the current week.
  if (!await page.getByRole('button', { name: tomorrowLabel, exact: true }).count()) {
    await page.getByRole('button', { name: '下一周', exact: true }).click();
  }
  await page.getByRole('button', { name: tomorrowLabel, exact: true }).click();
  await expect(page.locator('.task-row')).toHaveCount(3);
  await page.screenshot({ path: `${output}/desktop-week.png`, fullPage: true });
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('navigation', { name: '移动导航' }).getByRole('button', { name: '一周', exact: true }).click();
    await page.screenshot({ path: `${output}/mobile-${width}-week.png`, fullPage: true });
    const hero = await page.locator('.hero-panel').boundingBox();
    const copy = await page.locator('.hero-copy').boundingBox();
    const art = await page.locator('.hero-art').boundingBox();
    expect(hero.height).toBeLessThan(300);
    expect(copy.x + copy.width).toBeLessThanOrEqual(art.x + 1);
    for (const [tab, file] of [['常做的事', 'templates'], ['猫猫小窝', 'cats']]) {
      await page.getByRole('navigation', { name: '移动导航' }).getByRole('button', { name: tab, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      if (width === 390) await page.screenshot({ path: `${output}/mobile-${file}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('navigation', { name: '移动导航' }).getByRole('button', { name: '一周', exact: true }).click();
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await page.getByLabel('我准备做什么').fill('写论文的第一段');
  await page.screenshot({ path: `${output}/mobile-create.png` });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '专注守护设置', exact: true }).click();
  await page.screenshot({ path: `${output}/mobile-shield.png` });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const proof = await page.request.post('/api/tasks', { data: { title: '拍下第一步', scheduledAt: new Date(Date.now() + 7000).toISOString(), proofMode: 'default' } });
  expect(proof.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: '去提交开始凭证', exact: true }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: '去提交开始凭证', exact: true }).click();
  await page.screenshot({ path: `${output}/mobile-proof.png` });
  expect(errors).toEqual([]);
  console.log(`Screenshots: ${output}; 360/390px layouts checked; no page errors.`);
} finally {
  await browser.close();
}
