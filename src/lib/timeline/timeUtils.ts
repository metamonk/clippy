/**
 * Timeline utility functions
 * All timestamps in MILLISECONDS (ADR-005)
 */

import { TIMELINE_DEFAULTS } from '@/types/timeline';

/**
 * Converts milliseconds to pixels based on zoom level
 * @param ms Time in milliseconds
 * @param pixelsPerSecond Zoom level (pixels per second)
 * @returns Position in pixels
 */
export function msToPixels(ms: number, pixelsPerSecond: number = TIMELINE_DEFAULTS.PIXELS_PER_SECOND): number {
  return (ms / 1000) * pixelsPerSecond;
}

/**
 * Converts pixels to milliseconds based on zoom level
 * @param pixels Position in pixels
 * @param pixelsPerSecond Zoom level (pixels per second)
 * @returns Time in milliseconds
 */
export function pixelsToMs(pixels: number, pixelsPerSecond: number = TIMELINE_DEFAULTS.PIXELS_PER_SECOND): number {
  return (pixels / pixelsPerSecond) * 1000;
}

/**
 * Formats milliseconds to MM:SS.ms display format
 * @param ms Time in milliseconds
 * @returns Formatted time string (e.g., "02:30.500")
 */
export function formatTimelineTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor(ms % 1000);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Formats milliseconds to MM:SS display format (simplified)
 * @param ms Time in milliseconds
 * @returns Formatted time string (e.g., "02:30")
 */
export function formatTimeSimple(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Calculates timeline width in pixels from duration
 * @param durationMs Total timeline duration in milliseconds
 * @param pixelsPerSecond Zoom level (pixels per second)
 * @returns Width in pixels
 */
export function calculateTimelineWidth(durationMs: number, pixelsPerSecond: number = TIMELINE_DEFAULTS.PIXELS_PER_SECOND): number {
  return msToPixels(durationMs, pixelsPerSecond);
}

/**
 * Calculates clip position and width for rendering
 * @param startTimeMs Clip start time on timeline (ms)
 * @param durationMs Clip duration (ms)
 * @param pixelsPerSecond Zoom level (pixels per second)
 * @returns Object with x position and width in pixels
 */
export function calculateClipPosition(
  startTimeMs: number,
  durationMs: number,
  pixelsPerSecond: number = TIMELINE_DEFAULTS.PIXELS_PER_SECOND
): { x: number; width: number } {
  return {
    x: msToPixels(startTimeMs, pixelsPerSecond),
    width: Math.max(msToPixels(durationMs, pixelsPerSecond), TIMELINE_DEFAULTS.MIN_CLIP_WIDTH),
  };
}

/**
 * Snaps a pixel position to the nearest second mark if within threshold
 * @param pixels Position in pixels
 * @param pixelsPerSecond Zoom level (pixels per second)
 * @param threshold Snap threshold in pixels
 * @returns Snapped position in pixels
 */
export function snapToSecond(
  pixels: number,
  pixelsPerSecond: number = TIMELINE_DEFAULTS.PIXELS_PER_SECOND,
  threshold: number = TIMELINE_DEFAULTS.SNAP_THRESHOLD
): number {
  const nearestSecondPixel = Math.round(pixels / pixelsPerSecond) * pixelsPerSecond;
  const distance = Math.abs(pixels - nearestSecondPixel);

  return distance <= threshold ? nearestSecondPixel : pixels;
}

/**
 * Generates time marker positions for the ruler
 * @param durationMs Timeline duration in milliseconds
 * @param pixelsPerSecond Zoom level (pixels per second)
 * @param intervalSeconds Interval between markers in seconds
 * @returns Array of marker objects with position (pixels) and time (ms)
 */
export function generateTimeMarkers(
  durationMs: number,
  pixelsPerSecond: number = TIMELINE_DEFAULTS.PIXELS_PER_SECOND,
  intervalSeconds: number = 10
): Array<{ position: number; time: number; label: string }> {
  const markers: Array<{ position: number; time: number; label: string }> = [];
  const intervalMs = intervalSeconds * 1000;

  for (let time = 0; time <= durationMs; time += intervalMs) {
    markers.push({
      position: msToPixels(time, pixelsPerSecond),
      time,
      label: formatTimeSimple(time),
    });
  }

  return markers;
}
