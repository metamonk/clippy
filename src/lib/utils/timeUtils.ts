/**
 * Time formatting utilities for video player
 *
 * Handles conversion between seconds and human-readable time formats (MM:SS or HH:MM:SS).
 */

/**
 * Format seconds to MM:SS or HH:MM:SS format
 *
 * @param seconds - Time in seconds
 * @returns Formatted time string (MM:SS for < 1 hour, HH:MM:SS for >= 1 hour)
 *
 * @example
 * formatTime(65) // "01:05"
 * formatTime(3665) // "1:01:05"
 * formatTime(4.967) // "0:05" (rounds up from 4.967 to show full second)
 *
 * Note: Uses Math.round() instead of Math.floor() to properly display times
 * near the end of videos. This fixes TD-004 where 4.967s displayed as "0:04"
 * instead of "0:05", making users think playback stopped 1 second early.
 */
export function formatTime(seconds: number): string {
  // Round to nearest second instead of flooring
  // This ensures times like 4.967s display as "0:05" not "0:04"
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
