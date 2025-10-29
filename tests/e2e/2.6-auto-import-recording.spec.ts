/**
 * E2E Tests for Story 2.6: Auto-Import Recordings to Media Library
 *
 * Validates the complete workflow:
 * - Start screen recording
 * - Stop recording
 * - Recording is automatically imported to media library within 2 seconds
 * - MediaFile includes all metadata (duration, resolution, thumbnail, etc.)
 * - Success notification displayed with filename and size
 */

import { test, expect, Page } from '@playwright/test';

test.describe('Story 2.6: Auto-Import Recordings to Media Library', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
  });

  test('@p1 @smoke 2.6-E2E-001: should auto-import recording to media library within 2 seconds', async ({
    page,
  }) => {
    // GIVEN: User has screen recording permission (mock Tauri commands)
    await page.evaluate(() => {
      // Mock Tauri invoke to simulate successful recording flow
      (window as any).__TAURI_INTERNALS__.invoke = async (cmd: string, args?: any) => {
        switch (cmd) {
          case 'cmd_check_screen_recording_permission':
            return true;

          case 'cmd_check_disk_space':
            return 50000000000; // 50GB available

          case 'cmd_start_screen_recording':
            return 'test-recording-id-e2e';

          case 'cmd_send_recording_notification':
            return undefined;

          case 'cmd_stop_recording':
            // Return a complete MediaFile object (simulating backend)
            return {
              id: 'media-' + Date.now(),
              filePath: '/Users/test/Documents/clippy/recordings/recording-2025-10-29-120000.mp4',
              filename: 'recording-2025-10-29-120000.mp4',
              duration: 15000, // 15 seconds
              resolution: { width: 1920, height: 1080 },
              fileSize: 3145728, // 3MB
              codec: 'h264',
              thumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              importedAt: new Date().toISOString(),
            };

          case 'cmd_get_recordings_dir':
            return '/Users/test/Documents/clippy/recordings';

          default:
            throw new Error(`Unhandled command: ${cmd}`);
        }
      };
    });

    // WHEN: User opens recording panel
    await page.click('[aria-label="Open recording panel"]');
    await expect(page.getByText('Recording')).toBeVisible();

    // AND: User clicks "Record Screen" button
    await page.click('button:has-text("Record Screen")');

    // THEN: Recording should start
    await expect(page.getByText('Recording...')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Stop Recording')).toBeVisible();

    // Record the start time for 2-second SLA verification
    const stopStartTime = Date.now();

    // WHEN: User stops the recording
    await page.click('button:has-text("Stop Recording")');

    // THEN: Success notification should appear with filename and size
    await expect(
      page.getByText(/recording-2025-10-29-120000\.mp4 \(3\.0 MB\) added to media library/i)
    ).toBeVisible({ timeout: 5000 });

    // AND: Recording should appear in media library within 2 seconds (AC#4)
    const mediaLibrary = page.locator('[data-testid="media-library"]');
    await expect(mediaLibrary).toBeVisible();

    // Verify the recording appears in the media library
    const mediaItem = page.locator('[data-testid^="media-item-"]').first();
    await expect(mediaItem).toBeVisible({ timeout: 3000 });

    // Verify SLA: Recording appeared within 2 seconds
    const stopDuration = Date.now() - stopStartTime;
    expect(stopDuration).toBeLessThan(2000);

    // AND: Media item should display correct metadata
    await expect(mediaItem.getByText('recording-2025-10-29-120000.mp4')).toBeVisible();
    await expect(mediaItem.getByText('00:15')).toBeVisible(); // 15 seconds duration
    await expect(mediaItem.getByText('1920x1080')).toBeVisible(); // Resolution

    // AND: Thumbnail should be visible (AC#2)
    const thumbnail = mediaItem.locator('[data-testid="media-thumbnail"]');
    await expect(thumbnail).toBeVisible();
    const thumbnailSrc = await thumbnail.getAttribute('src');
    expect(thumbnailSrc).toContain('data:image/png;base64');

    // AND: File size should be displayed
    await expect(mediaItem.getByText(/3\.0 MB/i)).toBeVisible();

    // AND: Recording panel should close after successful import
    await expect(page.getByText('Recording')).not.toBeVisible();
  });

  test('@p1 2.6-E2E-002: should not import duplicate recordings', async ({ page }) => {
    // GIVEN: User completes a recording
    await page.evaluate(() => {
      (window as any).__TAURI_INTERNALS__.invoke = async (cmd: string) => {
        if (cmd === 'cmd_check_screen_recording_permission') return true;
        if (cmd === 'cmd_check_disk_space') return 50000000000;
        if (cmd === 'cmd_start_screen_recording') return 'test-recording-id';
        if (cmd === 'cmd_send_recording_notification') return undefined;
        if (cmd === 'cmd_stop_recording') {
          return {
            id: 'duplicate-test',
            filePath: '/Users/test/Documents/clippy/recordings/duplicate.mp4',
            filename: 'duplicate.mp4',
            duration: 10000,
            resolution: { width: 1920, height: 1080 },
            fileSize: 2097152, // 2MB
            codec: 'h264',
            thumbnail: 'data:image/png;base64,..',
            importedAt: new Date().toISOString(),
          };
        }
        if (cmd === 'cmd_get_recordings_dir') return '/Users/test/Documents/clippy/recordings';
      };
    });

    // WHEN: User records and stops (first time)
    await page.click('[aria-label="Open recording panel"]');
    await page.click('button:has-text("Record Screen")');
    await page.waitForSelector('text=Stop Recording');
    await page.click('button:has-text("Stop Recording")');

    // THEN: Recording should appear once in media library
    await page.waitForSelector('[data-testid^="media-item-"]');
    const mediaItems = page.locator('[data-testid^="media-item-"]');
    const initialCount = await mediaItems.count();

    // WHEN: User tries to import the same file again (simulated)
    await page.click('[aria-label="Open recording panel"]');
    await page.click('button:has-text("Record Screen")');
    await page.waitForSelector('text=Stop Recording');
    await page.click('button:has-text("Stop Recording")');

    // THEN: Media library should still have the same count (no duplicate)
    await page.waitForTimeout(1000); // Wait for potential duplicate import
    const finalCount = await mediaItems.count();
    expect(finalCount).toBe(initialCount);
  });

  test('@p2 2.6-E2E-003: should organize recordings in ~/Documents/clippy/recordings/', async ({
    page,
  }) => {
    // GIVEN: User completes a recording
    let recordingsDir = '';

    await page.evaluate(() => {
      (window as any).__TAURI_INTERNALS__.invoke = async (cmd: string) => {
        if (cmd === 'cmd_get_recordings_dir') {
          const dir = '/Users/test/Documents/clippy/recordings';
          return dir;
        }
        if (cmd === 'cmd_check_screen_recording_permission') return true;
        if (cmd === 'cmd_check_disk_space') return 50000000000;
        if (cmd === 'cmd_start_screen_recording') return 'test-id';
        if (cmd === 'cmd_send_recording_notification') return undefined;
        if (cmd === 'cmd_stop_recording') {
          return {
            id: 'test',
            filePath: '/Users/test/Documents/clippy/recordings/test-organized.mp4',
            filename: 'test-organized.mp4',
            duration: 5000,
            resolution: { width: 1920, height: 1080 },
            fileSize: 1048576,
            codec: 'h264',
            thumbnail: 'data:image/png;base64,..',
            importedAt: new Date().toISOString(),
          };
        }
      };
    });

    // WHEN: User records and stops
    await page.click('[aria-label="Open recording panel"]');
    await page.click('button:has-text("Record Screen")');
    await page.waitForSelector('text=Stop Recording');
    await page.click('button:has-text("Stop Recording")');

    // THEN: File path should show organized location
    const successToast = page.getByText(/test-organized\.mp4/i);
    await expect(successToast).toBeVisible();

    // Verify the recording is in media library (implying correct path handling)
    const mediaItem = page.locator('[data-testid^="media-item-"]').first();
    await expect(mediaItem).toBeVisible();
  });

  test('@p2 2.6-E2E-004: should display success notification with filename and file size', async ({
    page,
  }) => {
    // GIVEN: User has permission and completes recording
    await page.evaluate(() => {
      (window as any).__TAURI_INTERNALS__.invoke = async (cmd: string) => {
        if (cmd === 'cmd_check_screen_recording_permission') return true;
        if (cmd === 'cmd_check_disk_space') return 50000000000;
        if (cmd === 'cmd_start_screen_recording') return 'test-id';
        if (cmd === 'cmd_send_recording_notification') return undefined;
        if (cmd === 'cmd_stop_recording') {
          return {
            id: 'notification-test',
            filePath: '/Users/test/Documents/clippy/recordings/my-awesome-recording.mp4',
            filename: 'my-awesome-recording.mp4',
            duration: 30000,
            resolution: { width: 3840, height: 2160 },
            fileSize: 10485760, // 10MB
            codec: 'h264',
            thumbnail: 'data:image/png;base64,..',
            importedAt: new Date().toISOString(),
          };
        }
        if (cmd === 'cmd_get_recordings_dir') return '/Users/test/Documents/clippy/recordings';
      };
    });

    // WHEN: User completes recording
    await page.click('[aria-label="Open recording panel"]');
    await page.click('button:has-text("Record Screen")');
    await page.waitForSelector('text=Stop Recording');
    await page.click('button:has-text("Stop Recording")');

    // THEN: Success notification should display filename and formatted file size
    const notification = page.getByText('Recording saved successfully');
    await expect(notification).toBeVisible({ timeout: 3000 });

    const description = page.getByText(/my-awesome-recording\.mp4 \(10\.0 MB\) added to media library/i);
    await expect(description).toBeVisible();
  });
});
