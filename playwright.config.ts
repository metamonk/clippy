import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for Tauri App
 *
 * This configuration is optimized for testing clippy as a native macOS application.
 * Tests run against the actual Tauri app, not mocked components.
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* Run tests in files in parallel */
  fullyParallel: false, // Tauri apps may have state, run sequentially for stability

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : 1, // Single worker for Tauri tests

  /* Reporter to use */
  reporter: [
    ['html'],
    ['list'],
    ['json', { outputFile: 'test-results/e2e-results.json' }]
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL for Tauri app */
    // Note: Tauri apps don't use typical localhost URLs
    // We'll handle app launch in test fixtures

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        // Tauri uses system WebView (WebKit on macOS)
      },
    },
  ],

  /* Test timeout */
  timeout: 60000, // 60 seconds for E2E tests (video processing can be slow)

  /* Expect timeout */
  expect: {
    timeout: 10000, // 10 seconds for assertions
  },
});
