import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:1421',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // E2E 전용 Vite dev server (tauri dev와 포트 분리)
  webServer: {
    command: 'npx vite --port 1421 --strictPort',
    port: 1421,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
