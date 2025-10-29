/**
 * E2E Tests for Story 4.3: Multi-Audio Track Recording Architecture
 *
 * These tests validate the complete multi-track audio workflow:
 * - Recording with multi-track audio (system + microphone)
 * - Import to media library with audio track metadata
 * - Display in timeline with multi-track indicators
 *
 * Test IDs: 4.3-E2E-001, 4.3-E2E-002, 4.3-E2E-003
 * Priority: P0 (Blocker for Story 4.3 AC#5)
 * Coverage: AC#1-6 (Full multi-track pipeline)
 */

import { test, expect } from '@playwright/test';

test.describe('4.3-E2E: Multi-Track Audio Recording and Timeline Display', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and wait for load
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('4.3-E2E-001: Record multi-track → Import → Verify timeline displays 2 tracks (AC#1-5)', async ({
    page,
  }) => {
    // GIVEN: User is on the recording page with both audio sources enabled
    // (Assumption: macOS permissions already granted)

    // WHEN: User enables both system audio and microphone
    await page.getByTestId('system-audio-checkbox').click();
    await expect(page.getByTestId('system-audio-checkbox')).toBeChecked();

    await page.getByTestId('microphone-checkbox').click();
    await expect(page.getByTestId('microphone-checkbox')).toBeChecked();

    // WHEN: User starts recording
    const startButton = page.getByTestId('start-recording-btn');
    await startButton.click();

    // Wait for recording to be active
    await expect(page.getByTestId('recording-status')).toContainText('Recording');
    await expect(page.getByTestId('stop-recording-btn')).toBeVisible();

    // Record for 5 seconds to capture sufficient audio
    await page.waitForTimeout(5000);

    // WHEN: User stops recording
    const stopButton = page.getByTestId('stop-recording-btn');
    await stopButton.click();

    // Wait for recording to finalize (AC #1, #4: FFmpeg muxing)
    await expect(page.getByTestId('recording-status')).toContainText('Idle', {
      timeout: 10000,
    });

    // THEN: Verify recording was created with 2 audio tracks
    const outputPath = await page.evaluate(async () => {
      // @ts-expect-error - Tauri API injected at runtime
      return await window.__TAURI__.invoke('get_last_recording_path');
    });

    expect(outputPath).toBeTruthy();
    expect(outputPath).toContain('.mp4');

    // AC #2, #4: Verify MP4 contains 2 separate audio streams (Track 1=system, Track 2=mic)
    const ffprobeOutput = await page.evaluate(async (path: string) => {
      // @ts-expect-error - Tauri API injected at runtime
      return await window.__TAURI__.invoke('ffprobe_get_tracks', { path });
    }, outputPath as string);

    expect(ffprobeOutput.audio_tracks).toHaveLength(2);
    expect(ffprobeOutput.audio_tracks[0].codec_name).toBe('aac'); // Track 1: system audio
    expect(ffprobeOutput.audio_tracks[1].codec_name).toBe('aac'); // Track 2: microphone

    // AC #3: Verify both tracks have synchronized timestamps
    // (Validated by integration tests in frame_synchronizer.rs - E2E just confirms tracks exist)
    expect(ffprobeOutput.video_tracks).toHaveLength(1); // Video track for sync reference

    // WHEN: User navigates to media library (recording should auto-import per Story 2.6)
    await page.getByTestId('media-library-tab').click();
    await page.waitForTimeout(1000); // Wait for auto-import to complete

    // THEN: Verify recording appears in media library
    const mediaItem = page.getByTestId(`media-item-${outputPath}`).first();
    await expect(mediaItem).toBeVisible({ timeout: 5000 });

    // WHEN: User adds clip to timeline
    await mediaItem.click(); // Select media item
    await page.getByTestId('add-to-timeline-btn').click();

    // Navigate to timeline view
    await page.getByTestId('timeline-tab').click();
    await page.waitForTimeout(500);

    // THEN: Verify clip appears on timeline
    const timelineClip = page.locator('[data-testid^="timeline-clip"]').first();
    await expect(timelineClip).toBeVisible();

    // AC #5: Verify multi-track badge is displayed on timeline clip
    // The badge should show "2 Tracks" label
    await expect(page.getByText('2 Tracks')).toBeVisible({ timeout: 2000 });

    // WHEN: User clicks clip to select it
    await timelineClip.click();
    await page.waitForTimeout(300);

    // THEN: AC #5: Verify track details tooltip is displayed when selected
    // Should show "T1: System Audio | T2: Microphone" or similar
    await expect(page.getByText(/T1:.*System/i)).toBeVisible({ timeout: 1000 });
    await expect(page.getByText(/T2:.*Microphone/i)).toBeVisible({ timeout: 1000 });

    // Clean up: Delete test recording
    await page.evaluate(async (path: string) => {
      // @ts-expect-error - Tauri API injected at runtime
      await window.__TAURI__.invoke('delete_recording', { path });
    }, outputPath as string);
  });

  test('4.3-E2E-002: Single-track recording does NOT show multi-track badge (Backward compat)', async ({
    page,
  }) => {
    // GIVEN: User records with only system audio (single track)

    // WHEN: User enables only system audio
    await page.getByTestId('system-audio-checkbox').click();
    await expect(page.getByTestId('system-audio-checkbox')).toBeChecked();
    await expect(page.getByTestId('microphone-checkbox')).not.toBeChecked();

    // WHEN: User records for 3 seconds
    await page.getByTestId('start-recording-btn').click();
    await expect(page.getByTestId('recording-status')).toContainText('Recording');
    await page.waitForTimeout(3000);

    await page.getByTestId('stop-recording-btn').click();
    await expect(page.getByTestId('recording-status')).toContainText('Idle', {
      timeout: 10000,
    });

    // THEN: Verify recording has only 1 audio track
    const outputPath = await page.evaluate(async () => {
      // @ts-expect-error - Tauri API injected at runtime
      return await window.__TAURI__.invoke('get_last_recording_path');
    });

    const ffprobeOutput = await page.evaluate(async (path: string) => {
      // @ts-expect-error - Tauri API injected at runtime
      return await window.__TAURI__.invoke('ffprobe_get_tracks', { path });
    }, outputPath as string);

    expect(ffprobeOutput.audio_tracks).toHaveLength(1); // Single track

    // WHEN: Add to timeline
    await page.getByTestId('media-library-tab').click();
    await page.waitForTimeout(1000);

    const mediaItem = page.getByTestId(`media-item-${outputPath}`).first();
    await mediaItem.click();
    await page.getByTestId('add-to-timeline-btn').click();

    await page.getByTestId('timeline-tab').click();
    await page.waitForTimeout(500);

    // THEN: Verify multi-track badge is NOT displayed (backward compatibility)
    await expect(page.getByText('2 Tracks')).not.toBeVisible();

    // Clean up
    await page.evaluate(async (path: string) => {
      // @ts-expect-error - Tauri API injected at runtime
      await window.__TAURI__.invoke('delete_recording', { path });
    }, outputPath as string);
  });

  test('4.3-E2E-003: Verify track metadata includes correct source labels (AC#2, #5)', async ({
    page,
  }) => {
    // GIVEN: User records with multi-track audio

    await page.getByTestId('system-audio-checkbox').click();
    await page.getByTestId('microphone-checkbox').click();

    await page.getByTestId('start-recording-btn').click();
    await expect(page.getByTestId('recording-status')).toContainText('Recording');
    await page.waitForTimeout(4000);

    await page.getByTestId('stop-recording-btn').click();
    await expect(page.getByTestId('recording-status')).toContainText('Idle', {
      timeout: 10000,
    });

    const outputPath = await page.evaluate(async () => {
      // @ts-expect-error - Tauri API injected at runtime
      return await window.__TAURI__.invoke('get_last_recording_path');
    });

    // WHEN: Get media file metadata via Tauri
    const mediaMetadata = await page.evaluate(async (path: string) => {
      // @ts-expect-error - Tauri API injected at runtime
      return await window.__TAURI__.invoke('get_media_metadata', { path });
    }, outputPath as string);

    // THEN: AC #2: Verify Track 1 is system audio, Track 2 is microphone
    expect(mediaMetadata.audioTracks).toBeDefined();
    expect(mediaMetadata.audioTracks).toHaveLength(2);

    expect(mediaMetadata.audioTracks[0].trackId).toBe(1);
    expect(mediaMetadata.audioTracks[0].source).toBe('system');
    expect(mediaMetadata.audioTracks[0].label).toContain('System');

    expect(mediaMetadata.audioTracks[1].trackId).toBe(2);
    expect(mediaMetadata.audioTracks[1].source).toBe('microphone');
    expect(mediaMetadata.audioTracks[1].label).toContain('Microphone');

    // AC #6: Verify architecture supports extensibility (data model allows webcam source)
    // This is validated by backend unit tests (test_4_3_unit_008) - E2E just confirms structure

    // Clean up
    await page.evaluate(async (path: string) => {
      // @ts-expect-error - Tauri API injected at runtime
      await window.__TAURI__.invoke('delete_recording', { path });
    }, outputPath as string);
  });
});

