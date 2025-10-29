/**
 * Tauri Recording API
 *
 * Wrapper functions for invoking Tauri backend recording commands.
 */

import { invoke } from '@tauri-apps/api/core';
import type { Camera, RecordingConfig, WindowInfo } from '../../types/recording';

/**
 * Check if screen recording permission is granted
 */
export async function checkScreenRecordingPermission(): Promise<boolean> {
  return invoke<boolean>('cmd_check_screen_recording_permission');
}

/**
 * Request screen recording permission
 */
export async function requestScreenRecordingPermission(): Promise<void> {
  return invoke('cmd_request_screen_recording_permission');
}

/**
 * Start screen recording
 * Returns a recording ID (UUID) for tracking
 * @param config - Optional recording configuration (Story 4.2)
 */
export async function startScreenRecording(config?: RecordingConfig): Promise<string> {
  return invoke<string>('cmd_start_screen_recording', { config });
}

/**
 * Stop the current recording
 * Returns the file path where the recording was saved
 */
export async function stopRecording(recordingId: string): Promise<string> {
  return invoke<string>('cmd_stop_recording', { recordingId });
}

/**
 * Check if camera permission is granted
 */
export async function checkCameraPermission(): Promise<boolean> {
  return invoke<boolean>('cmd_check_camera_permission');
}

/**
 * Request camera permission
 */
export async function requestCameraPermission(): Promise<void> {
  return invoke('cmd_request_camera_permission');
}

/**
 * List all available cameras
 * Returns array of camera information (id, name, resolution, fps)
 */
export async function listCameras(): Promise<Camera[]> {
  return invoke<Camera[]>('cmd_list_cameras');
}

/**
 * Start camera preview for the given camera index
 */
export async function startCameraPreview(cameraIndex: number): Promise<void> {
  return invoke('cmd_start_camera_preview', { cameraIndex });
}

/**
 * Stop camera preview for the given camera index
 */
export async function stopCameraPreview(cameraIndex: number): Promise<void> {
  return invoke('cmd_stop_camera_preview', { cameraIndex });
}

/**
 * Start webcam recording with optional microphone audio
 * Returns a recording ID (UUID) for tracking
 *
 * @param cameraIndex - The index of the camera to record from
 * @param enableMicrophone - Whether to capture microphone audio (default: false)
 */
export async function startWebcamRecording(
  cameraIndex: number,
  enableMicrophone = false
): Promise<string> {
  return invoke<string>('cmd_start_webcam_recording', { cameraIndex, enableMicrophone });
}

/**
 * Stop webcam recording
 * Returns the file path where the recording was saved
 *
 * @param recordingId - The UUID of the webcam recording to stop
 */
export async function stopWebcamRecording(recordingId: string): Promise<string> {
  return invoke<string>('cmd_stop_webcam_recording', { recordingId });
}

/**
 * Pause the current recording
 *
 * @param recordingId - The UUID of the recording to pause
 */
export async function pauseRecording(recordingId: string): Promise<void> {
  return invoke('cmd_pause_recording', { recordingId });
}

/**
 * Resume a paused recording
 *
 * @param recordingId - The UUID of the recording to resume
 */
export async function resumeRecording(recordingId: string): Promise<void> {
  return invoke('cmd_resume_recording', { recordingId });
}

/**
 * Cancel the current recording (discards partial recording)
 *
 * @param recordingId - The UUID of the recording to cancel
 */
export async function cancelRecording(recordingId: string): Promise<void> {
  return invoke('cmd_cancel_recording', { recordingId });
}

/**
 * Check available disk space at the given path
 * Returns available bytes
 *
 * @param path - The directory path to check (default: recordings directory)
 */
export async function checkDiskSpace(path: string): Promise<number> {
  return invoke<number>('cmd_check_disk_space', { path });
}

/**
 * Send a native macOS notification
 *
 * @param title - The notification title
 * @param body - The notification body
 */
export async function sendRecordingNotification(title: string, body: string): Promise<void> {
  return invoke('cmd_send_recording_notification', { title, body });
}

/**
 * Get list of available windows for window recording (Story 4.1)
 * Returns array of capturable windows from ScreenCaptureKit
 */
export async function getAvailableWindows(): Promise<WindowInfo[]> {
  return invoke<WindowInfo[]>('cmd_get_available_windows');
}

/**
 * Start Picture-in-Picture (PiP) recording - screen + webcam simultaneously (Story 4.6)
 * Returns a recording ID (UUID) for tracking
 *
 * @param cameraIndex - The index of the camera to use for the webcam feed
 * @param pipX - X position of the PiP overlay (pixels from left)
 * @param pipY - Y position of the PiP overlay (pixels from top)
 * @param pipWidth - Width of the PiP overlay in pixels
 * @param pipHeight - Height of the PiP overlay in pixels
 * @param outputPath - Path where the composited MP4 will be saved
 */
export async function startPipRecording(
  cameraIndex: number,
  pipX: number,
  pipY: number,
  pipWidth: number,
  pipHeight: number,
  outputPath: string
): Promise<string> {
  return invoke<string>('cmd_start_pip_recording', {
    cameraIndex,
    pipX,
    pipY,
    pipWidth,
    pipHeight,
    outputPath,
  });
}

/**
 * Stop Picture-in-Picture (PiP) recording (Story 4.6)
 * Returns the file path where the composited recording was saved
 *
 * @param recordingId - The UUID of the PiP recording to stop
 */
export async function stopPipRecording(recordingId: string): Promise<string> {
  return invoke<string>('cmd_stop_pip_recording', { recordingId });
}
