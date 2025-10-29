/**
 * Tauri Recording API
 *
 * Wrapper functions for invoking Tauri backend recording commands.
 */

import { invoke } from '@tauri-apps/api/core';

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
