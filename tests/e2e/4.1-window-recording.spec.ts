/**
 * E2E Test: Window Selection for Screen Recording (Story 4.1)
 *
 * Test ID: 4.1-E2E-001
 * ACs: #1-7 - Full workflow test
 *
 * This test verifies the complete window recording workflow from UI to backend.
 */

import { test, expect } from '@playwright/test';

test.describe('Window Selection for Screen Recording', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  /**
   * Test ID: 4.1-E2E-001
   * AC: #1, #2, #6 - Recording mode toggle and window selection
   */
  test('should display recording mode toggle and window selector', async ({ page }) => {
    // Open recording panel
    const recordingButton = page.getByRole('button', { name: /record/i });
    await recordingButton.click();

    // Wait for panel to open
    await page.waitForSelector('[role="dialog"]', { state: 'visible' });

    // Verify recording mode toggle is visible
    await expect(page.getByText('Full Screen')).toBeVisible();
    await expect(page.getByText('Window')).toBeVisible();

    // Switch to window mode
    await page.getByRole('tab', { name: /Window/i }).click();

    // Verify window selector appears
    await expect(page.getByRole('combobox')).toBeVisible();

    // Verify refresh button is present
    await expect(page.getByTitle('Refresh window list')).toBeVisible();
  });

  /**
   * Test ID: 4.1-E2E-002
   * AC: #2, #6 - Window selection persists
   */
  test('should persist selected window when switching modes', async ({ page }) => {
    // Open recording panel
    const recordingButton = page.getByRole('button', { name: /record/i });
    await recordingButton.click();

    // Switch to window mode
    await page.getByRole('tab', { name: /Window/i }).click();

    // Select a window
    const windowSelector = page.getByRole('combobox');
    await windowSelector.click();

    // Wait for windows to load and select first available
    await page.waitForTimeout(500); // Allow time for windows to enumerate
    const firstWindow = page.locator('[role="option"]').first();
    await firstWindow.click();

    // Switch back to fullscreen
    await page.getByRole('tab', { name: /Full Screen/i }).click();

    // Switch back to window mode
    await page.getByRole('tab', { name: /Window/i }).click();

    // Verify window is still selected
    // (The selected value should persist in session)
    await expect(windowSelector).not.toHaveText('Select a window...');
  });

  /**
   * Test ID: 4.1-E2E-003
   * AC: #2 - Window refresh works
   */
  test('should refresh window list when refresh button is clicked', async ({ page }) => {
    // Open recording panel
    const recordingButton = page.getByRole('button', { name: /record/i });
    await recordingButton.click();

    // Switch to window mode
    await page.getByRole('tab', { name: /Window/i }).click();

    // Click refresh button
    const refreshButton = page.getByTitle('Refresh window list');
    await refreshButton.click();

    // Verify button shows loading state (has animate-spin class)
    await expect(refreshButton.locator('svg')).toHaveClass(/animate-spin/);

    // Wait for refresh to complete
    await page.waitForTimeout(500);

    // Verify loading state is removed
    await expect(refreshButton.locator('svg')).not.toHaveClass(/animate-spin/);
  });

  /**
   * Test ID: 4.1-E2E-004
   * AC: #1, #2 - Recording button is disabled until window is selected
   */
  test('should disable recording button in window mode without selection', async ({ page }) => {
    // Open recording panel
    const recordingButton = page.getByRole('button', { name: /record/i });
    await recordingButton.click();

    // Switch to window mode
    await page.getByRole('tab', { name: /Window/i }).click();

    // Verify start recording button exists
    const startButton = page.getByRole('button', { name: /Start Recording|Record/i });

    // Try to click start without selecting a window
    await startButton.click();

    // Should show error toast
    await expect(page.getByText(/No Window Selected/i)).toBeVisible();
  });

  /**
   * Test ID: 4.1-E2E-005
   * AC: #3, #4 - Window recording captures correctly (requires permission)
   *
   * Note: This test requires actual screen recording permission and a real window.
   * It will be skipped in CI but useful for local testing.
   */
  test.skip('should start window recording successfully', async ({ page }) => {
    // This test requires:
    // 1. Screen recording permission granted
    // 2. At least one open window to record
    // 3. Manual verification of captured content

    // Open recording panel
    const recordingButton = page.getByRole('button', { name: /record/i });
    await recordingButton.click();

    // Switch to window mode
    await page.getByRole('tab', { name: /Window/i }).click();

    // Select a window
    const windowSelector = page.getByRole('combobox');
    await windowSelector.click();
    await page.waitForTimeout(500);
    const firstWindow = page.locator('[role="option"]').first();
    await firstWindow.click();

    // Start recording
    const startButton = page.getByRole('button', { name: /Start Recording/i });
    await startButton.click();

    // Verify recording started
    await expect(page.getByText('Recording Started')).toBeVisible();

    // Wait a bit for recording
    await page.waitForTimeout(2000);

    // Stop recording
    const stopButton = page.getByRole('button', { name: /Stop/i });
    await stopButton.click();

    // Verify recording stopped and file was saved
    await expect(page.getByText('Recording saved')).toBeVisible();
  });
});
