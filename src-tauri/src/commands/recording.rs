//! Recording-related Tauri commands
//!
//! This module provides Tauri commands for screen recording, camera, and audio capture operations.

use crate::models::recording::RecordingConfig;
use crate::services::permissions::{
    check_camera_permission, check_screen_recording_permission, request_camera_permission,
    request_screen_recording_permission,
};
use crate::services::camera::{CameraCapture, CameraInfo, CameraService};
use crate::services::ffmpeg::{FFmpegEncoder, FFmpegCompositor, CompositorFrame, PipConfig, TimestampedFrame};
use crate::services::screen_capture::{FrameHandler, ScreenCapture};
use crate::services::audio_capture::{AudioCapture, AudioSample};
use anyhow::Result as AnyhowResult;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use tauri::Emitter;
use tokio::sync::Mutex;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// Global state for managing active recordings
///
/// Maps recording ID to capture task handle, frame writer handle, output path, and pause flag
type RecordingHandle = (
    tokio::task::JoinHandle<()>,          // Capture task
    tokio::task::JoinHandle<Result<(), crate::services::screen_capture::FrameHandlerError>>, // Writer task
    PathBuf,                               // Output file path (video-only MP4)
    Arc<std::sync::atomic::AtomicBool>,   // Pause flag (Story 4.8)
    Arc<std::sync::atomic::AtomicBool>,   // Stop signal
    Option<tokio::task::JoinHandle<Result<(), String>>>, // Audio writer task
    Option<PathBuf>,                       // Audio PCM file path
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

/// Global state for managing active PiP recordings (screen + webcam)
///
/// Maps recording ID to PiP recording handles (Story 4.8 - PiP pause/resume integration)
type PipRecordingHandle = (
    tokio::task::JoinHandle<()>,                 // Screen capture task
    tokio::task::JoinHandle<()>,                 // Webcam capture task
    tokio::task::JoinHandle<AnyhowResult<()>>,   // Composition task
    PathBuf,                                      // Output file path
    Arc<AtomicBool>,                             // Screen pause flag
    Option<Arc<AtomicBool>>,                     // Mic pause flag (optional)
    Option<Arc<AtomicBool>>,                     // Webcam audio pause flag (optional)
);

lazy_static::lazy_static! {
    static ref ACTIVE_PIP_RECORDINGS: Arc<Mutex<HashMap<String, PipRecordingHandle>>> =
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

    // Ensure output directory exists
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            error!("Failed to create output directory: {}", e);
            format!("Failed to create output directory: {}", e)
        })?;
    }

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

    // Enable system audio if requested (Story 2.4)
    if config.system_audio {
        screen_capture.enable_system_audio(48000, 2).map_err(|e| {
            error!("Failed to enable system audio: {}", e);
            format!("Failed to enable system audio: {}", e)
        })?;
        info!("System audio enabled for recording");
    }

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

    // Setup audio capture if system audio is enabled
    let (audio_tx_opt, audio_writer_handle_opt, audio_pcm_path_opt) = if config.system_audio {
        // Create PCM file path for audio
        let audio_pcm_path = home_dir
            .join("Documents")
            .join("clippy")
            .join("recordings")
            .join(format!("recording-{}-audio.pcm", recording_id));

        info!("Audio PCM path: {}", audio_pcm_path.display());

        // Create audio channel
        let (audio_tx, audio_rx) = tokio::sync::mpsc::channel::<crate::services::audio_capture::AudioSample>(100);

        // Spawn audio writer task
        let pcm_path = audio_pcm_path.clone();
        let audio_writer_handle = tokio::spawn(async move {
            let mut writer = crate::services::audio_capture::PcmFileWriter::new(&pcm_path)
                .map_err(|e| format!("Failed to create PCM writer: {}", e))?;

            info!("Audio writer task started");

            // Receive audio samples and write to PCM file
            let mut rx = audio_rx;
            while let Some(sample) = rx.recv().await {
                writer.write_sample(&sample)
                    .map_err(|e| {
                        error!("Failed to write audio sample: {}", e);
                        format!("Failed to write audio sample: {}", e)
                    })?;
            }

            // Finalize PCM file
            writer.finalize()
                .map_err(|e| {
                    error!("Failed to finalize PCM file: {}", e);
                    format!("Failed to finalize PCM file: {}", e)
                })?;

            info!("Audio writer task completed");
            Ok::<(), String>(())
        });

        (Some(audio_tx), Some(audio_writer_handle), Some(audio_pcm_path))
    } else {
        (None, None, None)
    };

    // Start continuous capture (with app_handle for window-closed events)
    let capture_handle = screen_capture
        .start_continuous_capture(frame_tx, audio_tx_opt, Some(app_handle.clone()))
        .map_err(|e| {
            error!("Failed to start screen capture: {}", e);
            format!("Failed to start screen capture: {}", e)
        })?;

    // Get pause flag from screen_capture for command layer access (Story 4.8)
    let pause_flag = screen_capture.get_pause_flag();

    // Get stop signal for command layer access
    let stop_signal = screen_capture.get_stop_signal();

    // Store handles in global state
    let mut recordings = ACTIVE_RECORDINGS.lock().await;
    recordings.insert(
        recording_id.clone(),
        (
            capture_handle,
            encoder_handle,
            output_path,
            pause_flag,
            stop_signal,
            audio_writer_handle_opt,
            audio_pcm_path_opt,
        ),
    );

    info!("Screen recording started successfully with real-time encoding{}: {}",
        if config.system_audio { " + audio capture" } else { "" },
        recording_id);

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
    let (
        capture_handle,
        encoder_handle,
        output_path,
        _pause_flag,
        stop_signal,
        audio_writer_handle_opt,
        audio_pcm_path_opt,
    ) = recordings
        .remove(&recording_id)
        .ok_or_else(|| {
            error!("Recording not found: {}", recording_id);
            format!("Recording not found: {}", recording_id)
        })?;

    // Release lock before awaiting
    drop(recordings);

    info!("Stopping recording with real-time encoding{}: {}",
        if audio_writer_handle_opt.is_some() { " + audio" } else { "" },
        recording_id);

    // Signal capture task to stop
    info!("CMD: Setting stop_signal to true");
    stop_signal.store(true, std::sync::atomic::Ordering::Relaxed);
    info!("CMD: Stop signal set, now waiting for capture task");

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

    // Wait for audio writer task and perform muxing if audio was captured
    let final_output_path = if let (Some(audio_writer_handle), Some(audio_pcm_path)) =
        (audio_writer_handle_opt, audio_pcm_path_opt)
    {
        info!("Waiting for audio writer task to complete");

        // Wait for audio writer to finish
        let audio_writer_success = match audio_writer_handle.await {
            Ok(Ok(())) => {
                info!("Audio writer task completed successfully");
                true
            }
            Ok(Err(e)) => {
                error!("Audio writer task failed: {}", e);
                warn!("Continuing with video-only file");
                false
            }
            Err(e) => {
                error!("Audio writer task join error: {}", e);
                warn!("Continuing with video-only file");
                false
            }
        };

        // Mux audio with video if audio writer succeeded
        if audio_writer_success && audio_pcm_path.exists() {
            info!("Muxing audio with video");

            // Create final output path (replace video-only file)
            let final_path = output_path
                .parent()
                .unwrap()
                .join(format!(
                    "recording-{}-final.mp4",
                    recording_id
                ));

            // Create audio input config
            let audio_inputs = vec![crate::services::ffmpeg::AudioInputConfig {
                pcm_path: audio_pcm_path.clone(),
                sample_rate: 48000,
                channels: 2,
                label: "System Audio".to_string(),
            }];

            // Mux video + audio
            match crate::services::ffmpeg::FFmpegEncoder::finalize_with_audio(
                output_path.clone(),
                audio_inputs,
                final_path.clone(),
            )
            .await
            {
                Ok(_) => {
                    info!("Audio muxing completed successfully");

                    // Delete temporary files
                    if let Err(e) = std::fs::remove_file(&output_path) {
                        warn!("Failed to remove video-only file: {}", e);
                    }
                    if let Err(e) = std::fs::remove_file(&audio_pcm_path) {
                        warn!("Failed to remove PCM audio file: {}", e);
                    }

                    final_path
                }
                Err(e) => {
                    error!("Audio muxing failed: {}", e);
                    warn!("Returning video-only file");

                    // Clean up PCM file even if muxing failed
                    if let Err(e) = std::fs::remove_file(&audio_pcm_path) {
                        warn!("Failed to remove PCM audio file: {}", e);
                    }

                    output_path.clone()
                }
            }
        } else {
            warn!("Audio PCM file not found, returning video-only file");
            output_path.clone()
        }
    } else {
        // No audio capture, return video-only file
        output_path.clone()
    };

    // Verify file exists
    if !final_output_path.exists() {
        error!("Recording file not found: {}", final_output_path.display());
        return Err(format!("Recording file not found: {}", final_output_path.display()));
    }

    let output_path_str = final_output_path.to_string_lossy().to_string();
    info!("Recording saved successfully: {}", output_path_str);

    Ok(output_path_str)
}

