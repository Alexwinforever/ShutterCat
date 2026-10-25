import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 8787);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  timeout: 45000,
  use: { locale: 'zh-CN', baseURL, channel: 'chrome', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node tests/e2e-server.mjs', url: baseURL + '/api/auth/me', reuseExistingServer: false, timeout: 60000 },
});
