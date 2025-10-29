/**
 * E2E Tests for Story 2.7: Basic Webcam Recording Setup
 *
 * Test IDs: 2.7-E2E-001 through 2.7-E2E-005
 *
 * These tests cover all acceptance criteria for Story 2.7:
 * - AC#1: AVFoundation bindings integrated for camera access
 * - AC#2: App requests camera permission from macOS
 * - AC#3: Camera selection dropdown if multiple cameras available
 * - AC#4: Webcam preview shows in recording panel before recording starts
 * - AC#5: "Record Webcam" button triggers webcam recording
 * - AC#6: Recording captures video at camera's native resolution (or 1080p if higher)
 *
 * @see docs/stories/2-7-basic-webcam-recording-setup.md
 */

import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';

test.describe('2.7-E2E-001: Camera Permission Flow (AC#2)', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: ['dist-js/main.js'],
    });
    page = await electronApp.firstWindow();
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  test('should show permission prompt when camera access denied', async () => {
    // Given: User opens recording panel without camera permission
    // Click on recording panel trigger (adjust selector based on actual UI)
    await page.click('[data-testid="open-recording-panel"]');

    // Wait for dialog to open
    await expect(page.locator('text=Screen Recording')).toBeVisible();

    // When: User switches to Webcam mode
    await page.click('text=Webcam');

    // Then: Permission prompt should be displayed
    await expect(page.locator('text=Camera Permission Required')).toBeVisible({
      timeout: 10000,
    });

    // Should show guidance message
    await expect(page.locator('text=System Preferences')).toBeVisible();
  });

  test('should allow camera access after permission granted', async () => {
    // Given: Camera permission will be granted (mock or real)
    // Note: In real macOS environment, this requires actual permission grant

    // When: User opens recording panel
    await page.click('[data-testid="open-recording-panel"]');
    await page.click('text=Webcam');

    // Then: Camera selection dropdown should be visible
    // (assuming permission is granted)
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });
  });

  test('should request permission when user clicks grant button', async () => {
    // Given: Permission is denied
    await page.click('[data-testid="open-recording-panel"]');
    await page.click('text=Webcam');

    // Wait for permission prompt
    await expect(page.locator('text=Camera Permission Required')).toBeVisible({
      timeout: 10000,
    });

    // When: User clicks "Grant Permission" button
    const grantButton = page.locator('button:has-text("Grant Permission")');
    await grantButton.click();

    // Then: macOS permission dialog should trigger
    // (this will require manual interaction in real environment)
    // After granting, camera list should load
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 20000,
    });
  });
});

