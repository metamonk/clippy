/**
 * Timeline Zoom Utilities
 *
 * Pure functions for calculating zoom-related values.
 * All time values are in MILLISECONDS (ADR-005)
 * Base scale: 100 pixels per second at 1.0x zoom
 */

/** Base pixels per second at 1.0x zoom */
export const BASE_PIXELS_PER_SECOND = 100;

/** Minimum zoom level (most zoomed out) */
export const MIN_ZOOM = 0.1;

/** Maximum zoom level (most zoomed in) */
export const MAX_ZOOM = 10.0;

/**
 * Calculate pixels per second based on zoom level
 *
 * @param zoomLevel - Zoom level (0.1 to 10.0)
 * @returns Pixels per second at this zoom level
 *
 * @example
 * calculatePixelsPerSecond(0.5) => 50 px/s
 * calculatePixelsPerSecond(1.0) => 100 px/s
 * calculatePixelsPerSecond(5.0) => 500 px/s
 */
export function calculatePixelsPerSecond(zoomLevel: number): number {
  return BASE_PIXELS_PER_SECOND * zoomLevel;
}

/**
 * Calculate visible duration based on container width and zoom level
 *
 * @param containerWidth - Width of timeline container in pixels
 * @param zoomLevel - Zoom level (0.1 to 10.0)
 * @returns Visible duration in milliseconds
 *
 * @example
 * calculateVisibleDuration(1000, 1.0) => 10000ms (10 seconds)
 * calculateVisibleDuration(1000, 0.5) => 20000ms (20 seconds)
 */
export function calculateVisibleDuration(
  containerWidth: number,
  zoomLevel: number
): number {
  const pixelsPerSecond = calculatePixelsPerSecond(zoomLevel);
  return (containerWidth / pixelsPerSecond) * 1000; // Convert to milliseconds
}

/**
 * Calculate clip width in pixels based on duration and zoom level
 *
 * @param clipDuration - Clip duration in milliseconds
 * @param zoomLevel - Zoom level (0.1 to 10.0)
 * @returns Clip width in pixels
 *
 * @example
 * calculateClipWidth(30000, 0.5) => 1500 px (30s at 50 px/s)
 * calculateClipWidth(30000, 1.0) => 3000 px (30s at 100 px/s)
 * calculateClipWidth(30000, 5.0) => 15000 px (30s at 500 px/s)
 */
export function calculateClipWidth(clipDuration: number, zoomLevel: number): number {
  const pixelsPerSecond = calculatePixelsPerSecond(zoomLevel);
  return (clipDuration / 1000) * pixelsPerSecond;
}

/**
 * Calculate clip position in pixels based on start time and zoom level
 *
 * @param clipStartTime - Clip start time on timeline in milliseconds
 * @param zoomLevel - Zoom level (0.1 to 10.0)
 * @returns Clip position in pixels from timeline start
 *
 * @example
 * calculateClipPosition(5000, 1.0) => 500 px (5s at 100 px/s)
 * calculateClipPosition(10000, 2.0) => 2000 px (10s at 200 px/s)
 */
export function calculateClipPosition(clipStartTime: number, zoomLevel: number): number {
  const pixelsPerSecond = calculatePixelsPerSecond(zoomLevel);
  return (clipStartTime / 1000) * pixelsPerSecond;
}

/**
 * Clamp zoom level to valid range [MIN_ZOOM, MAX_ZOOM]
 *
 * @param level - Zoom level to clamp
 * @param min - Minimum zoom level (default: MIN_ZOOM)
 * @param max - Maximum zoom level (default: MAX_ZOOM)
 * @returns Clamped zoom level
 *
 * @example
 * clampZoomLevel(-1) => 0.1
 * clampZoomLevel(0.05) => 0.1
 * clampZoomLevel(5.0) => 5.0
 * clampZoomLevel(15.0) => 10.0
 */
export function clampZoomLevel(
  level: number,
  min: number = MIN_ZOOM,
  max: number = MAX_ZOOM
): number {
  return Math.max(min, Math.min(max, level));
}

/**
 * Maintain playhead visibility after zoom operation
 * Centers the playhead in the viewport if it was visible before zooming
 *
 * @param currentScrollPosition - Current horizontal scroll position in pixels
 * @param oldZoomLevel - Zoom level before zoom operation
 * @param newZoomLevel - Zoom level after zoom operation
 * @param playheadPosition - Playhead position on timeline in milliseconds
 * @param containerWidth - Width of timeline container in pixels
 * @returns New scroll position to maintain playhead visibility
 *
 * @example
 * // Playhead at 10s, zooming from 1x to 2x, container width 1000px
 * maintainPlayheadVisibility(500, 1.0, 2.0, 10000, 1000)
 * // => Adjusts scroll to keep playhead centered
 */
export function maintainPlayheadVisibility(
  currentScrollPosition: number,
  oldZoomLevel: number,
  newZoomLevel: number,
  playheadPosition: number,
  containerWidth: number
): number {
  // Calculate playhead pixel position at old zoom
  const playheadPixelsOld = calculateClipPosition(playheadPosition, oldZoomLevel);

  // Calculate playhead pixel position at new zoom
  const playheadPixelsNew = calculateClipPosition(playheadPosition, newZoomLevel);

  // Calculate visible area at old zoom
  const visibleStart = currentScrollPosition;
  const visibleEnd = currentScrollPosition + containerWidth;

  // Check if playhead is currently visible
  const isPlayheadVisible =
    playheadPixelsOld >= visibleStart && playheadPixelsOld <= visibleEnd;

  if (!isPlayheadVisible) {
    // Playhead not visible - don't adjust scroll
    return currentScrollPosition;
  }

  // Center playhead in view after zoom
  const centerOffset = containerWidth / 2;
  return Math.max(0, playheadPixelsNew - centerOffset);
}

/**
 * Calculate appropriate time interval for ruler markers based on zoom level
 *
 * @param zoomLevel - Current zoom level (0.1 to 10.0)
 * @returns Time interval in milliseconds for ruler markers
 *
 * Zoom ranges:
 * - 0.1-0.5x: 60000ms (1 minute) - overview mode
 * - 0.5-2.0x: 10000ms (10 seconds) - normal editing
 * - 2.0-5.0x: 1000ms (1 second) - precision mode
 * - 5.0-10x: 100ms (100 milliseconds) - frame-level mode
 */
export function getTimeInterval(zoomLevel: number): number {
  if (zoomLevel < 0.5) return 60000; // 1 minute (zoomed out)
  if (zoomLevel < 2.0) return 10000; // 10 seconds
  if (zoomLevel < 5.0) return 1000; // 1 second (zoomed in)
  return 100; // 100ms (very zoomed in)
}
