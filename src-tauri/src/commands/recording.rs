//! Recording-related Tauri commands
//!
//! This module provides Tauri commands for screen recording, camera, and audio capture operations.

use crate::services::permissions::{
    check_camera_permission, check_screen_recording_permission, request_camera_permission,
    request_screen_recording_permission,
};
use crate::services::camera::{CameraCapture, CameraInfo, CameraService};
use crate::services::ffmpeg::{FFmpegEncoder, TimestampedFrame};
use crate::services::screen_capture::{FrameHandler, ScreenCapture};
use crate::services::audio_capture::{AudioCapture, AudioSample};
use anyhow::Result as AnyhowResult;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex;
use tokio::sync::mpsc;
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

/// Global state for managing active camera previews
///
/// Maps camera index to preview task handle
type CameraPreviewHandle = tokio::task::JoinHandle<()>;

lazy_static::lazy_static! {
    static ref ACTIVE_CAMERA_PREVIEWS: Arc<Mutex<HashMap<u32, CameraPreviewHandle>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

/// Global state for managing active webcam recordings
///
/// Maps recording ID to webcam recording handles
type WebcamRecordingHandle = (
    tokio::task::JoinHandle<()>,                 // Camera capture task
    Option<tokio::task::JoinHandle<()>>,         // Audio capture task (optional)
    tokio::task::JoinHandle<AnyhowResult<()>>,   // Encoding task
    PathBuf,                                      // Video output file path
    Option<PathBuf>,                              // Audio output file path (optional)
);

lazy_static::lazy_static! {
    static ref ACTIVE_WEBCAM_RECORDINGS: Arc<Mutex<HashMap<String, WebcamRecordingHandle>>> =
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

/// Check if the app has camera permission
///
/// This command checks the current camera permission status without triggering a permission request.
///
/// # Returns
///
/// - `Ok(true)` if permission is granted
/// - `Ok(false)` if permission is not granted or not determined
/// - `Err(String)` with user-friendly error message if check fails
#[tauri::command]
pub async fn cmd_check_camera_permission() -> Result<bool, String> {
    debug!("Command: check camera permission");

    match check_camera_permission() {
        Ok(has_permission) => {
            info!("Camera permission check result: {}", has_permission);
            Ok(has_permission)
        }
        Err(e) => {
            error!("Camera permission check failed: {}", e);
            Err(e.to_string())
        }
    }
}

/// Request camera permission from the user
///
/// This command triggers the macOS system dialog asking the user to grant camera permission.
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
/// 2. Go to System Preferences → Privacy & Security → Camera
/// 3. Enable the app in the list
/// 4. Restart the app (macOS requirement)
#[tauri::command]
pub async fn cmd_request_camera_permission() -> Result<(), String> {
    debug!("Command: request camera permission");

    match request_camera_permission().await {
        Ok(()) => {
            info!("Camera permission request initiated");
            Ok(())
        }
        Err(e) => {
            error!("Camera permission request failed: {}", e);
            Err(e.to_string())
        }
    }
}

/// List all available cameras
///
/// This command enumerates all available cameras on the system.
///
/// # Returns
///
/// - `Ok(Vec<CameraInfo>)` with list of available cameras
/// - `Err(String)` with user-friendly error message if enumeration fails
///
/// # Camera Info Fields
///
/// - `id`: Camera index (used for camera selection)
/// - `name`: Human-readable camera name (e.g., "FaceTime HD Camera")
/// - `resolution`: Maximum resolution (e.g., "1920x1080")
/// - `fps`: Maximum frame rate
#[tauri::command]
pub async fn cmd_list_cameras() -> Result<Vec<CameraInfo>, String> {
    debug!("Command: list cameras");

    let camera_service = CameraService::new();
    match camera_service.list_cameras() {
        Ok(cameras) => {
            info!("Found {} cameras", cameras.len());
            Ok(cameras)
        }
        Err(e) => {
            error!("Failed to list cameras: {}", e);
            Err(e.to_string())
        }
    }
}

/// Start camera preview
///
/// This command starts a camera preview stream for the given camera index.
/// Preview frames can be polled or streamed to the frontend for display.
///
/// # Arguments
///
/// * `camera_index` - The index of the camera to preview (from `cmd_list_cameras`)
///
/// # Returns
///
/// - `Ok(())` if preview started successfully
/// - `Err(String)` with user-friendly error message if preview fails
///
/// # Notes
///
/// This is currently a stub implementation that prepares for Story 2.8.
/// Full implementation will stream frames to frontend for live preview.
#[tauri::command]
pub async fn cmd_start_camera_preview(camera_index: u32) -> Result<(), String> {
    debug!("Command: start camera preview for index {}", camera_index);

    // Check camera permission first
    match check_camera_permission() {
        Ok(true) => {
            debug!("Camera permission granted");
        }
        Ok(false) => {
            error!("Camera permission not granted");
            return Err("Camera permission required. Please enable in System Preferences → Privacy & Security → Camera".to_string());
        }
        Err(e) => {
            error!("Camera permission check failed: {}", e);
            return Err(format!("Permission check failed: {}", e));
        }
    }

    // Check if preview already running for this camera
    let mut previews = ACTIVE_CAMERA_PREVIEWS.lock().await;
    if previews.contains_key(&camera_index) {
        warn!("Camera preview already running for index {}", camera_index);
        return Err(format!("Camera preview already running for index {}", camera_index));
    }

    // Stub: In full implementation (Story 2.8), this will:
    // 1. Open camera with CameraService
    // 2. Start frame capture loop
    // 3. Stream frames to frontend via Tauri events
    // 4. Store preview handle in ACTIVE_CAMERA_PREVIEWS

    info!("Camera preview started (stub) for index {}", camera_index);

    // Create a dummy task handle for now
    let handle = tokio::spawn(async move {
        debug!("Camera preview task running (stub) for index {}", camera_index);
        // Actual preview loop will go here in Story 2.8
        tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
    });

    previews.insert(camera_index, handle);
    Ok(())
}

/// Stop camera preview
///
/// This command stops the camera preview stream for the given camera index.
///
/// # Arguments
///
/// * `camera_index` - The index of the camera to stop previewing
///
/// # Returns
///
/// - `Ok(())` if preview stopped successfully
/// - `Err(String)` with user-friendly error message if stop fails
#[tauri::command]
pub async fn cmd_stop_camera_preview(camera_index: u32) -> Result<(), String> {
    debug!("Command: stop camera preview for index {}", camera_index);

    let mut previews = ACTIVE_CAMERA_PREVIEWS.lock().await;
    let handle = previews.remove(&camera_index).ok_or_else(|| {
        error!("Camera preview not found for index {}", camera_index);
        format!("Camera preview not found for index {}", camera_index)
    })?;

    // Abort the preview task
    handle.abort();

    info!("Camera preview stopped for index {}", camera_index);
    Ok(())
}

/// Simple WAV file writer for audio samples
///
/// Writes audio samples to a WAV file incrementally during recording.
/// The WAV header is written at the start with placeholder values,
/// then updated with actual sizes when finalized.
struct WavWriter {
    file: std::fs::File,
    sample_rate: u32,
    channels: u16,
    samples_written: u64,
}

impl WavWriter {
    /// Create new WAV file and write initial header
    fn new(path: PathBuf, sample_rate: u32, channels: u16) -> std::io::Result<Self> {
        let mut file = std::fs::File::create(path)?;

        // Write WAV header with placeholder sizes (will update later)
        Self::write_wav_header(&mut file, sample_rate, channels, 0)?;

        Ok(Self {
            file,
            sample_rate,
            channels,
            samples_written: 0,
        })
    }

    /// Write audio samples to file
    fn write_samples(&mut self, samples: &[f32]) -> std::io::Result<()> {
        use std::io::Write;

        // Convert f32 samples to i16 PCM
        for sample in samples {
            let pcm_sample = (*sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
            self.file.write_all(&pcm_sample.to_le_bytes())?;
        }

        self.samples_written += samples.len() as u64;
        Ok(())
    }

    /// Finalize WAV file by updating header with actual sizes
    fn finalize(mut self) -> std::io::Result<()> {
        use std::io::{Seek, SeekFrom, Write};

        // Seek back to start and write correct header
        self.file.seek(SeekFrom::Start(0))?;
        Self::write_wav_header(&mut self.file, self.sample_rate, self.channels, self.samples_written)?;
        self.file.flush()?;

        Ok(())
    }

    /// Write WAV file header
    fn write_wav_header(file: &mut std::fs::File, sample_rate: u32, channels: u16, total_samples: u64) -> std::io::Result<()> {
        use std::io::Write;

        let bytes_per_sample = 2u16; // i16 PCM
        let byte_rate = sample_rate * channels as u32 * bytes_per_sample as u32;
        let block_align = channels * bytes_per_sample;
        let data_size = (total_samples * bytes_per_sample as u64) as u32;
        let file_size = 36 + data_size;

        // RIFF header
        file.write_all(b"RIFF")?;
        file.write_all(&file_size.to_le_bytes())?;
        file.write_all(b"WAVE")?;

        // fmt chunk
        file.write_all(b"fmt ")?;
        file.write_all(&16u32.to_le_bytes())?; // chunk size
        file.write_all(&1u16.to_le_bytes())?;  // PCM format
        file.write_all(&channels.to_le_bytes())?;
        file.write_all(&sample_rate.to_le_bytes())?;
        file.write_all(&byte_rate.to_le_bytes())?;
        file.write_all(&block_align.to_le_bytes())?;
        file.write_all(&(bytes_per_sample * 8).to_le_bytes())?; // bits per sample

        // data chunk
        file.write_all(b"data")?;
        file.write_all(&data_size.to_le_bytes())?;

        Ok(())
    }
}

/// Start webcam recording with microphone audio
///
/// This command starts webcam recording with microphone audio capture at the camera's
/// native resolution (capped at 1080p), encoding to MP4 in real-time.
///
/// # Arguments
///
/// * `camera_index` - The index of the camera to record from (from `cmd_list_cameras`)
/// * `enable_microphone` - Whether to capture microphone audio along with video
///
/// # Returns
///
/// - `Ok(String)` with recording ID on success
/// - `Err(String)` with user-friendly error message if recording fails
///
/// # Implementation
///
/// 1. Check camera (and microphone if enabled) permissions
/// 2. Open camera at native resolution (capped at 1080p)
/// 3. Start FFmpeg encoder for real-time H.264 encoding
/// 4. Spawn camera capture task (30 FPS with bounded channel backpressure)
/// 5. Spawn microphone capture task (if enabled)
/// 6. Spawn encoding task to write frames to FFmpeg stdin
/// 7. Store handles in ACTIVE_WEBCAM_RECORDINGS
#[tauri::command]
pub async fn cmd_start_webcam_recording(
    camera_index: u32,
    enable_microphone: bool,
) -> Result<String, String> {
    debug!(
        "Command: start webcam recording (camera: {}, mic: {})",
        camera_index, enable_microphone
    );

    // Check camera permission first
    match check_camera_permission() {
        Ok(true) => {
            debug!("Camera permission granted");
        }
        Ok(false) => {
            error!("Camera permission not granted");
            return Err("Camera permission required. Please enable in System Preferences → Privacy & Security → Camera".to_string());
        }
        Err(e) => {
            error!("Camera permission check failed: {}", e);
            return Err(format!("Permission check failed: {}", e));
        }
    }

    // Generate recording ID
    let recording_id = Uuid::new_v4().to_string();
    info!(
        "Starting webcam recording: {} (camera: {}, mic: {})",
        recording_id, camera_index, enable_microphone
    );

    // Create output path: ~/Documents/clippy/recordings/webcam-{uuid}.mp4
    let home_dir = dirs::home_dir().ok_or_else(|| {
        error!("Could not determine home directory");
        "Could not determine home directory".to_string()
    })?;

    let output_path = home_dir
        .join("Documents")
        .join("clippy")
        .join("recordings")
        .join(format!("webcam-{}.mp4", recording_id));

    // Ensure output directory exists
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            error!("Failed to create output directory: {}", e);
            format!("Failed to create output directory: {}", e)
        })?;
    }

    info!("Output path: {}", output_path.display());

    // Initialize camera capture
    let mut camera_capture = CameraCapture::new(camera_index).map_err(|e| {
        error!("Failed to initialize camera: {}", e);
        format!("Camera initialization failed: {}", e)
    })?;

    // Get camera resolution before starting async operations
    // Note: We need to get resolution and drop the Camera before any await points
    // because Camera is not Send
    let (width, height) = {
        let camera_service = CameraService::new();
        let camera = camera_service.open_camera(camera_index).map_err(|e| {
            error!("Failed to open camera for resolution check: {}", e);
            format!("Failed to open camera: {}", e)
        })?;

        let resolution = camera_service.get_resolution(&camera);
        let width = resolution.width();
        let height = resolution.height();

        // Cap at 1080p if higher
        let (width, height) = if height > 1080 {
            let aspect_ratio = width as f32 / height as f32;
            let new_height = 1080;
            let new_width = (new_height as f32 * aspect_ratio) as u32;
            info!(
                "Capping camera resolution from {}x{} to {}x{}",
                width, height, new_width, new_height
            );
            (new_width, new_height)
        } else {
            (width, height)
        };

        // Camera is dropped here automatically at end of scope
        (width, height)
    };

    info!("Recording at {}x{} @ 30 FPS", width, height);

    // Create FFmpeg encoder
    let mut encoder = FFmpegEncoder::new(output_path.clone(), width, height, 30).map_err(|e| {
        error!("Failed to create FFmpeg encoder: {}", e);
        format!("Failed to create encoder: {}", e)
    })?;

    // Start encoding process
    encoder.start_encoding().await.map_err(|e| {
        error!("Failed to start encoding: {}", e);
        format!("Failed to start encoding: {}", e)
    })?;

    // Create bounded channel for video frames (30 frame buffer = 1 second)
    let (video_tx, mut video_rx) = mpsc::channel::<TimestampedFrame>(30);

    // Start camera capture task
    let camera_handle = camera_capture
        .start_continuous_capture(video_tx)
        .map_err(|e| {
            error!("Failed to start camera capture: {}", e);
            format!("Failed to start camera capture: {}", e)
        })?;

    // Start microphone capture task if enabled
    let (audio_handle, audio_path) = if enable_microphone {
        info!("Initializing microphone audio capture");

        // Create audio output path
        let audio_path = output_path.with_extension("wav");

        // Create bounded channel for audio samples (100 samples buffer)
        let (audio_tx, mut audio_rx) = mpsc::channel::<AudioSample>(100);

        // Spawn blocking task to manage AudioCapture (not Send)
        let audio_path_clone = audio_path.clone();
        let handle = tokio::task::spawn_blocking(move || {
            // Initialize audio capture in blocking context
            let mut audio_capture = match AudioCapture::new() {
                Ok(capture) => capture,
                Err(e) => {
                    error!("Failed to initialize audio capture: {}", e);
                    return;
                }
            };

            // Select default microphone
            let device_name = match audio_capture.select_default_device() {
                Ok(name) => name,
                Err(e) => {
                    error!("Failed to select microphone: {}", e);
                    return;
                }
            };
            info!("Using microphone: {}", device_name);

            // Start audio capture
            if let Err(e) = audio_capture.start_capture(audio_tx) {
                error!("Failed to start audio capture: {}", e);
                return;
            }

            // Create WAV writer
            let mut writer = match WavWriter::new(audio_path_clone.clone(), 48000, 2) {
                Ok(w) => w,
                Err(e) => {
                    error!("Failed to create WAV writer: {}", e);
                    return;
                }
            };

            info!("Audio capture and writing started");
            let mut sample_count = 0;

            // Block and process audio samples
            while let Some(sample) = audio_rx.blocking_recv() {
                if let Err(e) = writer.write_samples(&sample.data) {
                    error!("Failed to write audio samples: {}", e);
                    break;
                }
                sample_count += sample.data.len();

                if sample_count % 48000 == 0 {
                    debug!("Written {} audio samples", sample_count);
                }
            }

            info!("Audio channel closed, finalizing WAV file ({} samples)", sample_count);
            if let Err(e) = writer.finalize() {
                error!("Failed to finalize WAV file: {}", e);
            } else {
                info!("Audio file finalized successfully");
            }

            // audio_capture is dropped here, stopping the stream
        });

        (Some(handle), Some(audio_path))
    } else {
        (None, None)
    };

    // Spawn encoding task to write frames to FFmpeg
    let encoding_handle = tokio::spawn(async move {
        info!("Encoding task started");
        let mut frame_count = 0;

        while let Some(frame) = video_rx.recv().await {
            if let Err(e) = encoder.write_frame_to_stdin(&frame).await {
                error!("Failed to write frame to encoder: {}", e);
                return Err(anyhow::anyhow!("Encoding failed: {}", e));
            }
            frame_count += 1;

            if frame_count % 300 == 0 {
                debug!("Encoded {} frames", frame_count);
            }
        }

        info!("Video channel closed, finalizing encoding ({} frames)", frame_count);

        // Stop encoding to finalize output file
        if let Err(e) = encoder.stop_encoding().await {
            error!("Failed to stop encoding: {}", e);
            return Err(anyhow::anyhow!("Failed to finalize encoding: {}", e));
        }

        info!("Encoding completed successfully");
        Ok(())
    });

    // Store handles in global state
    let mut recordings = ACTIVE_WEBCAM_RECORDINGS.lock().await;
    recordings.insert(
        recording_id.clone(),
        (camera_handle, audio_handle, encoding_handle, output_path, audio_path),
    );

    info!("Webcam recording started successfully: {}", recording_id);

    Ok(recording_id)
}

