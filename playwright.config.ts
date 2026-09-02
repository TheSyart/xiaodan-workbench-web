import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'],['html',{open:'never'}]],
  use: { baseURL: 'http://127.0.0.1:3211/xiaodan/', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'desktop-1024', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } }
  ],
  webServer: {
    command: 'XIAODAN_BASE_PATH=/xiaodan npm run build -w @xiaodan/web && NODE_ENV=production HOST=127.0.0.1 PORT=3211 XIAODAN_BASE_PATH=/xiaodan XIAODAN_DATA_DIR=/tmp/xiaodan-playwright npm run start',
    url: 'http://127.0.0.1:3211/xiaodan/health/ready',
    reuseExistingServer: false,
    timeout: 20_000
  }
});