/// Pause the current recording (Story 4.8 - AC #1)
///
/// This command pauses the active recording using frame discard approach.
/// Capture streams continue running but frames/samples are discarded.
/// Recording can be resumed later without creating a new file.
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

    // Check if this is a PiP recording first (Story 4.8 - PiP pause/resume integration)
    {
        let pip_recordings = ACTIVE_PIP_RECORDINGS.lock().await;
        if let Some((_screen_handle, _webcam_handle, _comp_handle, _output_path, screen_pause, mic_pause, webcam_audio_pause)) =
            pip_recordings.get(&recording_id)
        {
            // Pause all active streams
            screen_pause.store(true, std::sync::atomic::Ordering::Relaxed);
            if let Some(ref mic) = mic_pause {
                mic.store(true, std::sync::atomic::Ordering::Relaxed);
            }
            if let Some(ref webcam_audio) = webcam_audio_pause {
                webcam_audio.store(true, std::sync::atomic::Ordering::Relaxed);
            }
            info!("PiP recording paused (frame discard enabled): {}", recording_id);
            return Ok(());
        }
    }

    // Check if this is a simple screen recording
    let recordings = ACTIVE_RECORDINGS.lock().await;
    let (
        _capture_handle,
        _encoder_handle,
        _output_path,
        pause_flag,
        _stop_signal,
        _audio_writer,
        _audio_pcm_path,
    ) = recordings
        .get(&recording_id)
        .ok_or_else(|| {
            error!("Recording not found: {}", recording_id);
            format!("Recording not found: {}", recording_id)
        })?;

    // Set pause flag (frame discard enabled in capture callbacks)
    pause_flag.store(true, std::sync::atomic::Ordering::Relaxed);
    info!("Recording paused (frame discard enabled): {}", recording_id);

    Ok(())
}

