/**
 * Timeline data types
 * All timestamps are in MILLISECONDS (ADR-005)
 */

export interface Clip {
  id: string; // UUID
  filePath: string; // Absolute path to media file
  startTime: number; // Position on timeline (ms)
  duration: number; // Total clip duration (ms)
  trimIn: number; // Trim start point (ms) - default 0
  trimOut: number; // Trim end point (ms) - default duration
  // Audio properties (optional - used in Stories 3.9, 3.10)
  fadeIn?: number; // Fade-in duration (ms)
  fadeOut?: number; // Fade-out duration (ms)
  volume?: number; // Volume level (0.0 to 1.0)
  muted?: boolean; // Whether clip is muted
}

export interface Track {
  id: string; // UUID
  trackNumber: number; // Track position (1, 2, 3...) - required for multi-track
  clips: Clip[]; // Ordered clips on track
  trackType: 'video' | 'audio';
}

export interface Timeline {
  tracks: Track[];
  totalDuration: number; // Calculated from clips (ms)
}

/**
 * Timeline view configuration
 */
export interface TimelineViewConfig {
  pixelsPerSecond: number; // Zoom level - pixels per second of timeline
  trackHeight: number; // Height of a single track in pixels
  rulerHeight: number; // Height of time ruler in pixels
}

/**
 * Timeline constants
 */
export const TIMELINE_DEFAULTS = {
  PIXELS_PER_SECOND: 50, // Default zoom: 50 pixels per second
  TRACK_HEIGHT: 80, // Default track height in pixels
  RULER_HEIGHT: 30, // Time ruler height in pixels
  MIN_CLIP_WIDTH: 10, // Minimum clip width in pixels
  SNAP_THRESHOLD: 5, // Snap distance threshold in pixels
} as const;
