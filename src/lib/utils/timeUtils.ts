/**
 * Time formatting utilities for video player
 *
 * Handles conversion between seconds and human-readable time formats (MM:SS or HH:MM:SS).
 */

/**
 * Format seconds to MM:SS or HH:MM:SS format with optional decimal precision
 *
 * @param seconds - Time in seconds
 * @returns Formatted time string (MM:SS for < 1 hour, HH:MM:SS for >= 1 hour)
 *
 * @example
 * formatTime(65) // "1:05"
 * formatTime(3665) // "1:01:05"
 * formatTime(5.0) // "0:05" (exact second)
 * formatTime(4.967) // "0:05.0" (shows decimal to indicate not exactly 5s)
 * formatTime(4.99) // "0:05" (within 0.02s tolerance, no decimal)
 * formatTime(4.1) // "0:04.1" (shows decimal)
 *
 * Note: Shows one decimal place when the time is >0.02s away from a whole second.
 * This provides precision while keeping the UI clean for exact second values.
 * Fixes the issue where 4.967s showing as "0:05" made users think they could
 * play/seek to exactly 5.0s when the video actually ends at 4.967s.
 */
export function formatTime(seconds: number): string {
  const rounded = Math.round(seconds);
  const delta = Math.abs(seconds - rounded);

  // Show decimals if we're >0.02s away from a round number
  // This shows "0:05.0" for 4.967s while "0:05" for 4.98s or 5.02s
  const showDecimals = delta > 0.02;

  if (showDecimals) {
    let totalSeconds = Math.floor(seconds);
    let fraction = Math.round((seconds - totalSeconds) * 10);

    // Handle case where fraction rounds to 10 (e.g., 4.967 → 4.10)
    if (fraction === 10) {
      totalSeconds += 1;
      fraction = 0;
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${fraction}`;
    }

    return `${minutes}:${secs.toString().padStart(2, "0")}.${fraction}`;
  }

  // Standard display for "clean" times (within 0.05s of a whole second)
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Parse time string to seconds
 *
 * @param timeString - Time string in MM:SS or HH:MM:SS format
 * @returns Time in seconds
 *
 * @example
 * parseTime("01:05") // 65
 * parseTime("1:01:05") // 3665
 */
export function parseTime(timeString: string): number {
  const parts = timeString.split(":").map(Number);

  if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return 0;
}
