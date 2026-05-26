import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/visual',
  use: {
    baseURL: 'http://127.0.0.1:4177',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run serve:visual',
    reuseExistingServer: true,
    timeout: 120_000,
    url: 'http://127.0.0.1:4177'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }
    }
  ]
});
