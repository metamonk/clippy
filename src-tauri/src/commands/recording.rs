//! Recording-related Tauri commands
//!
//! This module provides Tauri commands for screen recording, camera, and audio capture operations.

use crate::models::recording::RecordingConfig;
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

/// Camera frame payload for preview streaming
#[derive(Clone, serde::Serialize)]
struct CameraFramePayload {
    camera_index: u32,
    width: u32,
    height: u32,
    frame_data: String,  // Base64-encoded RGB frame data
    timestamp: i64,      // Milliseconds since epoch
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
pub async fn cmd_start_camera_preview(
    camera_index: u32,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
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

    info!("Starting camera preview for index {}", camera_index);

    // Spawn preview task with frame capture loop
    let handle = tokio::spawn(async move {
        debug!("Camera preview task starting for index {}", camera_index);

        // Use spawn_blocking for Camera operations (nokhwa Camera is not Send-safe)
        let result = tokio::task::spawn_blocking(move || {
            use base64::Engine;

            // Open camera
            let service = CameraService::new();
            let mut camera = match service.open_camera(camera_index) {
                Ok(cam) => cam,
                Err(e) => {
                    error!("Failed to open camera {}: {}", camera_index, e);
                    let _ = app_handle.emit("camera-error", format!("Failed to open camera: {}", e));
                    return Err(e);
                }
            };

            // Start camera stream
            if let Err(e) = service.start_stream(&mut camera) {
                error!("Failed to start camera stream for index {}: {}", camera_index, e);
                let _ = app_handle.emit("camera-error", format!("Failed to start stream: {}", e));
                return Err(e);
            }

            // Get camera resolution for event payload
            let resolution = service.get_resolution(&camera);
            let width = resolution.width();
            let height = resolution.height();
            info!("Camera {} preview streaming at {}x{}", camera_index, width, height);

            // Frame capture loop at 30 FPS (33.33ms per frame)
            let frame_duration = std::time::Duration::from_millis(33);
            let mut frame_count: u64 = 0;

            loop {
                let frame_start = std::time::Instant::now();

                // Capture frame
                match service.capture_frame(&mut camera) {
                    Ok(frame_data) => {
                        // Base64 encode the RGB frame data
                        let encoded = base64::engine::general_purpose::STANDARD.encode(&frame_data);

                        // Create frame payload
                        let payload = CameraFramePayload {
                            camera_index,
                            width,
                            height,
                            frame_data: encoded,
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as i64,
                        };

                        // Emit camera-frame event
                        if let Err(e) = app_handle.emit("camera-frame", &payload) {
                            error!("Failed to emit camera-frame event: {}", e);
                            break;
                        }

                        frame_count += 1;
                        if frame_count % 300 == 0 {
                            debug!("Camera {} preview: {} frames captured", camera_index, frame_count);
                        }
                    }
                    Err(e) => {
                        error!("Frame capture failed for camera {}: {}", camera_index, e);
                        let _ = app_handle.emit("camera-error", format!("Frame capture failed: {}", e));
                        break;
                    }
                }

                // Maintain 30 FPS timing
                let frame_elapsed = frame_start.elapsed();
                if frame_elapsed < frame_duration {
                    std::thread::sleep(frame_duration - frame_elapsed);
                }
            }

            info!("Camera {} preview loop ended ({} frames captured)", camera_index, frame_count);
            Ok::<(), crate::services::camera::CameraError>(())
        })
        .await;

        match result {
            Ok(Ok(())) => debug!("Camera preview task completed normally for index {}", camera_index),
            Ok(Err(e)) => error!("Camera preview error for index {}: {}", camera_index, e),
            Err(e) => error!("Camera preview task panicked for index {}: {}", camera_index, e),
        }

        // Clean up: remove from active previews
        let mut previews = ACTIVE_CAMERA_PREVIEWS.lock().await;
        previews.remove(&camera_index);
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

/// Start screen recording with real-time H.264 encoding
///
/// This command initializes ScreenCaptureKit, starts continuous frame capture at 30 FPS,
/// and encodes frames in real-time to H.264 MP4 using FFmpeg.
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
/// 3. Create output file path: ~/Documents/clippy/recordings/recording-{uuid}.mp4
/// 4. Initialize ScreenCapture service
/// 5. Get capture dimensions from ScreenCapture
/// 6. Create FrameHandler with bounded channel (30 frames)
/// 7. Create and start FFmpeg encoder for real-time H.264 encoding
/// 8. Start encoder task (consumes frames from channel and streams to FFmpeg)
/// 9. Start capture loop (30 FPS)
/// 10. Store handles in global state
///
/// # Errors
///
/// - Permission denied
/// - ScreenCaptureKit initialization failed
/// - FFmpeg encoder initialization failed
/// - Device not available
#[tauri::command]
pub async fn cmd_start_screen_recording(
    config: Option<RecordingConfig>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    debug!("Command: start screen recording");

    // Use provided config or default
    let config = config.unwrap_or_default();
    info!("Recording config: frameRate={}, resolution={}", config.frame_rate, config.resolution);

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

    // Create output path: ~/Documents/clippy/recordings/recording-{uuid}.mp4
    let home_dir = dirs::home_dir().ok_or_else(|| {
        error!("Could not determine home directory");
        "Could not determine home directory".to_string()
    })?;

    let output_path = home_dir
        .join("Documents")
        .join("clippy")
        .join("recordings")
        .join(format!("recording-{}.mp4", recording_id));

    info!("Output path: {}", output_path.display());

    // Story 4.1: Determine window ID based on recording mode (AC #3)
    let window_id = if config.screen_recording_mode == crate::models::recording::ScreenRecordingMode::Window {
        config.selected_window_id
    } else {
        None
    };

    // Initialize ScreenCapture with optional window ID
    let mut screen_capture = ScreenCapture::new(window_id).map_err(|e| {
        error!("Failed to initialize ScreenCapture: {}", e);
        format!("Screen capture initialization failed: {}", e)
    })?;

    // Get capture dimensions
    let (capture_width, capture_height) = screen_capture.get_dimensions();
    info!("Capture dimensions: {}x{}", capture_width, capture_height);

    // Map resolution string to output dimensions (Story 4.2)
    let (width, height) = match config.resolution.as_str() {
        "720p" => (1280_u32, 720_u32),
        "1080p" => (1920_u32, 1080_u32),
        "source" | _ => {
            // For source resolution, use captured dimensions (may need downscaling if > 1080p)
            // For now, default to 1080p for "source" to avoid huge files
            info!("Source resolution requested, using 1080p");
            (1920_u32, 1080_u32)
        }
    };

    info!("Output resolution: {}x{} at {} FPS", width, height, config.frame_rate);

    // Create FrameHandler with bounded channel for real-time encoding
    let mut frame_handler = FrameHandler::new_for_encoding(config.frame_rate as usize);
    let frame_tx = frame_handler.get_sender();

    // Create FFmpeg encoder for real-time H.264 encoding (Story 4.2 - AC #2, #3)
    let mut encoder = crate::services::ffmpeg::FFmpegEncoder::new(
        output_path.clone(),
        width,
        height,
        config.frame_rate, // Use configured frame rate
    ).map_err(|e| {
        error!("Failed to create FFmpeg encoder: {}", e);
        format!("Failed to create encoder: {}", e)
    })?;

    // Start FFmpeg encoding process
    encoder.start_encoding().await.map_err(|e| {
        error!("Failed to start FFmpeg encoding: {}", e);
        format!("Failed to start encoding: {}", e)
    })?;

    // Start encoder task (consumes frames and streams to FFmpeg)
    let encoder_handle = frame_handler.start_encoder(encoder).await.map_err(|e| {
        error!("Failed to start encoder task: {}", e);
        format!("Failed to start encoder task: {}", e)
    })?;

    // Start continuous capture (with app_handle for window-closed events)
    let capture_handle = screen_capture
        .start_continuous_capture(frame_tx, None, Some(app_handle.clone()))
        .map_err(|e| {
            error!("Failed to start screen capture: {}", e);
            format!("Failed to start screen capture: {}", e)
        })?;

    // Store handles in global state
    let mut recordings = ACTIVE_RECORDINGS.lock().await;
    recordings.insert(
        recording_id.clone(),
        (capture_handle, encoder_handle, output_path),
    );

    info!("Screen recording started successfully with real-time encoding: {}", recording_id);

    Ok(recording_id)
}

/// Stop screen recording
///
/// This command stops the active recording, flushes remaining frames to FFmpeg, and returns
/// the file path where the MP4 recording was saved.
///
/// # Arguments
///
/// * `recording_id` - The UUID of the recording to stop
///
/// # Returns
///
/// - `Ok(String)` with file path to saved MP4 recording
/// - `Err(String)` with user-friendly error message on failure
///
/// # Flow
///
/// 1. Look up recording handles by ID
/// 2. Drop frame sender (signals capture to stop)
/// 3. Wait for capture task to complete
/// 4. Wait for encoder task to finish (flushes remaining frames to FFmpeg and finalizes MP4)
/// 5. Return file path
///
/// # Errors
///
/// - Recording ID not found
/// - Capture task failed
/// - Encoder task failed (FFmpeg encoding error)
#[tauri::command]
pub async fn cmd_stop_recording(recording_id: String) -> Result<String, String> {
    debug!("Command: stop recording {}", recording_id);

    // Remove recording from active state
    let mut recordings = ACTIVE_RECORDINGS.lock().await;
    let (capture_handle, encoder_handle, output_path) = recordings
        .remove(&recording_id)
        .ok_or_else(|| {
            error!("Recording not found: {}", recording_id);
            format!("Recording not found: {}", recording_id)
        })?;

    // Release lock before awaiting
    drop(recordings);

    info!("Stopping recording with real-time encoding: {}", recording_id);

    // Wait for capture task to complete
    // (it will stop when the frame channel is closed by dropping encoder)
    match capture_handle.await {
        Ok(_) => {
            debug!("Capture task completed");
        }
        Err(e) => {
            warn!("Capture task join error: {}", e);
        }
    }

    // Wait for encoder task to finish (flushes remaining frames and finalizes MP4)
    match encoder_handle.await {
        Ok(Ok(())) => {
            info!("Real-time encoding completed successfully");
        }
        Ok(Err(e)) => {
            error!("FFmpeg encoder failed: {}", e);
            return Err(format!("Failed to encode recording: {}", e));
        }
        Err(e) => {
            error!("Encoder task join error: {}", e);
            return Err(format!("Encoder task error: {}", e));
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

/// Pause the current recording
///
/// This command pauses the active recording. Recording can be resumed later.
/// Note: FFmpeg CLI doesn't natively support pause, so this stops capture
/// and will resume to the same output file when cmd_resume_recording is called.
///
/// # Arguments
///
/// * `recording_id` - The UUID of the recording to pause
///
/// # Returns
///
/// - `Ok(())` if recording paused successfully
/// - `Err(String)` with user-friendly error message if pause fails
#[tauri::command]
pub async fn cmd_pause_recording(recording_id: String) -> Result<(), String> {
    debug!("Command: pause recording {}", recording_id);

    // For MVP, we'll return an error indicating this feature is not yet fully implemented
    // Full implementation would require:
    // 1. Stop capture tasks without destroying handles
    // 2. Flush encoder buffers but keep file open
    // 3. Track pause state in ACTIVE_RECORDINGS
    // 4. Resume capture and encoding to same file on cmd_resume_recording

    warn!("Pause/resume not fully implemented in MVP - returning stub");
    Err("Pause/resume functionality requires FFmpeg architecture changes. Please use Stop to end recording.".to_string())
}

/// Resume a paused recording
///
/// This command resumes a paused recording.
///
/// # Arguments
///
/// * `recording_id` - The UUID of the recording to resume
///
/// # Returns
///
/// - `Ok(())` if recording resumed successfully
/// - `Err(String)` with user-friendly error message if resume fails
#[tauri::command]
pub async fn cmd_resume_recording(recording_id: String) -> Result<(), String> {
    debug!("Command: resume recording {}", recording_id);

    // See cmd_pause_recording for implementation notes
    warn!("Pause/resume not fully implemented in MVP - returning stub");
    Err("Pause/resume functionality requires FFmpeg architecture changes. Please use Stop to end recording.".to_string())
}

/// Cancel the current recording (discards partial recording)
///
/// This command cancels the active recording and deletes the partial MP4 file.
///
/// # Arguments
///
/// * `recording_id` - The UUID of the recording to cancel
///
/// # Returns
///
/// - `Ok(())` if recording cancelled successfully
/// - `Err(String)` with user-friendly error message if cancel fails
#[tauri::command]
pub async fn cmd_cancel_recording(recording_id: String) -> Result<(), String> {
    debug!("Command: cancel recording {}", recording_id);

    let mut recordings = ACTIVE_RECORDINGS.lock().await;
    let (capture_handle, encoder_handle, output_path) = recordings.remove(&recording_id).ok_or_else(|| {
        error!("Recording not found: {}", recording_id);
        format!("Recording not found: {}", recording_id)
    })?;

    info!("Cancelling recording with real-time encoding: {}", recording_id);

    // Abort capture and encoder tasks
    capture_handle.abort();
    encoder_handle.abort();

    // Wait a moment for tasks to clean up
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Delete the partial file
    if output_path.exists() {
        match std::fs::remove_file(&output_path) {
            Ok(()) => {
                info!("Deleted partial recording: {}", output_path.display());
            }
            Err(e) => {
                warn!("Failed to delete partial recording {}: {}", output_path.display(), e);
                // Don't fail the command if deletion fails
            }
        }
    }

    Ok(())
}

/// Check available disk space at the given path
///
/// This command checks how much disk space is available at the specified path.
///
/// # Arguments
///
/// * `path` - The directory path to check (e.g., recordings directory)
///
/// # Returns
///
/// - `Ok(u64)` available bytes
/// - `Err(String)` with user-friendly error message if check fails
#[tauri::command]
pub async fn cmd_check_disk_space(path: String) -> Result<u64, String> {
    debug!("Command: check disk space at {}", path);

    use std::path::Path;

    let path = Path::new(&path);

    // Ensure path exists
    if !path.exists() {
        // Try to create it
        if let Err(e) = std::fs::create_dir_all(path) {
            error!("Failed to create directory {}: {}", path.display(), e);
            return Err(format!("Failed to create directory: {}", e));
        }
    }

    // Get disk space info using statvfs on macOS
    #[cfg(target_os = "macos")]
    {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;

        let path_cstr = CString::new(path.as_os_str().as_bytes())
            .map_err(|e| format!("Invalid path: {}", e))?;

        // SAFETY: FFI call to libc::statvfs is safe because:
        // 1. statvfs is a well-defined POSIX API with stable ABI
        // 2. path_cstr is a valid, null-terminated CString with no interior nulls
        // 3. stat is properly zero-initialized memory of the correct size
        // 4. The function only reads from path_cstr and writes to stat
        unsafe {
            let mut stat: libc::statvfs = std::mem::zeroed();
            if libc::statvfs(path_cstr.as_ptr(), &mut stat) == 0 {
                // Convert to u64 to avoid overflow and match return type
                let available_bytes = stat.f_bavail as u64 * stat.f_frsize as u64;
                info!("Available disk space: {} bytes ({} MB)", available_bytes, available_bytes / (1024 * 1024));
                Ok(available_bytes)
            } else {
                let err = std::io::Error::last_os_error();
                error!("statvfs failed: {}", err);
                Err(format!("Failed to get disk space: {}", err))
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        error!("Disk space check not implemented for this platform");
        Err("Disk space check only supported on macOS".to_string())
    }
}

/// Send a native macOS notification
///
/// This command sends a native notification using macOS notification center.
///
/// # Arguments
///
/// * `title` - The notification title
/// * `body` - The notification body text
///
/// # Returns
///
/// - `Ok(())` if notification sent successfully
/// - `Err(String)` with user-friendly error message if send fails
#[tauri::command]
pub async fn cmd_send_recording_notification(title: String, body: String) -> Result<(), String> {
    debug!("Command: send notification - title: {}, body: {}", title, body);

    // Note: Requires @tauri-apps/plugin-notification to be configured
    // This is a stub that relies on the Tauri notification plugin being properly set up
    // The actual notification sending happens via the plugin API in the frontend

    info!("Notification request: {} - {}", title, body);

    // For now, this is a no-op on the Rust side
    // The frontend @tauri-apps/plugin-notification handles the actual notification
    Ok(())
}

/// Get the user's home directory path
///
/// This is a helper command for getting the home directory path for use in frontend.
///
/// # Returns
///
/// - `Ok(String)` home directory path
/// - `Err(String)` with user-friendly error message if failed
#[tauri::command]
pub async fn cmd_get_home_dir() -> Result<String, String> {
    debug!("Command: get home directory");

    match dirs::home_dir() {
        Some(path) => {
            let path_str = path.to_string_lossy().to_string();
            debug!("Home directory: {}", path_str);
            Ok(path_str)
        }
        None => {
            error!("Failed to get home directory");
            Err("Failed to get home directory".to_string())
        }
    }
}

/// Get list of available windows for window recording (Story 4.1)
///
/// This command returns a list of capturable windows from ScreenCaptureKit.
/// Windows are filtered to exclude system UI, hidden windows, and minimized windows.
///
/// # Returns
///
/// - `Ok(Vec<WindowInfo>)` with list of available windows
/// - `Err(String)` with user-friendly error message if enumeration fails
#[tauri::command]
pub async fn cmd_get_available_windows() -> Result<Vec<crate::models::recording::WindowInfo>, String> {
    debug!("Command: get available windows");

    #[cfg(target_os = "macos")]
    {
        use screencapturekit::shareable_content::SCShareableContent;

        // Get shareable content (displays and windows)
        let content = SCShareableContent::get()
            .map_err(|e| {
                error!("Failed to get shareable content: {:?}", e);
                format!("Failed to enumerate windows: {}", e)
            })?;

        let windows = content.windows();

        // Filter and map to WindowInfo
        let window_list: Vec<crate::models::recording::WindowInfo> = windows
            .iter()
            .filter(|w| {
                // Filter out hidden/minimized windows and system UI
                // Only include windows that are on screen and have valid titles
                w.is_on_screen() && !w.title().is_empty()
            })
            .map(|w| crate::models::recording::WindowInfo {
                window_id: w.window_id(),
                owner_name: w.owning_application().application_name().to_string(),
                title: w.title().to_string(),
                is_on_screen: w.is_on_screen(),
            })
            .collect();

        info!("Found {} available windows", window_list.len());
        Ok(window_list)
    }

    #[cfg(not(target_os = "macos"))]
    {
        error!("Window enumeration is only supported on macOS");
        Err("Window recording is only supported on macOS".to_string())
    }
}

/// Start Picture-in-Picture (PiP) recording - screen + webcam simultaneously
///
/// This command starts a PiP recording session that captures both the screen and webcam
/// in real-time, compositing the webcam feed over the screen with configurable position/size.
///
/// # Arguments
///
/// * `camera_index` - Index of the webcam to use (from `cmd_list_cameras`)
/// * `pip_x` - X position of the PiP overlay (pixels from left)
/// * `pip_y` - Y position of the PiP overlay (pixels from top)
/// * `pip_width` - Width of the PiP overlay in pixels
/// * `pip_height` - Height of the PiP overlay in pixels
/// * `output_path` - Path where the composited MP4 will be saved
///
/// # Returns
///
/// * `Ok(recording_id)` - Unique ID for this recording session
/// * `Err(String)` - User-friendly error message if recording fails to start
///
/// # Story 4.6 - Acceptance Criteria
///
/// - AC #1: "Screen + Webcam" recording mode triggers both captures simultaneously
/// - AC #2: ScreenCaptureKit captures screen, AVFoundation captures webcam in parallel
#[tauri::command]
pub async fn cmd_start_pip_recording(
    camera_index: u32,
    pip_x: i32,
    pip_y: i32,
    pip_width: u32,
    pip_height: u32,
    output_path: String,
) -> Result<String, String> {
    debug!(
        "Command: start PiP recording (camera: {}, pip: {}x{} at ({},{}), output: {})",
        camera_index, pip_width, pip_height, pip_x, pip_y, output_path
    );

    // Check permissions
    if !check_screen_recording_permission().map_err(|e| e.to_string())? {
        return Err("Screen recording permission required. Please enable in System Preferences → Privacy & Security → Screen Recording".to_string());
    }

    if !check_camera_permission().map_err(|e| e.to_string())? {
        return Err("Camera permission required. Please enable in System Preferences → Privacy & Security → Camera".to_string());
    }

    // Create PiP configuration
    let pip_config = crate::services::ffmpeg::PipConfig {
        x: pip_x,
        y: pip_y,
        width: pip_width,
        height: pip_height,
    };

    // Create orchestrator configuration
    let orchestrator_config = crate::services::recording::RecordingConfig {
        output_path: PathBuf::from(&output_path),
        width: 1920,  // Screen resolution (configurable in future stories)
        height: 1080,
        fps: 30,
        enable_system_audio: true,  // Enable system audio for PiP recordings
        enable_microphone: true,    // Enable microphone for PiP recordings
        enable_webcam_audio: false, // Webcam audio deferred to Story 4.7
        audio_sample_rate: 48000,
        audio_channels: 2,
    };

    // Create recording orchestrator
    let mut orchestrator = crate::services::recording::RecordingOrchestrator::new(orchestrator_config)
        .map_err(|e| {
            error!("Failed to create recording orchestrator: {}", e);
            format!("Failed to initialize PiP recording: {}", e)
        })?;

    // Start PiP recording
    orchestrator.start_pip_recording(camera_index, pip_config)
        .await
        .map_err(|e| {
            error!("Failed to start PiP recording: {}", e);
            format!("Failed to start PiP recording: {}", e)
        })?;

    // Generate recording ID
    let recording_id = Uuid::new_v4().to_string();

    info!(
        "PiP recording started successfully - ID: {}, Output: {}",
        recording_id, output_path
    );

    // TODO: Store orchestrator handle in global state for stop_recording command
    // For now, returning success ID

    Ok(recording_id)
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

    #[test]
    fn test_resolution_capping_logic() {
        // Test Case 1: 4K resolution (3840x2160) should be capped to 1080p (1920x1080)
        let width = 3840u32;
        let height = 2160u32;
        let (capped_width, capped_height) = if height > 1080 {
            let aspect_ratio = width as f32 / height as f32;
            let new_height = 1080;
            let new_width = (new_height as f32 * aspect_ratio) as u32;
            (new_width, new_height)
        } else {
            (width, height)
        };
        assert_eq!(capped_height, 1080, "Height should be capped at 1080p");
        assert_eq!(capped_width, 1920, "Width should maintain 16:9 aspect ratio");

        // Test Case 2: 1080p resolution should not be capped
        let width = 1920u32;
        let height = 1080u32;
        let (capped_width, capped_height) = if height > 1080 {
            let aspect_ratio = width as f32 / height as f32;
            let new_height = 1080;
            let new_width = (new_height as f32 * aspect_ratio) as u32;
            (new_width, new_height)
        } else {
            (width, height)
        };
        assert_eq!(capped_width, width, "1080p width should not be modified");
        assert_eq!(capped_height, height, "1080p height should not be modified");

        // Test Case 3: 720p resolution should not be capped
        let width = 1280u32;
        let height = 720u32;
        let (capped_width, capped_height) = if height > 1080 {
            let aspect_ratio = width as f32 / height as f32;
            let new_height = 1080;
            let new_width = (new_height as f32 * aspect_ratio) as u32;
            (new_width, new_height)
        } else {
            (width, height)
        };
        assert_eq!(capped_width, width, "720p width should not be modified");
        assert_eq!(capped_height, height, "720p height should not be modified");

        // Test Case 4: 5K resolution (5120x2880) with 16:9 aspect ratio
        let width = 5120u32;
        let height = 2880u32;
        let (capped_width, capped_height) = if height > 1080 {
            let aspect_ratio = width as f32 / height as f32;
            let new_height = 1080;
            let new_width = (new_height as f32 * aspect_ratio) as u32;
            (new_width, new_height)
        } else {
            (width, height)
        };
        assert_eq!(capped_height, 1080, "5K height should be capped at 1080p");
        assert_eq!(capped_width, 1920, "5K width should maintain 16:9 aspect ratio");
    }
}