/**
 * Implementation Notes:
 *
 * 1. Test Dependencies:
 *    - Requires Tauri commands: `ffprobe_get_tracks`, `get_media_metadata`, `get_last_recording_path`, `delete_recording`
 *    - These commands must expose audio track metadata from ffprobe
 *    - Frontend must parse and display audioTracks in Timeline component
 *
 * 2. Test Data IDs:
 *    - Timeline clip: `[data-testid^="timeline-clip"]` (generic locator)
 *    - Multi-track badge: Text locator `"2 Tracks"` (rendered by TimelineClip)
 *    - Track labels: Text locators for `T1:` and `T2:` (rendered when clip selected)
 *
 * 3. Acceptance Criteria Coverage:
 *    - AC #1: FFmpeg multi-track encoding → Validated via ffprobe output (test 001, 003)
 *    - AC #2: Track 1=system, Track 2=mic → Validated via metadata (test 003)
 *    - AC #3: Synchronized audio → Assumed if both tracks exist (validated by unit tests)
 *    - AC #4: MP4 contains separate streams → Validated via ffprobe (test 001, 002)
 *    - AC #5: Timeline displays tracks → Validated via UI elements (test 001)
 *    - AC #6: Future-ready architecture → Validated by backend unit tests
 *
 * 4. Test Duration:
 *    - E2E-001: ~12 seconds (5s recording + 1-3s muxing + 3s UI validation)
 *    - E2E-002: ~8 seconds (3s recording + 1-3s muxing + 2s UI validation)
 *    - E2E-003: ~9 seconds (4s recording + 1-3s muxing + 2s metadata validation)
 *    - Total suite: ~29 seconds
 *
 * 5. Flakiness Mitigation:
 *    - Uses explicit waits for recording status changes
 *    - Allows up to 10s timeout for FFmpeg muxing
 *    - Uses visible checks for UI elements (multi-track badge, track labels)
 *    - Auto-import wait (1s) after recording completes (Story 2.6)
 *
 * 6. Known Limitations:
 *    - Tests require macOS permissions granted before running
 *    - Tests assume ffprobe binary is available in PATH
 *    - UI element selectors may need adjustment based on actual Konva rendering
 *    - Multi-track badge visibility depends on clip width (>80px threshold)
 */
