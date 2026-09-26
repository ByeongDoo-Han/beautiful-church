import { defineConfig, devices } from '@playwright/test';
import { TEST_PASSWORD_HASH } from './tests/helpers/credentials';
const port = Number(process.env.PLAYWRIGHT_PORT || 3100);
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 60000,
  expect: { timeout: 15000 }, reporter: [['list']],
  use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1512, height: 982 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: `npm start -- --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 60000,
    env: { BLOB_READ_WRITE_TOKEN: '', SESSION_SECRET: 'test-only-secret-that-is-at-least-32-characters', ADMIN_PASSWORD_HASH: TEST_PASSWORD_HASH },
  },
});
