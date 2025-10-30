import { invoke } from "@tauri-apps/api/core";

/**
 * Performance metrics structure from Rust backend
 */
export interface PerformanceMetrics {
  current_fps: number;
  average_fps: number;
  total_frames: number;
  uptime_seconds: number;
}

/**
 * Performance command response structure
 */
interface PerformanceResponse {
  success: boolean;
  message: string;
  data?: PerformanceMetrics;
}

/**
 * Get current playback FPS metrics
 *
 * Returns current FPS, average FPS, total frames, and uptime.
 * Use this to display FPS overlay in dev mode.
 *
 * @returns Performance metrics snapshot
 * @throws Error if command fails
 */
export async function getPlaybackFps(): Promise<PerformanceMetrics> {
  const response = await invoke<PerformanceResponse>("get_playback_fps");

  if (!response.success || !response.data) {
    throw new Error(response.message || "Failed to get FPS metrics");
  }

  return response.data;
}

/**
 * Record a frame for FPS tracking
 *
 * This should be called from the playback loop whenever a frame is rendered.
 * Internal function - typically called from VideoPlayer component.
 *
 * @throws Error if command fails
 */
export async function recordPlaybackFrame(): Promise<void> {
  const response = await invoke<PerformanceResponse>("record_playback_frame");

  if (!response.success) {
    throw new Error(response.message || "Failed to record frame");
  }
}

/**
 * Reset FPS counter
 *
 * Clears all recorded frames and resets counters.
 * Useful when starting a new playback session.
 *
 * @throws Error if command fails
 */
export async function resetFpsCounter(): Promise<void> {
  const response = await invoke<PerformanceResponse>("reset_fps_counter");

  if (!response.success) {
    throw new Error(response.message || "Failed to reset FPS counter");
  }
}
