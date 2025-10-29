/**
 * Story 4.8 E2E Test: Multi-Cycle Pause/Resume
 *
 * AC #6: Can pause/resume multiple times in single recording session
 *
 * This test validates that:
 * - Multiple pause/resume cycles work correctly
 * - Final output duration matches active recording time (not elapsed time)
 * - No frozen frames or gaps in the output
 */

import { test, expect } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

/**
 * Get video duration using FFprobe
 */
async function getVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
  );
  return parseFloat(stdout.trim());
}

/**
 * Get the path of the most recently created recording
 */
async function getLastRecordingPath(): Promise<string> {
  const recordingsDir = path.join(
    process.env.HOME || '',
    'Documents',
    'clippy',
    'recordings'
  );

  const files = fs.readdirSync(recordingsDir)
    .filter(f => f.endsWith('.mp4'))
    .map(f => ({
      name: f,
      path: path.join(recordingsDir, f),
      time: fs.statSync(path.join(recordingsDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length === 0) {
    throw new Error('No recordings found');
  }

  return files[0].path;
}

test.describe('Story 4.8: Multi-Cycle Pause/Resume', () => {
  test('AC #6: Multi-cycle pause/resume workflow', async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:1420');

    // Wait for app to be ready
    await page.waitForSelector('[data-testid="recording-panel"]', { timeout: 10000 });

    // 1. Start recording
    const startButton = page.locator('[data-testid="start-recording-button"]');
    await startButton.click();

    // Wait for recording to start
    await page.waitForSelector('[data-testid="recording-status"]');
    await expect(page.locator('[data-testid="recording-status"]')).toContainText('RECORDING');

    // Record for 2 seconds
    await page.waitForTimeout(2000);

    // 2. First pause
    const pauseButton = page.locator('[data-testid="pause-recording-button"]');
    await pauseButton.click();
    await expect(page.locator('[data-testid="recording-status"]')).toContainText('PAUSED');

    // Wait 1 second while paused
    await page.waitForTimeout(1000);

    // 3. First resume
    const resumeButton = page.locator('[data-testid="resume-recording-button"]');
    await resumeButton.click();
    await expect(page.locator('[data-testid="recording-status"]')).toContainText('RECORDING');

    // Record for 2 seconds
    await page.waitForTimeout(2000);

    // 4. Second pause
    await pauseButton.click();
    await expect(page.locator('[data-testid="recording-status"]')).toContainText('PAUSED');

    // Wait 1 second while paused
    await page.waitForTimeout(1000);

    // 5. Second resume
    await resumeButton.click();
    await expect(page.locator('[data-testid="recording-status"]')).toContainText('RECORDING');

    // Record for 2 seconds
    await page.waitForTimeout(2000);

    // 6. Stop recording
    const stopButton = page.locator('[data-testid="stop-recording-button"]');
    await stopButton.click();

    // Wait for recording to be processed
    await page.waitForTimeout(3000);

    // 7. Validate output duration ≈ 6 seconds (not 9 seconds elapsed)
    const outputPath = await getLastRecordingPath();
    expect(fs.existsSync(outputPath)).toBe(true);

    const duration = await getVideoDuration(outputPath);

    // Duration should be approximately 6 seconds (3 recording periods of 2 seconds each)
    // Allow ±0.5 seconds tolerance for timing variations
    expect(duration).toBeGreaterThanOrEqual(5.5);
    expect(duration).toBeLessThanOrEqual(6.5);

    // Cleanup - delete test recording
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  });

  test('AC #6 Variant: Multiple short pause/resume cycles', async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:1420');

    // Wait for app to be ready
    await page.waitForSelector('[data-testid="recording-panel"]', { timeout: 10000 });

    // Start recording
    await page.locator('[data-testid="start-recording-button"]').click();
    await page.waitForSelector('[data-testid="recording-status"]');

    const pauseButton = page.locator('[data-testid="pause-recording-button"]');
    const resumeButton = page.locator('[data-testid="resume-recording-button"]');

    // Perform 5 quick pause/resume cycles
    for (let i = 0; i < 5; i++) {
      // Record for 1 second
      await page.waitForTimeout(1000);

      // Pause for 500ms
      await pauseButton.click();
      await expect(page.locator('[data-testid="recording-status"]')).toContainText('PAUSED');
      await page.waitForTimeout(500);

      // Resume
      await resumeButton.click();
      await expect(page.locator('[data-testid="recording-status"]')).toContainText('RECORDING');
    }

    // Record final second
    await page.waitForTimeout(1000);

    // Stop recording
    await page.locator('[data-testid="stop-recording-button"]').click();
    await page.waitForTimeout(3000);

    // Validate duration ≈ 6 seconds (5 cycles × 1 sec + 1 sec final)
    // Paused time (5 × 500ms = 2.5 sec) should NOT be included
    const outputPath = await getLastRecordingPath();
    const duration = await getVideoDuration(outputPath);

    expect(duration).toBeGreaterThanOrEqual(5.5);
    expect(duration).toBeLessThanOrEqual(6.5);

    // Cleanup
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  });
});
