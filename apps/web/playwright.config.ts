import { defineConfig, devices } from '@playwright/test';

/**
 * pnpm e2e:web needs the API (seeded with pnpm db:seed) and the web app running
 * (pnpm dev in another terminal). Run pnpm e2e:install once to download Chromium,
 * or point PLAYWRIGHT_CHROMIUM_PATH at a Chromium you already have.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  // The tests share one seeded database and approve real recommendations.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    ...(executablePath && { launchOptions: { executablePath } }),
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
