import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — browser-based regression tests.
 *
 * Local: spins up `npm run dev`, runs tests against http://localhost:3000.
 * CI: same, but headless and with retries.
 */
// Production smoke is a separate spec file run only by the
// post-deploy.yml workflow (against https://objectlesson.la). The default
// `npm test` runs against localhost dev server, where the prod-smoke spec
// would fail / make no sense — exclude it.
const isProdSmoke =
  !!process.env.PLAYWRIGHT_BASE_URL &&
  process.env.PLAYWRIGHT_BASE_URL !== 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  testIgnore: isProdSmoke ? [] : ['**/production-smoke.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