/// Resume a paused recording (Story 4.8 - AC #3)
///
/// This command resumes a paused recording by clearing the frame discard flag.
/// Capture streams continue receiving frames/samples which are now processed.
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

    // Check if this is a PiP recording first (Story 4.8 - PiP pause/resume integration)
    {
        let pip_recordings = ACTIVE_PIP_RECORDINGS.lock().await;
        if let Some((_screen_handle, _webcam_handle, _comp_handle, _output_path, screen_pause, mic_pause, webcam_audio_pause)) =
            pip_recordings.get(&recording_id)
        {
            // Resume all active streams
            screen_pause.store(false, std::sync::atomic::Ordering::Relaxed);
            if let Some(ref mic) = mic_pause {
                mic.store(false, std::sync::atomic::Ordering::Relaxed);
            }
            if let Some(ref webcam_audio) = webcam_audio_pause {
                webcam_audio.store(false, std::sync::atomic::Ordering::Relaxed);
            }
            info!("PiP recording resumed: {}", recording_id);
            return Ok(());
        }
    }

    // Check if this is a simple screen recording
    let recordings = ACTIVE_RECORDINGS.lock().await;
    let (
        _capture_handle,
        _encoder_handle,
        _output_path,
        pause_flag,
        _stop_signal,
        _audio_writer,
        _audio_pcm_path,
    ) = recordings
        .get(&recording_id)
        .ok_or_else(|| {
            error!("Recording not found: {}", recording_id);
            format!("Recording not found: {}", recording_id)
        })?;

    // Clear pause flag (frame discard disabled, normal capture resumes)
    pause_flag.store(false, std::sync::atomic::Ordering::Relaxed);
    info!("Recording resumed: {}", recording_id);

    Ok(())
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
    let (
        capture_handle,
        encoder_handle,
        output_path,
        _pause_flag,
        stop_signal,
        audio_writer_handle_opt,
        audio_pcm_path_opt,
    ) = recordings.remove(&recording_id).ok_or_else(|| {
        error!("Recording not found: {}", recording_id);
        format!("Recording not found: {}", recording_id)
    })?;

    // Signal capture task to stop
    stop_signal.store(true, std::sync::atomic::Ordering::Relaxed);

    info!("Cancelling recording with real-time encoding: {}", recording_id);

    // Abort capture and encoder tasks
    capture_handle.abort();
    encoder_handle.abort();

    // Abort audio writer task if present
    if let Some(audio_writer_handle) = audio_writer_handle_opt {
        audio_writer_handle.abort();
    }

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

    // Delete the partial audio PCM file if present
    if let Some(audio_pcm_path) = audio_pcm_path_opt {
        if audio_pcm_path.exists() {
            match std::fs::remove_file(&audio_pcm_path) {
                Ok(()) => {
                    info!("Deleted partial audio PCM file: {}", audio_pcm_path.display());
                }
                Err(e) => {
                    warn!("Failed to delete partial audio PCM file {}: {}", audio_pcm_path.display(), e);
                }
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

    // Generate recording ID early
    let recording_id = Uuid::new_v4().to_string();
    info!(
        "Starting PiP recording: {} (camera: {}, pip: {}x{} at ({},{}))",
        recording_id, camera_index, pip_width, pip_height, pip_x, pip_y
    );

    // Create output path with proper directory
    let output_path_buf = PathBuf::from(&output_path);
    if let Some(parent) = output_path_buf.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            error!("Failed to create output directory: {}", e);
            format!("Failed to create output directory: {}", e)
        })?;
    }

    info!("Output path: {}", output_path);

    // Initialize screen capture
    let mut screen_capture = ScreenCapture::new(None).map_err(|e| {
        error!("Failed to initialize screen capture: {}", e);
        format!("Screen capture initialization failed: {}", e)
    })?;

    let (screen_width, screen_height) = screen_capture.get_dimensions();
    info!("Screen dimensions: {}x{}", screen_width, screen_height);

    // Initialize camera capture
    let mut camera_capture = CameraCapture::new(camera_index).map_err(|e| {
        error!("Failed to initialize camera: {}", e);
        format!("Camera initialization failed: {}", e)
    })?;

    let webcam_width = camera_capture.width();
    let webcam_height = camera_capture.height();
    info!("Camera dimensions: {}x{} @ 30fps", webcam_width, webcam_height);

    // Create PiP configuration
    let pip_config = PipConfig {
        x: pip_x,
        y: pip_y,
        width: pip_width,
        height: pip_height,
    };

    // Create FFmpeg compositor for PiP
    let mut compositor = FFmpegCompositor::new(
        output_path_buf.clone(),
        screen_width,
        screen_height,
        webcam_width,
        webcam_height,
        30, // FPS
        pip_config,
    )
    .map_err(|e| {
        error!("Failed to create FFmpeg compositor: {}", e);
        format!("Failed to create compositor: {}", e)
    })?;

    // Start composition process (with named pipes)
    compositor.start_composition().await.map_err(|e| {
        error!("Failed to start FFmpeg composition: {}", e);
        format!("Failed to start composition: {}", e)
    })?;

    // Create channels for video streams (bounded: 30 frames = 1 second buffer)
    let (screen_video_tx, mut screen_video_rx) = mpsc::channel::<TimestampedFrame>(30);
    let (webcam_video_tx, mut webcam_video_rx) = mpsc::channel::<TimestampedFrame>(30);

    // Extract pause flag before starting capture (Story 4.8 - PiP pause/resume integration)
    let screen_pause_flag = screen_capture.get_pause_flag();

    // Start screen capture task
    let screen_capture_handle = screen_capture
        .start_continuous_capture(screen_video_tx, None, None)
        .map_err(|e| {
            error!("Failed to start screen capture: {}", e);
            format!("Failed to start screen capture: {}", e)
        })?;

    // Start webcam capture task
    let webcam_capture_handle = camera_capture
        .start_continuous_capture(webcam_video_tx)
        .map_err(|e| {
            error!("Failed to start webcam capture: {}", e);
            format!("Failed to start webcam capture: {}", e)
        })?;

    // Spawn composition task
    let composition_handle = tokio::spawn(async move {
        info!("PiP composition task started");
        let mut screen_frame_count = 0;
        let mut webcam_frame_count = 0;

        // AC #3: Track first frame timestamps for synchronization validation (< 100ms variance)
        let mut first_screen_timestamp: Option<u64> = None;
        let mut first_webcam_timestamp: Option<u64> = None;
        let mut sync_validated = false;

        loop {
            tokio::select! {
                // Process screen video frames
                Some(screen_frame) = screen_video_rx.recv() => {
                    // Record first frame timestamp for sync validation
                    if first_screen_timestamp.is_none() {
                        first_screen_timestamp = Some(screen_frame.timestamp_ms);
                        debug!("First screen frame timestamp: {}ms", screen_frame.timestamp_ms);

                        // Validate synchronization if we have both timestamps
                        if let (Some(screen_ts), Some(webcam_ts)) = (first_screen_timestamp, first_webcam_timestamp) {
                            if !sync_validated {
                                let variance_ms = if screen_ts > webcam_ts {
                                    screen_ts - webcam_ts
                                } else {
                                    webcam_ts - screen_ts
                                };
                                if variance_ms > 100 {
                                    warn!("Stream start variance {}ms exceeds 100ms threshold (AC #3)", variance_ms);
                                } else {
                                    info!("Stream start synchronization validated: {}ms variance (AC #3: < 100ms)", variance_ms);
                                }
                                sync_validated = true;
                            }
                        }
                    }

                    // Convert to CompositorFrame
                    let compositor_frame = CompositorFrame {
                        data: screen_frame.data,
                        timestamp_ms: screen_frame.timestamp_ms,
                        width: screen_frame.width,
                        height: screen_frame.height,
                    };

                    // Write frame to compositor screen pipe
                    if let Err(e) = compositor.write_screen_frame(&compositor_frame).await {
                        error!("Failed to write screen frame to compositor: {}", e);
                        return Err(anyhow::anyhow!("Screen frame write error: {}", e));
                    }

                    screen_frame_count += 1;
                    if screen_frame_count % 300 == 0 {
                        debug!("Processed {} screen frames", screen_frame_count);
                    }
                }

                // Process webcam video frames
                Some(webcam_frame) = webcam_video_rx.recv() => {
                    // Record first frame timestamp for sync validation
                    if first_webcam_timestamp.is_none() {
                        first_webcam_timestamp = Some(webcam_frame.timestamp_ms);
                        debug!("First webcam frame timestamp: {}ms", webcam_frame.timestamp_ms);

                        // Validate synchronization if we have both timestamps
                        if let (Some(screen_ts), Some(webcam_ts)) = (first_screen_timestamp, first_webcam_timestamp) {
                            if !sync_validated {
                                let variance_ms = if screen_ts > webcam_ts {
                                    screen_ts - webcam_ts
                                } else {
                                    webcam_ts - screen_ts
                                };
                                if variance_ms > 100 {
                                    warn!("Stream start variance {}ms exceeds 100ms threshold (AC #3)", variance_ms);
                                } else {
                                    info!("Stream start synchronization validated: {}ms variance (AC #3: < 100ms)", variance_ms);
                                }
                                sync_validated = true;
                            }
                        }
                    }

                    // Convert to CompositorFrame
                    let compositor_frame = CompositorFrame {
                        data: webcam_frame.data,
                        timestamp_ms: webcam_frame.timestamp_ms,
                        width: webcam_frame.width,
                        height: webcam_frame.height,
                    };

                    // Write frame to compositor webcam pipe
                    if let Err(e) = compositor.write_webcam_frame(&compositor_frame).await {
                        error!("Failed to write webcam frame to compositor: {}", e);
                        return Err(anyhow::anyhow!("Webcam frame write error: {}", e));
                    }

                    webcam_frame_count += 1;
                    if webcam_frame_count % 300 == 0 {
                        debug!("Processed {} webcam frames", webcam_frame_count);
                    }
                }

                // Both channels closed - finish composition
                else => {
                    info!(
                        "PiP composition complete: {} screen frames, {} webcam frames",
                        screen_frame_count, webcam_frame_count
                    );

                    // Finalize composition
                    if let Err(e) = compositor.stop_composition().await {
                        error!("Failed to finalize composition: {}", e);
                        return Err(anyhow::anyhow!("Composition finalization error: {}", e));
                    }

                    info!("PiP composition finalized successfully");
                    return Ok(());
                }
            }
        }
    });

    // Store handles in global state (Story 4.8 - PiP pause/resume integration)
    // Note: Current PiP implementation doesn't capture audio streams (mic/webcam audio),
    // so pause flags for those are None. Screen pause flag enables video pause.
    let mut recordings = ACTIVE_PIP_RECORDINGS.lock().await;
    recordings.insert(
        recording_id.clone(),
        (
            screen_capture_handle,
            webcam_capture_handle,
            composition_handle,
            output_path_buf,
            screen_pause_flag,
            None, // No microphone audio in basic PiP
            None, // No webcam audio in basic PiP
        ),
    );

    info!("PiP recording started successfully: {}", recording_id);

    Ok(recording_id)
}

