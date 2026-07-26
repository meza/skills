import { defineConfig, devices } from '@playwright/test';

// The fixed default keeps local runs and CI on one well-known port, but it can
// collide with anything that happens to hold it (an unrelated process using it
// as an outbound source port, or an orphaned server from a cancelled run).
// `reuseExistingServer: false` makes any such collision fatal, so allow an
// override. The port does not affect rendering, so snapshots are unchanged.
const DEFAULT_PORT = 4277;
const port = Number(process.env.PORT ?? DEFAULT_PORT);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01
    }
  },
  testDir: 'tests/visual',
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run serve:visual',
    env: { PORT: String(port) },
    reuseExistingServer: false,
    timeout: 240_000,
    url: baseURL
  },
  workers: 1,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }
    }
  ]
});
