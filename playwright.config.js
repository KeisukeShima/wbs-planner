import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',

  // Run each test file serially to avoid localStorage conflicts
  fullyParallel: false,
  workers: 1,

  // Retry once on CI to reduce flakiness from timing
  retries: process.env.CI ? 1 : 0,

  use: {
    baseURL: 'http://localhost:8787',
    headless: true,
    // Give actions a generous timeout for a local single-file app
    actionTimeout: 5_000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Serve the project root with Python's built-in HTTP server.
  // No npm dependency required — Python 3 is assumed available.
  webServer: {
    command: 'python3 -m http.server 8787',
    port: 8787,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