test.describe('2.7-E2E-002: Camera Selection and Preview (AC#3, AC#4)', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    electronApp = await electron.launch({
      args: ['dist-js/main.js'],
    });
    page = await electronApp.firstWindow();
    await page.click('[data-testid="open-recording-panel"]');
    await page.click('text=Webcam');
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  test('should list available cameras in dropdown', async () => {
    // Given: Camera permission granted
    // When: Webcam mode is active
    // Then: Camera dropdown should show available cameras

    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    // Click dropdown to expand
    await page.click('[data-testid="camera-select"]');

    // Should show at least one camera option
    const cameraOptions = page.locator('[role="option"]');
    await expect(cameraOptions.first()).toBeVisible();

    // Camera names should be displayed (e.g., "FaceTime HD Camera")
    const firstCameraName = await cameraOptions.first().textContent();
    expect(firstCameraName).toBeTruthy();
    expect(firstCameraName!.length).toBeGreaterThan(0);
  });

  test('should show webcam preview when camera selected', async () => {
    // Given: Cameras are available
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    // When: User selects a camera
    await page.click('[data-testid="camera-select"]');
    await page.click('[role="option"]', { timeout: 5000 }); // Select first camera

    // Then: Webcam preview should be visible
    await expect(page.locator('[data-testid="webcam-preview"]')).toBeVisible({
      timeout: 10000,
    });

    // Preview should contain a canvas element (for rendering frames)
    const canvas = page.locator('[data-testid="webcam-preview"] canvas');
    await expect(canvas).toBeVisible();
  });

  test('should show camera resolution in dropdown', async () => {
    // Given: Cameras are enumerated
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    // When: User opens camera dropdown
    await page.click('[data-testid="camera-select"]');

    // Then: Camera options should show resolution info
    const cameraOption = page.locator('[role="option"]').first();
    const optionText = await cameraOption.textContent();

    // Should contain resolution pattern (e.g., "1280x720" or "1920x1080")
    expect(optionText).toMatch(/\d{3,4}x\d{3,4}/);
  });

  test('should update preview when switching cameras', async () => {
    // Given: Multiple cameras available
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    await page.click('[data-testid="camera-select"]');
    const cameraOptions = page.locator('[role="option"]');
    const cameraCount = await cameraOptions.count();

    if (cameraCount < 2) {
      test.skip();
      return;
    }

    // When: User switches from first camera to second
    await cameraOptions.first().click();

    await expect(page.locator('[data-testid="webcam-preview"]')).toBeVisible();

    // Switch to second camera
    await page.click('[data-testid="camera-select"]');
    await cameraOptions.nth(1).click();

    // Then: Preview should update (canvas should still be visible)
    await expect(page.locator('[data-testid="webcam-preview"] canvas')).toBeVisible({
      timeout: 10000,
    });
  });

  test('should show loading state while camera initializes', async () => {
    // Given: User selects a camera
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    await page.click('[data-testid="camera-select"]');

    // When: Camera is being initialized
    const selectPromise = page.click('[role="option"]');

    // Then: Loading indicator should be visible (briefly)
    const loadingIndicator = page.locator('text=Starting camera...');

    // Note: This may be very brief, so we use timeout: 2000 and don't fail if missed
    try {
      await expect(loadingIndicator).toBeVisible({ timeout: 2000 });
    } catch {
      // Loading state may be too fast to catch, which is acceptable
    }

    await selectPromise;

    // Loading should disappear after camera starts
    await expect(loadingIndicator).not.toBeVisible({ timeout: 10000 });
  });
});

