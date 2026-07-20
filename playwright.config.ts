import { defineConfig, devices } from '@playwright/test';

const iphone15ProViewport = { width: 393, height: 852 };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: iphone15ProViewport,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'iphone-chromium', use: { ...devices['Desktop Chrome'], channel: 'msedge', viewport: iphone15ProViewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 15 Pro'], viewport: iphone15ProViewport } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
