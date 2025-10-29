/**
 * Recording-related TypeScript interfaces and types
 */

/**
 * Camera information structure matching Rust CameraInfo
 */
export interface Camera {
  /** Camera index/ID */
  id: number;
  /** Camera name (e.g., "FaceTime HD Camera") */
  name: string;
  /** Maximum resolution (e.g., "1920x1080") */
  resolution: string;
  /** Maximum frame rate */
  fps: number;
}

/**
 * Recording mode types
 */
export type RecordingMode = 'screen' | 'webcam' | 'pip';

/**
 * Screen recording mode types for window selection (Story 4.1)
 */
export type ScreenRecordingMode = 'fullscreen' | 'window';

/**
 * Window information from ScreenCaptureKit
 */
export interface WindowInfo {
  /** Window ID from ScreenCaptureKit */
  windowId: number;
  /** Application name that owns the window */
  ownerName: string;
  /** Window title */
  title: string;
  /** Whether window is currently visible on screen */
  isOnScreen: boolean;
}

/**
 * Recording status types
 */
export type RecordingStatus = 'idle' | 'recording' | 'paused';

/**
 * Frame rate options for recording (Story 4.2)
 */
export type FrameRate = 30 | 60;

/**
 * Resolution options for recording (Story 4.2)
 */
export type Resolution = 'source' | '1080p' | '720p';

/**
 * PiP position in pixels (Story 4.5)
 */
export interface PipPosition {
  x: number;
  y: number;
}

/**
 * PiP size in pixels (Story 4.5)
 */
export interface PipSize {
  width: number;
  height: number;
}

/**
 * PiP preset position options (Story 4.5)
 */
export type PipPreset = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';

/**
 * Recording configuration for quality settings (Story 4.2)
 * Matches Rust RecordingConfig in src-tauri/src/models/recording.rs
 */
export interface RecordingConfig {
  /** Recording mode: screen, webcam, or pip (Story 4.6) */
  mode: RecordingMode;
  /** Frame rate in FPS (30 or 60) */
  frameRate: FrameRate;
  /** Resolution (source = native, 1080p, 720p) */
  resolution: Resolution;
  /** Enable system audio capture */
  systemAudio: boolean;
  /** Enable microphone capture */
  microphone: boolean;
  /** Screen recording mode (optional, from Story 4.1) */
  screenRecordingMode?: ScreenRecordingMode;
  /** Selected window ID (optional, from Story 4.1) */
  selectedWindowId?: number;
  /** PiP position in pixels (optional, Story 4.5) */
  pipPosition?: PipPosition;
  /** PiP size in pixels (optional, Story 4.5) */
  pipSize?: PipSize;
}