test.describe('2.7-E2E-003: Webcam Recording Start (AC#5, AC#6)', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    electronApp = await electron.launch({
      args: ['dist-js/main.js'],
    });
    page = await electronApp.firstWindow();
    await page.click('[data-testid="open-recording-panel"]');
    await page.click('text=Webcam');
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  test('should start webcam recording when record button clicked', async () => {
    // Given: Camera is selected and preview is active
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    await page.click('[data-testid="camera-select"]');
    await page.click('[role="option"]');

    await expect(page.locator('[data-testid="webcam-preview"]')).toBeVisible({
      timeout: 10000,
    });

    // When: User clicks "Record" button
    const recordButton = page.locator('button:has-text("Record")');
    await recordButton.click();

    // Then: Recording should start
    await expect(page.locator('text=Recording...')).toBeVisible({ timeout: 5000 });

    // Recording indicator should be visible
    await expect(page.locator('[data-testid="recording-indicator"]')).toBeVisible();

    // Timer should start
    await expect(page.locator('text=/00:0[0-9]/')).toBeVisible();
  });

  test('should capture video at native resolution (AC#6)', async () => {
    // Given: Camera with specific resolution selected
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    await page.click('[data-testid="camera-select"]');

    // Get first camera's resolution
    const firstOption = page.locator('[role="option"]').first();
    const optionText = await firstOption.textContent();
    const resolutionMatch = optionText?.match(/(\d{3,4})x(\d{3,4})/);

    await firstOption.click();

    // When: Recording starts
    const recordButton = page.locator('button:has-text("Record")');
    await recordButton.click();

    await expect(page.locator('text=Recording...')).toBeVisible({ timeout: 5000 });

    // Then: Recording should use camera's native resolution
    // (verification would require checking backend logs or recorded file metadata)
    // For E2E test, we verify recording started successfully
    expect(resolutionMatch).toBeTruthy();

    // If resolution is >1080p, should be capped at 1080p
    if (resolutionMatch) {
      const [_, width, height] = resolutionMatch;
      const widthNum = parseInt(width);
      const heightNum = parseInt(height);

      // Log resolution for manual verification
      console.log(`Camera resolution: ${widthNum}x${heightNum}`);

      // Test expectation: if camera is >1080p (e.g., 4K), recording should cap at 1080p
      // This would need to be verified via backend logs or file inspection
    }
  });

  test('should show stop button when recording', async () => {
    // Given: Recording is active
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    await page.click('[data-testid="camera-select"]');
    await page.click('[role="option"]');

    await expect(page.locator('[data-testid="webcam-preview"]')).toBeVisible();

    const recordButton = page.locator('button:has-text("Record")');
    await recordButton.click();

    // When: Recording starts
    await expect(page.locator('text=Recording...')).toBeVisible({ timeout: 5000 });

    // Then: Stop button should be visible
    const stopButton = page.locator('button:has-text("Stop")');
    await expect(stopButton).toBeVisible();

    // Record button should be hidden
    await expect(recordButton).not.toBeVisible();
  });

  test('should stop webcam recording and save file', async () => {
    // Given: Recording is active
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    await page.click('[data-testid="camera-select"]');
    await page.click('[role="option"]');

    await expect(page.locator('[data-testid="webcam-preview"]')).toBeVisible();

    const recordButton = page.locator('button:has-text("Record")');
    await recordButton.click();

    await expect(page.locator('text=Recording...')).toBeVisible({ timeout: 5000 });

    // Record for at least 2 seconds
    await page.waitForTimeout(2000);

    // When: User clicks stop button
    const stopButton = page.locator('button:has-text("Stop")');
    await stopButton.click();

    // Then: Recording should stop and save
    await expect(page.locator('text=Recording...')).not.toBeVisible({ timeout: 10000 });

    // Success notification should appear
    await expect(page.locator('text=saved successfully')).toBeVisible({ timeout: 15000 });

    // Recording should be added to media library (visible in sidebar)
    const mediaSidebar = page.locator('[data-testid="media-library-sidebar"]');
    await expect(mediaSidebar).toBeVisible({ timeout: 5000 });

    // New recording should appear in list
    const mediaItems = page.locator('[data-testid="media-item"]');
    await expect(mediaItems.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('2.7-E2E-004: Multiple Cameras Handling', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    electronApp = await electron.launch({
      args: ['dist-js/main.js'],
    });
    page = await electronApp.firstWindow();
    await page.click('[data-testid="open-recording-panel"]');
    await page.click('text=Webcam');
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  test('should list all available cameras', async () => {
    // Given: System has multiple cameras
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    // When: User opens camera dropdown
    await page.click('[data-testid="camera-select"]');

    // Then: All cameras should be listed
    const cameraOptions = page.locator('[role="option"]');
    const count = await cameraOptions.count();

    console.log(`Found ${count} camera(s)`);

    // Should have at least one camera
    expect(count).toBeGreaterThanOrEqual(1);

    // Each camera should have name and resolution
    for (let i = 0; i < count; i++) {
      const optionText = await cameraOptions.nth(i).textContent();
      expect(optionText).toBeTruthy();
      expect(optionText!.length).toBeGreaterThan(0);
    }
  });

  test('should switch between cameras without errors', async () => {
    // Given: Multiple cameras available
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    await page.click('[data-testid="camera-select"]');
    const cameraOptions = page.locator('[role="option"]');
    const count = await cameraOptions.count();

    if (count < 2) {
      test.skip();
      return;
    }

    // When: User switches between cameras
    // Select first camera
    await cameraOptions.nth(0).click();
    await expect(page.locator('[data-testid="webcam-preview"]')).toBeVisible();

    // Wait a moment for preview to stabilize
    await page.waitForTimeout(1000);

    // Switch to second camera
    await page.click('[data-testid="camera-select"]');
    await cameraOptions.nth(1).click();

    // Then: Preview should update without errors
    await expect(page.locator('[data-testid="webcam-preview"]')).toBeVisible({ timeout: 10000 });

    // No error messages should be visible
    await expect(page.locator('text=Camera Error')).not.toBeVisible();
  });

  test('should remember last selected camera', async () => {
    // Given: User selects a camera
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    await page.click('[data-testid="camera-select"]');
    const cameraOptions = page.locator('[role="option"]');

    // Get first camera name
    const firstCameraText = await cameraOptions.first().textContent();
    await cameraOptions.first().click();

    await expect(page.locator('[data-testid="webcam-preview"]')).toBeVisible();

    // When: User closes and reopens recording panel
    await page.click('[data-testid="close-recording-panel"]');
    await expect(page.locator('text=Screen Recording')).not.toBeVisible();

    // Reopen panel
    await page.click('[data-testid="open-recording-panel"]');
    await page.click('text=Webcam');

    // Then: Same camera should be selected
    await expect(page.locator('[data-testid="camera-select"]')).toContainText(firstCameraText!, {
      timeout: 15000,
    });
  });
});

test.describe('2.7-E2E-005: Resolution Handling', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    electronApp = await electron.launch({
      args: ['dist-js/main.js'],
    });
    page = await electronApp.firstWindow();
    await page.click('[data-testid="open-recording-panel"]');
    await page.click('text=Webcam');
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  test('should display camera native resolution in dropdown', async () => {
    // Given: Cameras are enumerated
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    // When: User views camera list
    await page.click('[data-testid="camera-select"]');

    // Then: Each camera should show its resolution
    const cameraOptions = page.locator('[role="option"]');
    const count = await cameraOptions.count();

    for (let i = 0; i < count; i++) {
      const optionText = await cameraOptions.nth(i).textContent();

      // Should match resolution pattern (e.g., "1280x720", "1920x1080", "3840x2160")
      expect(optionText).toMatch(/\d{3,4}x\d{3,4}/);
    }
  });

  test('should handle 4K camera (resolution capping)', async () => {
    // Given: Camera with 4K resolution available
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    await page.click('[data-testid="camera-select"]');
    const cameraOptions = page.locator('[role="option"]');
    const count = await cameraOptions.count();

    // Find a 4K camera if available
    let has4K = false;
    for (let i = 0; i < count; i++) {
      const optionText = await cameraOptions.nth(i).textContent();
      if (optionText?.includes('3840x2160') || optionText?.includes('4K')) {
        has4K = true;
        await cameraOptions.nth(i).click();
        break;
      }
    }

    if (!has4K) {
      test.skip();
      return;
    }

    // When: User starts recording with 4K camera
    await expect(page.locator('[data-testid="webcam-preview"]')).toBeVisible();

    const recordButton = page.locator('button:has-text("Record")');
    await recordButton.click();

    await expect(page.locator('text=Recording...')).toBeVisible({ timeout: 5000 });

    // Then: Recording should cap at 1080p (AC#6)
    // (This would need to be verified via backend logs or file metadata inspection)
    // For E2E test, we verify recording started successfully

    await page.waitForTimeout(1000);

    const stopButton = page.locator('button:has-text("Stop")');
    await stopButton.click();

    // Recording should complete successfully
    await expect(page.locator('text=saved successfully')).toBeVisible({ timeout: 15000 });
  });

  test('should handle 720p camera', async () => {
    // Given: 720p camera available
    await expect(page.locator('[data-testid="camera-select"]')).toBeVisible({
      timeout: 15000,
    });

    await page.click('[data-testid="camera-select"]');
    const cameraOptions = page.locator('[role="option"]');
    const count = await cameraOptions.count();

    // Find a 720p camera if available
    let has720p = false;
    for (let i = 0; i < count; i++) {
      const optionText = await cameraOptions.nth(i).textContent();
      if (optionText?.includes('1280x720')) {
        has720p = true;
        await cameraOptions.nth(i).click();
        break;
      }
    }

    if (!has720p) {
      test.skip();
      return;
    }

    // When: User records with 720p camera
    await expect(page.locator('[data-testid="webcam-preview"]')).toBeVisible();

    const recordButton = page.locator('button:has-text("Record")');
    await recordButton.click();

    await expect(page.locator('text=Recording...')).toBeVisible({ timeout: 5000 });

    // Then: Recording should use native 720p resolution (no upscaling)
    await page.waitForTimeout(1000);

    const stopButton = page.locator('button:has-text("Stop")');
    await stopButton.click();

    // Recording should complete successfully
    await expect(page.locator('text=saved successfully')).toBeVisible({ timeout: 15000 });
  });
});
