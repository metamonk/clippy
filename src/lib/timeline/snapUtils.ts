/**
 * Snap Utilities
 *
 * Provides magnetic snapping functionality for clip positioning on timeline.
 * Supports snapping to grid lines and clip edges (both start and end).
 *
 * Following ADR-005: All timestamps in MILLISECONDS
 */

import type { Timeline, SnapTarget, Clip } from '@/types/timeline';

/**
 * Calculate grid interval based on zoom level
 *
 * Returns an appropriate time interval (in ms) for grid lines based on zoom.
 * Grid should maintain reasonable spacing (target: 50-100px between lines).
 *
 * @param zoomLevel - Current timeline zoom level (0.1 to 10.0)
 * @param pixelsPerSecond - Base pixels per second at zoom level 1.0
 * @returns Grid interval in milliseconds
 */
export function calculateGridInterval(
  zoomLevel: number,
  pixelsPerSecond: number
): number {
  // Calculate effective pixels per millisecond
  const pixelsPerMs = (pixelsPerSecond / 1000) * zoomLevel;

  // Target spacing: 50-100px between grid lines
  const targetGridSpacingPx = 75;

  // Calculate milliseconds needed to achieve target spacing
  const msPerGridLine = targetGridSpacingPx / pixelsPerMs;

  // Round to nice intervals (100ms, 250ms, 500ms, 1s, 2s, 5s, 10s, 30s, 1min)
  const intervals = [100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000];

  // Find first interval >= calculated value
  const interval = intervals.find((int) => int >= msPerGridLine);

  return interval || 60000; // Default to 1 minute if all intervals too small
}

/**
 * Find all snap targets (grid lines and clip edges) for snapping calculations
 *
 * @param timeline - Current timeline state
 * @param excludeClipId - Clip ID to exclude (typically the clip being dragged)
 * @param zoomLevel - Current zoom level
 * @param pixelsPerSecond - Base pixels per second
 * @returns Array of snap targets
 */
export function findSnapTargets(
  timeline: Timeline,
  excludeClipId: string,
  zoomLevel: number,
  pixelsPerSecond: number
): SnapTarget[] {
  const targets: SnapTarget[] = [];

  // 1. Find all clip edges (all tracks) - AC #6: multi-track snapping
  timeline.tracks.forEach((track) => {
    track.clips
      .filter((clip) => clip.id !== excludeClipId)
      .forEach((clip) => {
        // Clip start time
        targets.push({
          position: clip.startTime,
          type: 'clip-start',
          trackId: track.id,
          clipId: clip.id,
        });

        // Clip end time (considering trim)
        const effectiveDuration = clip.trimOut - clip.trimIn;
        targets.push({
          position: clip.startTime + effectiveDuration,
          type: 'clip-end',
          trackId: track.id,
          clipId: clip.id,
        });
      });
  });

  // 2. Generate grid targets based on zoom level - AC #2
  const gridInterval = calculateGridInterval(zoomLevel, pixelsPerSecond);
  const maxTime = Math.max(timeline.totalDuration, 60000); // At least 1 minute of grid

  for (let t = 0; t <= maxTime; t += gridInterval) {
    targets.push({
      position: t,
      type: 'grid',
    });
  }

  return targets;
}

/**
 * Apply snap to a target position
 *
 * Finds the closest snap target within threshold and returns the snapped position.
 * Clip edges have higher priority than grid lines (AC #3 priority).
 *
 * @param targetPosition - Desired timeline position (ms)
 * @param snapTargets - Array of available snap targets
 * @param threshold - Snap threshold distance (ms)
 * @param snapEnabled - Whether snapping is enabled
 * @returns Object with snapped position and snap indicator (or null if no snap)
 */
export function applySnap(
  targetPosition: number,
  snapTargets: SnapTarget[],
  threshold: number,
  snapEnabled: boolean
): { snappedPosition: number; snapIndicator: SnapTarget | null } {
  // AC #1: Only snap when enabled
  if (!snapEnabled) {
    return { snappedPosition: targetPosition, snapIndicator: null };
  }

  let closestTarget: SnapTarget | null = null;
  let minDistance = threshold;

  // Prioritize clip edges over grid (AC #3: clip edge snapping has priority)
  const clipTargets = snapTargets.filter((t) => t.type !== 'grid');
  const gridTargets = snapTargets.filter((t) => t.type === 'grid');

  // Check clip edges first (higher priority)
  for (const target of clipTargets) {
    const distance = Math.abs(target.position - targetPosition);
    if (distance < minDistance) {
      minDistance = distance;
      closestTarget = target;
    }
  }

  // If no clip snap found, check grid
  if (!closestTarget) {
    for (const target of gridTargets) {
      const distance = Math.abs(target.position - targetPosition);
      if (distance < minDistance) {
        minDistance = distance;
        closestTarget = target;
      }
    }
  }

  // Apply snap if target found
  if (closestTarget) {
    return {
      snappedPosition: closestTarget.position,
      snapIndicator: closestTarget,
    };
  }

  // No snap occurred
  return { snappedPosition: targetPosition, snapIndicator: null };
}

/**
 * Snap a position to grid only (utility for special cases)
 *
 * @param position - Timeline position to snap (ms)
 * @param gridInterval - Grid interval (ms)
 * @param threshold - Snap threshold (ms)
 * @returns Snapped position or original if outside threshold
 */
export function snapToGrid(
  position: number,
  gridInterval: number,
  threshold: number
): number {
  // Find nearest grid line
  const nearestGridLine = Math.round(position / gridInterval) * gridInterval;

  // Check if within threshold
  const distance = Math.abs(position - nearestGridLine);

  if (distance <= threshold) {
    return nearestGridLine;
  }

  return position;
}

/**
 * Snap a position to nearest clip edge only (utility for special cases)
 *
 * @param position - Timeline position to snap (ms)
 * @param clips - Array of clips to snap to
 * @param threshold - Snap threshold (ms)
 * @param excludeClipId - Clip ID to exclude
 * @returns Snapped position or original if outside threshold
 */
export function snapToClipEdges(
  position: number,
  clips: Clip[],
  threshold: number,
  excludeClipId?: string
): number {
  let closestEdge: number | null = null;
  let minDistance = threshold;

  clips
    .filter((clip) => clip.id !== excludeClipId)
    .forEach((clip) => {
      // Check start edge
      const startDistance = Math.abs(position - clip.startTime);
      if (startDistance < minDistance) {
        minDistance = startDistance;
        closestEdge = clip.startTime;
      }

      // Check end edge
      const effectiveDuration = clip.trimOut - clip.trimIn;
      const endPosition = clip.startTime + effectiveDuration;
      const endDistance = Math.abs(position - endPosition);
      if (endDistance < minDistance) {
        minDistance = endDistance;
        closestEdge = endPosition;
      }
    });

  return closestEdge !== null ? closestEdge : position;
}
