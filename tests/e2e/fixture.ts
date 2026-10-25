import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const password = 'Test account password 2026';
export const test = base.extend({
  page: async ({ page }, use) => {
    const email = randomUUID() + '@example.com';
    const seed = await page.request.post('/__test__/seed', { data: { email, password } });
    expect(seed.ok()).toBeTruthy();
    const login = await page.request.post('/api/auth/login', { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    await use(page);
  },
});
export { expect };
export type { Page } from '@playwright/test';
