//! Recording-related Tauri commands
//!
//! This module provides Tauri commands for screen recording permissions and capture operations.

use crate::services::permissions::{check_screen_recording_permission, request_screen_recording_permission};
use crate::services::screen_capture::{FrameHandler, ScreenCapture};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// Global state for managing active recordings
///
/// Maps recording ID to capture task handle and frame writer handle
type RecordingHandle = (
    tokio::task::JoinHandle<()>,          // Capture task
    tokio::task::JoinHandle<Result<(), crate::services::screen_capture::FrameHandlerError>>, // Writer task
    PathBuf,                               // Output file path
);

lazy_static::lazy_static! {
    static ref ACTIVE_RECORDINGS: Arc<Mutex<HashMap<String, RecordingHandle>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

/// Check if the app has screen recording permission
///
/// This command checks the current permission status without triggering a permission request.
///
/// # Returns
///
/// - `Ok(true)` if permission is granted
/// - `Ok(false)` if permission is not granted or not determined
/// - `Err(String)` with user-friendly error message if check fails
#[tauri::command]
pub async fn cmd_check_screen_recording_permission() -> Result<bool, String> {
    debug!("Command: check screen recording permission");

    match check_screen_recording_permission() {
        Ok(has_permission) => {
            info!("Permission check result: {}", has_permission);
            Ok(has_permission)
        }
        Err(e) => {
            error!("Permission check failed: {}", e);
            Err(e.to_string())
        }
    }
}

/// Request screen recording permission from the user
///
/// This command triggers the macOS system dialog asking the user to grant screen recording permission.
/// After calling this, the user must manually enable the app in System Preferences.
///
/// # Returns
///
/// - `Ok(())` if permission request was initiated
/// - `Err(String)` with user-friendly error message if request fails
///
/// # Notes
///
/// The permission is not granted immediately. The user must:
/// 1. See the system dialog
/// 2. Go to System Preferences → Privacy & Security → Screen Recording
/// 3. Enable the app in the list
/// 4. Restart the app (macOS requirement)
#[tauri::command]
pub async fn cmd_request_screen_recording_permission() -> Result<(), String> {
    debug!("Command: request screen recording permission");

    match request_screen_recording_permission() {
        Ok(()) => {
            info!("Screen recording permission request initiated");
            Ok(())
        }
        Err(e) => {
            error!("Permission request failed: {}", e);
            Err(e.to_string())
        }
    }
}

/// Start screen recording
///
/// This command initializes ScreenCaptureKit, starts continuous frame capture at 30 FPS,
/// and begins writing frames to a temporary file location.
///
/// # Returns
///
/// - `Ok(String)` with recording ID (UUID) on success
/// - `Err(String)` with user-friendly error message on failure
///
/// # Flow
///
/// 1. Check screen recording permission
/// 2. Generate unique recording ID
/// 3. Create output file path: ~/Documents/clippy/recordings/recording-{uuid}.raw
/// 4. Initialize ScreenCapture service
/// 5. Create FrameHandler with bounded channel (30 frames)
/// 6. Start capture loop (30 FPS)
/// 7. Start frame writer task
/// 8. Store handles in global state
///
/// # Errors
///
/// - Permission denied
/// - ScreenCaptureKit initialization failed
/// - Device not available
#[tauri::command]
pub async fn cmd_start_screen_recording() -> Result<String, String> {
    debug!("Command: start screen recording");

    // Check permission first
    match check_screen_recording_permission() {
        Ok(true) => {
            debug!("Screen recording permission granted");
        }
        Ok(false) => {
            error!("Screen recording permission not granted");
            return Err("Screen recording permission required. Please enable in System Preferences → Privacy & Security → Screen Recording".to_string());
        }
        Err(e) => {
            error!("Permission check failed: {}", e);
            return Err(format!("Permission check failed: {}", e));
        }
    }

    // Generate recording ID
    let recording_id = Uuid::new_v4().to_string();
    info!("Starting screen recording: {}", recording_id);

    // Create output path: ~/Documents/clippy/recordings/recording-{uuid}.raw
    let home_dir = dirs::home_dir().ok_or_else(|| {
        error!("Could not determine home directory");
        "Could not determine home directory".to_string()
    })?;

    let output_path = home_dir
        .join("Documents")
        .join("clippy")
        .join("recordings")
        .join(format!("recording-{}.raw", recording_id));

    info!("Output path: {}", output_path.display());

    // Initialize ScreenCapture
    let mut screen_capture = ScreenCapture::new().map_err(|e| {
        error!("Failed to initialize ScreenCapture: {}", e);
        format!("Screen capture initialization failed: {}", e)
    })?;

    // Create FrameHandler with bounded channel (30 frames)
    let mut frame_handler = FrameHandler::new(output_path.clone(), 30);
    let frame_tx = frame_handler.get_sender();

    // Start frame writer task
    let writer_handle = frame_handler.start_writer().await.map_err(|e| {
        error!("Failed to start frame writer: {}", e);
        format!("Failed to start frame writer: {}", e)
    })?;

    // Start continuous capture (without system audio for now)
    let capture_handle = screen_capture
        .start_continuous_capture(frame_tx, None)
        .map_err(|e| {
            error!("Failed to start screen capture: {}", e);
            format!("Failed to start screen capture: {}", e)
        })?;

    // Store handles in global state
    let mut recordings = ACTIVE_RECORDINGS.lock().await;
    recordings.insert(
        recording_id.clone(),
        (capture_handle, writer_handle, output_path),
    );

    info!("Screen recording started successfully: {}", recording_id);

    Ok(recording_id)
}

/// Stop screen recording
///
/// This command stops the active recording, flushes remaining frames, and returns
/// the file path where the recording was saved.
///
/// # Arguments
///
/// * `recording_id` - The UUID of the recording to stop
///
/// # Returns
///
/// - `Ok(String)` with file path to saved recording
/// - `Err(String)` with user-friendly error message on failure
///
/// # Flow
///
/// 1. Look up recording handles by ID
/// 2. Drop frame sender (signals capture to stop)
/// 3. Wait for capture task to complete
/// 4. Wait for writer task to finish (flushes remaining frames)
/// 5. Return file path
///
/// # Errors
///
/// - Recording ID not found
/// - Capture task failed
/// - Writer task failed (file write error)
#[tauri::command]
pub async fn cmd_stop_recording(recording_id: String) -> Result<String, String> {
    debug!("Command: stop recording {}", recording_id);

    // Remove recording from active state
    let mut recordings = ACTIVE_RECORDINGS.lock().await;
    let (capture_handle, writer_handle, output_path) = recordings
        .remove(&recording_id)
        .ok_or_else(|| {
            error!("Recording not found: {}", recording_id);
            format!("Recording not found: {}", recording_id)
        })?;

    // Release lock before awaiting
    drop(recordings);

    info!("Stopping recording: {}", recording_id);

    // Wait for capture task to complete
    // (it will stop when the frame channel is closed by dropping writer)
    match capture_handle.await {
        Ok(_) => {
            debug!("Capture task completed");
        }
        Err(e) => {
            warn!("Capture task join error: {}", e);
        }
    }

    // Wait for writer task to finish (flushes remaining frames)
    match writer_handle.await {
        Ok(Ok(())) => {
            info!("Frame writer completed successfully");
        }
        Ok(Err(e)) => {
            error!("Frame writer failed: {}", e);
            return Err(format!("Failed to save recording: {}", e));
        }
        Err(e) => {
            error!("Writer task join error: {}", e);
            return Err(format!("Writer task error: {}", e));
        }
    }

    // Verify file exists
    if !output_path.exists() {
        error!("Recording file not found: {}", output_path.display());
        return Err(format!("Recording file not found: {}", output_path.display()));
    }

    let output_path_str = output_path.to_string_lossy().to_string();
    info!("Recording saved successfully: {}", output_path_str);

    Ok(output_path_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[cfg(target_os = "macos")]
    async fn test_check_permission_command_returns_result() {
        let result = cmd_check_screen_recording_permission().await;
        assert!(result.is_ok(), "Command should return Ok");
    }

    #[tokio::test]
    #[cfg(target_os = "macos")]
    async fn test_request_permission_command_does_not_panic() {
        let result = cmd_request_screen_recording_permission().await;
        // Should either succeed or return proper error
        match result {
            Ok(()) => {}
            Err(e) => {
                assert!(!e.is_empty(), "Error message should not be empty");
            }
        }
    }
}