/// Stop webcam recording
///
/// This command stops the active webcam recording, finalizes encoding, and returns
/// the file path where the recording was saved.
///
/// # Arguments
///
/// * `recording_id` - The UUID of the webcam recording to stop
///
/// # Returns
///
/// - `Ok(String)` with file path to saved recording
/// - `Err(String)` with user-friendly error message on failure
///
/// # Flow
///
/// 1. Look up recording handles by ID from ACTIVE_WEBCAM_RECORDINGS
/// 2. Stop camera capture task (if still running)
/// 3. Stop audio capture task (if enabled and still running)
/// 4. Wait for encoding task to finish (finalize MP4)
/// 5. Return file path
///
/// # Errors
///
/// - Recording ID not found
/// - Encoding task failed (file write error)
#[tauri::command]
pub async fn cmd_stop_webcam_recording(
    recording_id: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    debug!("Command: stop webcam recording {}", recording_id);

    // Remove recording from active state
    let mut recordings = ACTIVE_WEBCAM_RECORDINGS.lock().await;
    let (camera_handle, audio_handle, encoding_handle, video_path, audio_path) = recordings
        .remove(&recording_id)
        .ok_or_else(|| {
            error!("Webcam recording not found: {}", recording_id);
            format!("Webcam recording not found: {}", recording_id)
        })?;

    // Release lock before awaiting
    drop(recordings);

    info!("Stopping webcam recording: {}", recording_id);

    // Abort camera capture task (this closes the video channel)
    camera_handle.abort();
    debug!("Camera capture task aborted");

    // Abort audio capture task if present (this closes the audio channel)
    if let Some(handle) = audio_handle {
        handle.abort();
        debug!("Audio capture task aborted");
    }

    // Wait for encoding task to complete (finalize MP4)
    match encoding_handle.await {
        Ok(Ok(())) => {
            info!("Encoding completed successfully");
        }
        Ok(Err(e)) => {
            error!("Encoding failed: {}", e);
            return Err(format!("Failed to finalize recording: {}", e));
        }
        Err(e) => {
            error!("Encoding task join error: {}", e);
            return Err(format!("Encoding task error: {}", e));
        }
    }

    // Verify video file exists
    if !video_path.exists() {
        error!("Video file not found: {}", video_path.display());
        return Err(format!("Video file not found: {}", video_path.display()));
    }

    // If audio was recorded, mux video + audio
    let final_output_path = if let Some(audio_path_val) = audio_path {
        if audio_path_val.exists() {
            info!("Muxing video and audio with FFmpeg");

            // Create final output path (replace .mp4 with -final.mp4)
            let final_path = video_path.with_file_name(
                format!("{}-final.mp4", video_path.file_stem().unwrap().to_string_lossy())
            );

            // Use FFmpeg to mux video + audio
            let status = std::process::Command::new("ffmpeg")
                .arg("-i").arg(&video_path)
                .arg("-i").arg(&audio_path_val)
                .arg("-c:v").arg("copy")  // Copy video stream (already encoded)
                .arg("-c:a").arg("aac")   // Encode audio to AAC
                .arg("-shortest")         // Match shortest stream duration
                .arg("-y")                // Overwrite output
                .arg(&final_path)
                .output()
                .map_err(|e| {
                    error!("Failed to run FFmpeg for muxing: {}", e);
                    format!("FFmpeg muxing failed: {}", e)
                })?;

            if !status.status.success() {
                let stderr = String::from_utf8_lossy(&status.stderr);
                error!("FFmpeg muxing failed: {}", stderr);
                return Err(format!("Audio muxing failed: {}", stderr));
            }

            info!("Video and audio muxed successfully");

            // Clean up temporary files
            if let Err(e) = std::fs::remove_file(&video_path) {
                warn!("Failed to delete temporary video file: {}", e);
            }
            if let Err(e) = std::fs::remove_file(&audio_path_val) {
                warn!("Failed to delete temporary audio file: {}", e);
            }

            final_path
        } else {
            warn!("Audio file not found, returning video-only file");
            video_path
        }
    } else {
        video_path
    };

    let output_path_str = final_output_path.to_string_lossy().to_string();
    info!("Webcam recording saved successfully: {}", output_path_str);

    // Auto-import the recording to media library
    info!("Auto-importing webcam recording to media library");
    match super::media::cmd_import_media(output_path_str.clone()).await {
        Ok(media_file) => {
            info!("Recording auto-imported successfully: {}", media_file.id);

            // Emit event to notify frontend
            if let Err(e) = app_handle.emit("recording-imported", &media_file) {
                warn!("Failed to emit recording-imported event: {}", e);
            }
        }
        Err(e) => {
            warn!("Auto-import failed: {}", e);
            // Don't fail the command, just log the warning
        }
    }

    Ok(output_path_str)
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
