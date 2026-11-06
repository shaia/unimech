import { defineConfig, devices } from '@playwright/test';

// Local runs and CI both use Playwright's own Chromium. Local Edge hung at browser shutdown, so a run never exited.
// After upgrading @playwright/test, run `npx playwright install chromium` once, or every test fails at launch.
// one preview server per checkout: parallel worktrees each set their own E2E_PORT
const port = Number(process.env.E2E_PORT ?? 4351);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // a whole-run ceiling: a browser that hangs on shutdown must fail the run, not stall CI
  globalTimeout: 25 * 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // tests run against the built site, exactly what GitHub Pages serves
    command: `npx astro preview --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
