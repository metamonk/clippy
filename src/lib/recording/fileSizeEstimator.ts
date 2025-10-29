/**
 * File Size Estimation Utility (Story 4.2)
 *
 * Estimates recording file size based on resolution and frame rate.
 * Uses conservative H.264 MP4 bitrate estimates for reasonable quality.
 */

import type { FrameRate, Resolution } from '@/types/recording';

/**
 * Bitrate estimates in MB/min for H.264 MP4 with good quality
 * These are conservative estimates accounting for:
 * - Video codec overhead
 * - Reasonable quality settings (CRF 23-28)
 * - Typical screen content (not high-motion gaming)
 */
const BITRATES: Record<string, number> = {
  '720p30': 3,    // 1280x720 @ 30 FPS
  '720p60': 5,    // 1280x720 @ 60 FPS
  '1080p30': 5,   // 1920x1080 @ 30 FPS
  '1080p60': 8,   // 1920x1080 @ 60 FPS
  'source30': 8,  // Native resolution @ 30 FPS (conservative estimate)
  'source60': 12, // Native resolution @ 60 FPS (conservative estimate)
};

/**
 * Estimate file size for recording configuration
 *
 * @param resolution - Recording resolution
 * @param frameRate - Recording frame rate
 * @returns Estimated file size in MB per minute
 */
export function estimateFileSize(resolution: Resolution, frameRate: FrameRate): number {
  const key = `${resolution}${frameRate}`;
  return BITRATES[key] ?? 5; // Default to 5 MB/min if unknown combination
}

/**
 * Format file size estimate as human-readable string
 *
 * @param mbPerMin - File size in MB per minute
 * @returns Formatted string like "~5 MB/min"
 */
export function formatFileSizeEstimate(mbPerMin: number): string {
  return `~${mbPerMin} MB/min`;
}

/**
 * Get detailed estimate with assumptions
 *
 * @param resolution - Recording resolution
 * @param frameRate - Recording frame rate
 * @returns Object with estimate and description
 */
export function getDetailedEstimate(resolution: Resolution, frameRate: FrameRate) {
  const mbPerMin = estimateFileSize(resolution, frameRate);
  const formatted = formatFileSizeEstimate(mbPerMin);

  // Calculate hourly estimate
  const mbPerHour = mbPerMin * 60;
  const gbPerHour = (mbPerHour / 1024).toFixed(1);

  return {
    mbPerMin,
    mbPerHour,
    gbPerHour: parseFloat(gbPerHour),
    formatted,
    description: `${formatted} at ${resolution} ${frameRate} FPS (H.264, good quality)`,
    hourlyEstimate: `~${gbPerHour} GB/hour`,
  };
}
