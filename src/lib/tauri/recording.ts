/**
 * Tauri Recording API
 *
 * Wrapper functions for invoking Tauri backend recording commands.
 */

import { invoke } from '@tauri-apps/api/core';
import type { Camera } from '../../types/recording';

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
 */
export async function startScreenRecording(): Promise<string> {
  return invoke<string>('cmd_start_screen_recording');
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
