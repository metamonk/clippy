/**
 * E2E Integration Tests for Story 2.4: System Audio and Microphone Capture
 *
 * These tests validate the complete audio recording workflow from UI interaction
 * through Tauri commands to FFmpeg muxing and final MP4 output validation.
 *
 * Test IDs: 2.4-E2E-001, 2.4-E2E-002
 * Priority: P1 (Critical for Epic 2 completion)
 * Coverage: AC#1-6 (Full audio recording pipeline)
 */

import { test, expect } from '@playwright/test';

test.describe('2.4-E2E: Audio Recording Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and wait for load
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('2.4-E2E-001: Record with system audio and microphone, verify 2 audio tracks (AC#1-6)', async ({
    page,
  }) => {
    // GIVEN: User is on the recording page with audio permissions granted
    // (Assumption: macOS permissions already granted via System Preferences)

    // WHEN: User enables both audio sources
    await page.getByTestId('system-audio-checkbox').click();
    await expect(page.getByTestId('system-audio-checkbox')).toBeChecked();

    await page.getByTestId('microphone-checkbox').click();
    await expect(page.getByTestId('microphone-checkbox')).toBeChecked();

    // Verify help text shows both sources enabled
    await expect(page.getByText('Recording both system and microphone audio')).toBeVisible();

    // WHEN: User starts recording
    const startButton = page.getByTestId('start-recording-btn');
    await startButton.click();

    // Wait for recording to be active
    await expect(page.getByTestId('recording-status')).toContainText('Recording');
    await expect(page.getByTestId('stop-recording-btn')).toBeVisible();

    // Let recording run for 5 seconds to capture sufficient audio samples
    await page.waitForTimeout(5000);

    // WHEN: User stops recording
    const stopButton = page.getByTestId('stop-recording-btn');
    await stopButton.click();

    // Wait for recording to finalize (post-processing muxing may take 1-3 seconds)
    await expect(page.getByTestId('recording-status')).toContainText('Idle', {
      timeout: 10000,
    });

    // THEN: Verify output file was created and has correct audio tracks
    // Get the path to the last recording via Tauri command
    const outputPath = await page.evaluate(async () => {
      // @ts-expect-error - Tauri API injected at runtime
      return await window.__TAURI__.invoke('get_last_recording_path');
    });

    expect(outputPath).toBeTruthy();
    expect(outputPath).toContain('.mp4');

    // Verify audio tracks using FFprobe via Tauri command
    const ffprobeOutput = await page.evaluate(async (path: string) => {
      // @ts-expect-error - Tauri API injected at runtime
      return await window.__TAURI__.invoke('ffprobe_get_tracks', { path });
    }, outputPath as string);

    // THEN: Output file should have 2 audio tracks (system + microphone)
    expect(ffprobeOutput.audio_tracks).toHaveLength(2);
    expect(ffprobeOutput.audio_tracks[0].codec_name).toBe('aac');
    expect(ffprobeOutput.audio_tracks[1].codec_name).toBe('aac');

    // Verify audio quality parameters
    expect(ffprobeOutput.audio_tracks[0].sample_rate).toBe('48000'); // 48kHz professional standard
    expect(ffprobeOutput.audio_tracks[0].channels).toBe(2); // Stereo

    // Verify video track exists
    expect(ffprobeOutput.video_tracks).toHaveLength(1);
    expect(ffprobeOutput.video_tracks[0].codec_name).toBe('h264');

    // Clean up: Delete test recording
    await page.evaluate(async (path: string) => {
      // @ts-expect-error - Tauri API injected at runtime
      await window.__TAURI__.invoke('delete_recording', { path });
    }, outputPath as string);
  });

  test('2.4-E2E-002: Record video-only (no audio), verify 0 audio tracks (AC#3, AC#5)', async ({
    page,
  }) => {
    // GIVEN: User is on the recording page with no audio sources enabled

    // Verify both audio checkboxes are unchecked (default state)
    await expect(page.getByTestId('system-audio-checkbox')).not.toBeChecked();
    await expect(page.getByTestId('microphone-checkbox')).not.toBeChecked();

    // Verify help text shows video-only mode
    await expect(page.getByText('No audio will be recorded (video only)')).toBeVisible();

    // WHEN: User starts recording
    const startButton = page.getByTestId('start-recording-btn');
    await startButton.click();

    // Wait for recording to be active
    await expect(page.getByTestId('recording-status')).toContainText('Recording');

    // Record for 3 seconds
    await page.waitForTimeout(3000);

    // WHEN: User stops recording
    const stopButton = page.getByTestId('stop-recording-btn');
    await stopButton.click();

    // Wait for recording to finalize
    await expect(page.getByTestId('recording-status')).toContainText('Idle', {
      timeout: 10000,
    });

    // THEN: Verify output file has NO audio tracks (video-only)
    const outputPath = await page.evaluate(async () => {
      // @ts-expect-error - Tauri API injected at runtime
      return await window.__TAURI__.invoke('get_last_recording_path');
    });

    expect(outputPath).toBeTruthy();
    expect(outputPath).toContain('.mp4');

    // Verify tracks using FFprobe
    const ffprobeOutput = await page.evaluate(async (path: string) => {
      // @ts-expect-error - Tauri API injected at runtime
      return await window.__TAURI__.invoke('ffprobe_get_tracks', { path });
    }, outputPath as string);

    // THEN: Output file should have 0 audio tracks (video-only)
    expect(ffprobeOutput.audio_tracks).toHaveLength(0);

    // THEN: Output file should still have 1 video track
    expect(ffprobeOutput.video_tracks).toHaveLength(1);
    expect(ffprobeOutput.video_tracks[0].codec_name).toBe('h264');

    // Clean up: Delete test recording
    await page.evaluate(async (path: string) => {
      // @ts-expect-error - Tauri API injected at runtime
      await window.__TAURI__.invoke('delete_recording', { path });
    }, outputPath as string);
  });
});

/**
 * Implementation Notes:
 *
 * 1. FFprobe Integration:
 *    - Tests require Tauri commands: `ffprobe_get_tracks`, `get_last_recording_path`, `delete_recording`
 *    - These commands must be implemented in src-tauri/src/commands/ to expose FFprobe functionality
 *    - FFprobe binary must be available in PATH or bundled with app
 *
 * 2. Audio Permissions:
 *    - Tests assume microphone and screen recording permissions already granted
 *    - On CI: May need headless environment with mocked permissions
 *    - On local: Must grant permissions via System Preferences before running tests
 *
 * 3. Test Isolation:
 *    - Each test cleans up its recording file after validation
 *    - Tests use unique output paths (via timestamp or random ID) to prevent conflicts
 *
 * 4. Test Duration:
 *    - E2E-001: ~10 seconds (5s recording + 1-3s muxing + 2s validation)
 *    - E2E-002: ~7 seconds (3s recording + 1-3s muxing + 2s validation)
 *    - Total suite: ~17 seconds
 *
 * 5. Flakiness Mitigation:
 *    - Uses explicit wait for recording status changes
 *    - Allows up to 10s timeout for post-processing muxing
 *    - No hard waits except for actual recording duration (required)
 *
 * 6. Sync Accuracy Validation:
 *    - AC#4 (audio/video sync <50ms) not directly tested in E2E
 *    - Sync accuracy validated by unit tests in frame_synchronizer.rs (test_2_4_unit_031-035)
 *    - E2E tests focus on end-to-end workflow integrity
 */
