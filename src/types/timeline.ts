/**
 * Timeline data types
 * All timestamps are in MILLISECONDS (ADR-005)
 */

/**
 * Audio track metadata for multi-audio clips (Story 4.7)
 */
export interface AudioTrack {
  trackIndex: number; // Track index (0-based: 0 = first audio track, 1 = second, etc.)
  label: string; // Human-readable label (e.g., "System Audio", "Microphone", "Webcam")
  volume: number; // Volume level for this track (0.0 to 1.0)
  muted: boolean; // Whether this track is muted
}

/**
 * Clip transform for PiP positioning and sizing (Story 5.6)
 */
export interface ClipTransform {
  x: number; // X position in pixels from left
  y: number; // Y position in pixels from top
  width: number; // Scaled width in pixels
  height: number; // Scaled height in pixels
  opacity: number; // Opacity (0.0 to 1.0) for alpha channel support
}

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
  // Multiple audio tracks for PiP recordings (Story 4.7)
  // Each track can be independently muted/volume controlled
  audioTracks?: AudioTrack[];
  // Transform for PiP effects (Story 5.6)
  // Optional - only used for video clips with position/scale overrides
  transform?: ClipTransform;
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
  zoomLevel?: number; // Zoom multiplier (0.1x to 10x) - Story 3.6
}

/**
 * Snap target for timeline snapping (Story 3.7)
 */
export interface SnapTarget {
  position: number; // Time position in milliseconds
  type: 'clip-start' | 'clip-end' | 'grid';
  trackId?: string; // Only for clip snapping
  clipId?: string; // Only for clip snapping
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
