import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/visual',
  use: {
    baseURL: 'http://127.0.0.1:4277',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run serve:visual',
    env: { PORT: '4277' },
    reuseExistingServer: false,
    timeout: 120_000,
    url: 'http://127.0.0.1:4277'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }
    }
  ]
});