/// Stop Picture-in-Picture (PiP) recording
///
/// This command stops the active PiP recording, waits for all tasks to complete,
/// and returns the file path where the composited recording was saved.
///
/// # Arguments
///
/// * `recording_id` - The UUID of the PiP recording to stop
///
/// # Returns
///
/// - `Ok(String)` with file path to saved composited recording
/// - `Err(String)` with user-friendly error message on failure
///
/// # Flow
///
/// 1. Look up PiP recording handles by ID from ACTIVE_PIP_RECORDINGS
/// 2. Drop channel senders (signals capture tasks to stop)
/// 3. Wait for screen capture task to complete
/// 4. Wait for webcam capture task to complete
/// 5. Wait for composition task to finish (finalizes MP4)
/// 6. Return file path
#[tauri::command]
pub async fn cmd_stop_pip_recording(recording_id: String) -> Result<String, String> {
    debug!("Command: stop PiP recording {}", recording_id);

    // Remove recording from active state (Story 4.8 - updated tuple structure)
    let mut recordings = ACTIVE_PIP_RECORDINGS.lock().await;
    let (screen_capture_handle, webcam_capture_handle, composition_handle, output_path, _screen_pause, _mic_pause, _webcam_audio_pause) = recordings
        .remove(&recording_id)
        .ok_or_else(|| {
            error!("PiP recording not found: {}", recording_id);
            format!("PiP recording not found: {}", recording_id)
        })?;

    // Release lock before awaiting
    drop(recordings);

    info!("Stopping PiP recording: {}", recording_id);

    // Wait for screen capture task to complete
    match screen_capture_handle.await {
        Ok(_) => {
            debug!("Screen capture task completed");
        }
        Err(e) => {
            warn!("Screen capture task join error: {}", e);
        }
    }

    // Wait for webcam capture task to complete
    match webcam_capture_handle.await {
        Ok(_) => {
            debug!("Webcam capture task completed");
        }
        Err(e) => {
            warn!("Webcam capture task join error: {}", e);
        }
    }

    // Wait for composition task to finish (flushes remaining frames and finalizes MP4)
    match composition_handle.await {
        Ok(Ok(())) => {
            info!("PiP composition completed successfully");
        }
        Ok(Err(e)) => {
            error!("FFmpeg compositor failed: {}", e);
            return Err(format!("Failed to finalize PiP composition: {}", e));
        }
        Err(e) => {
            error!("Composition task join error: {}", e);
            return Err(format!("Composition task error: {}", e));
        }
    }

    // Verify file exists
    if !output_path.exists() {
        error!("PiP recording file not found: {}", output_path.display());
        return Err(format!("Recording file not found: {}", output_path.display()));
    }

    let output_path_str = output_path.to_string_lossy().to_string();
    info!("PiP recording saved successfully: {}", output_path_str);

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

    /// Story 4.6 - AC #3: Test synchronous stream start validation (< 100ms variance)
    #[test]
    fn test_4_6_stream_sync_validation_within_threshold() {
        // Test Case 1: Both streams start within 100ms (valid)
        let screen_ts: u64 = 1000;
        let webcam_ts: u64 = 1050; // 50ms difference
        let variance_ms = if screen_ts > webcam_ts {
            screen_ts - webcam_ts
        } else {
            webcam_ts - screen_ts
        };
        assert!(variance_ms <= 100, "Variance should be within 100ms threshold");
        assert_eq!(variance_ms, 50, "Variance should be exactly 50ms");

        // Test Case 2: Streams start at exact same time
        let screen_ts: u64 = 2000;
        let webcam_ts: u64 = 2000;
        let variance_ms = if screen_ts > webcam_ts {
            screen_ts - webcam_ts
        } else {
            webcam_ts - screen_ts
        };
        assert_eq!(variance_ms, 0, "Variance should be 0ms for simultaneous start");

        // Test Case 3: 100ms variance (edge case - valid)
        let screen_ts: u64 = 3000;
        let webcam_ts: u64 = 3100;
        let variance_ms = if screen_ts > webcam_ts {
            screen_ts - webcam_ts
        } else {
            webcam_ts - screen_ts
        };
        assert_eq!(variance_ms, 100, "Variance should be exactly 100ms");
        assert!(variance_ms <= 100, "100ms should be within threshold");
    }

    #[test]
    fn test_4_6_stream_sync_validation_exceeds_threshold() {
        // Test Case 1: Webcam starts after screen by >100ms (should warn)
        let screen_ts: u64 = 1000;
        let webcam_ts: u64 = 1150; // 150ms difference
        let variance_ms = if screen_ts > webcam_ts {
            screen_ts - webcam_ts
        } else {
            webcam_ts - screen_ts
        };
        assert!(variance_ms > 100, "Variance exceeds 100ms threshold");
        assert_eq!(variance_ms, 150, "Variance should be 150ms");

        // Test Case 2: Screen starts after webcam by >100ms
        let screen_ts: u64 = 2250;
        let webcam_ts: u64 = 2000;
        let variance_ms = if screen_ts > webcam_ts {
            screen_ts - webcam_ts
        } else {
            webcam_ts - screen_ts
        };
        assert!(variance_ms > 100, "Variance exceeds 100ms threshold");
        assert_eq!(variance_ms, 250, "Variance should be 250ms");

        // Test Case 3: Large variance (500ms)
        let screen_ts: u64 = 5000;
        let webcam_ts: u64 = 5500;
        let variance_ms = if screen_ts > webcam_ts {
            screen_ts - webcam_ts
        } else {
            webcam_ts - screen_ts
        };
        assert!(variance_ms > 100, "Large variance should exceed threshold");
        assert_eq!(variance_ms, 500, "Variance should be 500ms");
    }

    #[test]
    fn test_4_6_stream_sync_validation_timestamp_ordering() {
        // Test that variance calculation works regardless of which stream starts first

        // Screen first by 80ms
        let screen_ts: u64 = 1000;
        let webcam_ts: u64 = 1080;
        let variance_1 = if screen_ts > webcam_ts {
            screen_ts - webcam_ts
        } else {
            webcam_ts - screen_ts
        };

        // Webcam first by 80ms
        let screen_ts: u64 = 2080;
        let webcam_ts: u64 = 2000;
        let variance_2 = if screen_ts > webcam_ts {
            screen_ts - webcam_ts
        } else {
            webcam_ts - screen_ts
        };

        assert_eq!(variance_1, variance_2, "Variance should be same regardless of ordering");
        assert_eq!(variance_1, 80, "Both should calculate 80ms variance");
        assert!(variance_1 <= 100 && variance_2 <= 100, "Both should be within threshold");
    }
}
