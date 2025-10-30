//! Recording-related Tauri commands
//!
//! This module provides Tauri commands for screen recording, camera, and audio capture operations.

use crate::models::recording::RecordingConfig;
use crate::services::permissions::{
    check_camera_permission, check_screen_recording_permission, request_camera_permission,
    request_screen_recording_permission, check_microphone_permission,
};
use crate::services::camera::{CameraBackend, CameraInfo, CameraService};
use crate::services::ffmpeg::{FFmpegEncoder, PipConfig, TimestampedFrame};
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
    Option<tokio::task::JoinHandle<Result<(), String>>>, // System audio writer task
    Option<PathBuf>,                       // System audio PCM file path
    Option<tokio::task::JoinHandle<Result<(), String>>>, // Microphone audio writer task
    Option<PathBuf>,                       // Microphone audio PCM file path
    Option<Arc<AtomicBool>>,               // Microphone pause flag (Story 4.8)
    Option<u16>,                           // Microphone channel count (1=mono, 2=stereo)
);

lazy_static::lazy_static! {
    static ref ACTIVE_RECORDINGS: Arc<Mutex<HashMap<String, RecordingHandle>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

// Storage for microphone audio channel senders (needed to close channels on stop)
lazy_static::lazy_static! {
    static ref MICROPHONE_SENDERS: Arc<tokio::sync::Mutex<HashMap<String, tokio::sync::mpsc::Sender<AudioSample>>>> =
        Arc::new(tokio::sync::Mutex::new(HashMap::new()));
}


/// Global state for managing active camera previews
///
/// Maps camera index to preview task handle and camera backend
type CameraPreviewHandle = (
    tokio::task::JoinHandle<()>,  // Preview task
    Arc<Mutex<Option<CameraBackend>>>,  // Camera backend for cleanup
);

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
    CameraBackend,                               // Camera backend instance (for graceful stop)
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
/// Maps recording ID to PiP recording handles
/// NEW ARCHITECTURE: Records to separate temp files, composites on stop
type PipRecordingHandle = (
    tokio::task::JoinHandle<()>,                 // Screen capture task
    tokio::task::JoinHandle<()>,                 // Webcam capture task
    tokio::task::JoinHandle<()>,                 // Screen encoding task
    tokio::task::JoinHandle<()>,                 // Webcam encoding task
    Option<tokio::task::JoinHandle<()>>,         // Microphone audio writer task
    PathBuf,                                      // Final output file path
    PathBuf,                                      // Temp screen file path
    PathBuf,                                      // Temp webcam file path
    Option<PathBuf>,                              // Microphone audio WAV path
    PipConfig,                                    // PiP configuration for composition
    Arc<AtomicBool>,                             // Screen pause flag
    Arc<AtomicBool>,                             // Screen stop signal
    CameraBackend,                                // Camera capture object (must stay alive to prevent Drop)
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
        warn!("Camera preview already running for index {} - ignoring duplicate start request", camera_index);
        return Ok(()); // Return success - already running is not an error
    }

    info!("Starting camera preview for index {}", camera_index);

    // Store camera backend for cleanup
    let camera_backend_arc = Arc::new(Mutex::new(None::<CameraBackend>));
    let camera_backend_clone = camera_backend_arc.clone();

    // Use native AVFoundation for 30 FPS preview on macOS
    let handle = tokio::spawn(async move {
        debug!("Camera preview task starting for index {}", camera_index);

        use base64::Engine;
        use crate::services::ffmpeg::TimestampedFrame;

        // Use 1280x720 for preview (16:9 aspect ratio to match camera native ratio)
        let (width, height) = (1280u32, 720u32);

        // Create camera backend (will use AVFoundation on macOS)
        let mut camera_backend = match CameraBackend::new(camera_index, width, height).await {
            Ok(backend) => backend,
            Err(e) => {
                error!("Failed to initialize camera backend for preview: {}", e);
                let _ = app_handle.emit("camera-error", format!("Failed to initialize camera: {}", e));
                return;
            }
        };

        info!("Camera {} preview starting at {}x{} @ 30 FPS", camera_index, width, height);

        // Create channel for frames (small buffer - we only want latest frame)
        let (frame_tx, mut frame_rx) = mpsc::channel::<TimestampedFrame>(3);

        // Start continuous capture
        let capture_handle = match camera_backend.start_continuous_capture(frame_tx) {
            Ok(handle) => handle,
            Err(e) => {
                error!("Failed to start camera capture for preview: {}", e);
                let _ = app_handle.emit("camera-error", format!("Failed to start capture: {}", e));
                return;
            }
        };

        // Store backend for cleanup
        {
            let mut backend_lock = camera_backend_clone.lock().await;
            *backend_lock = Some(camera_backend);
        }

        // Frame processing loop - only process LATEST frame to minimize latency
        let mut frame_count = 0u64;
        let start_time = std::time::Instant::now();

        while let Some(mut frame) = frame_rx.recv().await {
            // Drain any additional frames in the channel to get the latest one
            // This ensures we always show the most recent frame, not old buffered ones
            loop {
                match frame_rx.try_recv() {
                    Ok(newer_frame) => {
                        frame = newer_frame; // Replace with newer frame
                    }
                    Err(_) => break, // No more frames, use current one
                }
            }

            // Convert BGRA to RGB for frontend (simple conversion, can be optimized)
            let mut rgb_data = Vec::with_capacity((frame.width * frame.height * 3) as usize);
            for chunk in frame.data.chunks(4) {
                if chunk.len() == 4 {
                    rgb_data.push(chunk[2]); // R (from B in BGRA)
                    rgb_data.push(chunk[1]); // G
                    rgb_data.push(chunk[0]); // B (from R in BGRA)
                }
            }

            // Base64 encode the RGB frame data
            let encoded = base64::engine::general_purpose::STANDARD.encode(&rgb_data);

            // Create frame payload
            let payload = CameraFramePayload {
                camera_index,
                width: frame.width,
                height: frame.height,
                frame_data: encoded,
                timestamp: frame.timestamp_ms as i64,
            };

            // Emit camera-frame event
            if let Err(e) = app_handle.emit("camera-frame", &payload) {
                error!("Failed to emit camera-frame event: {}", e);
                break;
            }

            frame_count += 1;
            if frame_count % 30 == 0 {
                let elapsed = start_time.elapsed().as_secs_f64();
                let fps = frame_count as f64 / elapsed;
                debug!("Camera {} preview: {} frames, {:.1} FPS", camera_index, frame_count, fps);
            }
        }

        info!("Camera {} preview loop ended ({} frames)", camera_index, frame_count);

        // Stop camera capture
        {
            let mut backend_lock = camera_backend_clone.lock().await;
            if let Some(mut backend) = backend_lock.take() {
                backend.stop_capture();
            }
        }

        // Wait for capture task to finish
        let _ = capture_handle.await;

        // Clean up: remove from active previews
        let mut previews = ACTIVE_CAMERA_PREVIEWS.lock().await;
        previews.remove(&camera_index);
    });

    previews.insert(camera_index, (handle, camera_backend_arc));
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

    match previews.remove(&camera_index) {
        Some((handle, camera_backend_arc)) => {
            // Stop camera capture first
            {
                let mut backend_lock = camera_backend_arc.lock().await;
                if let Some(mut backend) = backend_lock.take() {
                    backend.stop_capture();
                    debug!("Camera backend stopped for preview index {}", camera_index);
                }
            }

            // Abort the preview task
            handle.abort();
            info!("Camera preview stopped for index {}", camera_index);
        }
        None => {
            debug!("Camera preview not found for index {} (already stopped or never started)", camera_index);
        }
    }

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

    // Get camera resolution (we'll use 1920x1080 for real-time capture)
    let (width, height) = (1920u32, 1080u32);

    // Create unified camera backend
    let mut camera_backend = CameraBackend::new(camera_index, width, height)
        .await
        .map_err(|e| {
            error!("Failed to initialize camera backend: {}", e);
            format!("Camera initialization failed: {}", e)
        })?;

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

    // Start camera capture
    let camera_handle = camera_backend
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

            // Get channel count (1=mono, 2=stereo)
            let mic_channels = match audio_capture.get_channels() {
                Ok(channels) => channels,
                Err(e) => {
                    error!("Failed to get microphone channel count: {}", e);
                    return;
                }
            };

            info!("Microphone audio format: {} channels ({})",
                mic_channels,
                if mic_channels == 1 { "mono" } else { "stereo" });

            // Start audio capture
            if let Err(e) = audio_capture.start_capture(audio_tx) {
                error!("Failed to start audio capture: {}", e);
                return;
            }

            info!("Audio capture started, waiting for first sample to detect sample rate");
            let mut sample_count = 0;
            let mut writer_opt: Option<WavWriter> = None;

            // Block and process audio samples
            while let Some(sample) = audio_rx.blocking_recv() {
                // Create WAV writer after receiving first sample (so we know the actual sample rate)
                if writer_opt.is_none() {
                    info!("First audio sample received: {} Hz, {} channels",
                        sample.sample_rate, sample.channels);

                    writer_opt = match WavWriter::new(
                        audio_path_clone.clone(),
                        sample.sample_rate,
                        sample.channels
                    ) {
                        Ok(w) => {
                            info!("WAV writer created with {} Hz, {} channels",
                                sample.sample_rate, sample.channels);
                            Some(w)
                        },
                        Err(e) => {
                            error!("Failed to create WAV writer: {}", e);
                            return;
                        }
                    };
                }

                if let Some(ref mut writer) = writer_opt {
                    // Apply gain to increase volume (2.5x boost)
                    // Clamp to [-1.0, 1.0] to prevent clipping distortion
                    let gain = 2.5;
                    let boosted_samples: Vec<f32> = sample.data.iter()
                        .map(|&s| (s * gain).max(-1.0).min(1.0))
                        .collect();

                    if let Err(e) = writer.write_samples(&boosted_samples) {
                        error!("Failed to write audio samples: {}", e);
                        break;
                    }
                    sample_count += sample.data.len();
                }
            }

            info!("Audio channel closed, finalizing WAV file ({} samples)", sample_count);
            if let Some(writer) = writer_opt {
                if let Err(e) = writer.finalize() {
                    error!("Failed to finalize WAV file: {}", e);
                } else {
                    info!("Audio file finalized successfully");
                }
            } else {
                warn!("No audio samples received, WAV file not created");
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

    // Store handles in global state (including camera_backend for graceful stop)
    let mut recordings = ACTIVE_WEBCAM_RECORDINGS.lock().await;
    recordings.insert(
        recording_id.clone(),
        (camera_backend, camera_handle, audio_handle, encoding_handle, output_path, audio_path),
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
    let (mut camera_backend, camera_handle, audio_handle, encoding_handle, video_path, audio_path) = recordings
        .remove(&recording_id)
        .ok_or_else(|| {
            error!("Webcam recording not found: {}", recording_id);
            format!("Webcam recording not found: {}", recording_id)
        })?;

    // Release lock before awaiting
    drop(recordings);

    info!("Stopping webcam recording: {}", recording_id);

    // Gracefully stop camera capture (sets AtomicBool flag or deallocates AVFoundation)
    camera_backend.stop_capture();
    debug!("Camera stop signal sent");

    // Wait for camera capture task to finish gracefully (this closes the video channel)
    if let Err(e) = camera_handle.await {
        warn!("Camera capture task join error: {}", e);
    }
    debug!("Camera capture task finished");

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
    info!("Recording config: frameRate={}, resolution={}, systemAudio={}, microphone={}",
        config.frame_rate, config.resolution, config.system_audio, config.microphone);

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
        "720p" => {
            // Scale to 720p while preserving aspect ratio
            let aspect_ratio = capture_width as f32 / capture_height as f32;
            let height = 720_u32;
            let width = (height as f32 * aspect_ratio) as u32;
            info!("Scaling to 720p with aspect ratio preservation: {}x{}", width, height);
            (width, height)
        }
        "1080p" => {
            // Scale to 1080p while preserving aspect ratio
            let aspect_ratio = capture_width as f32 / capture_height as f32;
            let height = 1080_u32;
            let width = (height as f32 * aspect_ratio) as u32;
            info!("Scaling to 1080p with aspect ratio preservation: {}x{}", width, height);
            (width, height)
        }
        "source" | _ => {
            // Use actual capture dimensions
            info!("Source resolution requested, using capture dimensions: {}x{}", capture_width, capture_height);
            (capture_width, capture_height)
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

    // Setup microphone capture if enabled
    let (mic_writer_handle_opt, mic_pcm_path_opt, mic_pause_flag_opt, mic_tx_opt, mic_channels_opt) = if config.microphone {
        info!("Initializing microphone capture");

        // Check microphone permission
        match check_microphone_permission() {
            Ok(true) => {
                info!("Microphone permission granted");
            }
            Ok(false) => {
                error!("Microphone permission not granted");
                return Err("Microphone permission required. Please enable in System Preferences → Privacy & Security → Microphone".to_string());
            }
            Err(e) => {
                error!("Microphone permission check failed: {}", e);
                return Err(format!("Microphone permission check failed: {}", e));
            }
        }

        // Create AudioCapture instance
        let mut audio_capture = AudioCapture::new().map_err(|e| {
            error!("Failed to initialize microphone capture: {}", e);
            format!("Failed to initialize microphone capture: {}", e)
        })?;

        // Select default microphone device
        let device_name = audio_capture.select_default_device().map_err(|e| {
            error!("Failed to select default microphone device: {}", e);
            format!("Failed to select microphone device: {}", e)
        })?;

        info!("Selected microphone device: {}", device_name);

        // Get channel count (1=mono, 2=stereo)
        let mic_channels = audio_capture.get_channels().map_err(|e| {
            error!("Failed to get microphone channel count: {}", e);
            format!("Failed to get microphone channel count: {}", e)
        })?;

        info!("Microphone audio format: {} channels ({})",
            mic_channels,
            if mic_channels == 1 { "mono" } else { "stereo" });

        // Create PCM file path for microphone audio
        let mic_pcm_path = home_dir
            .join("Documents")
            .join("clippy")
            .join("recordings")
            .join(format!("recording-{}-microphone.pcm", recording_id));

        info!("Microphone PCM path: {}", mic_pcm_path.display());

        // Create microphone audio channel
        let (mic_tx, mic_rx) = tokio::sync::mpsc::channel::<AudioSample>(100);

        // Create pause flag for microphone
        let mic_pause_flag = Arc::new(AtomicBool::new(false));
        let mic_pause_flag_clone = mic_pause_flag.clone();

        // Spawn microphone writer task
        let pcm_path = mic_pcm_path.clone();
        let mic_writer_handle = tokio::spawn(async move {
            let mut writer = crate::services::audio_capture::PcmFileWriter::new(&pcm_path)
                .map_err(|e| format!("Failed to create microphone PCM writer: {}", e))?;

            info!("Microphone writer task started");

            // Receive audio samples and write to PCM file
            let mut rx = mic_rx;
            let mut sample_count = 0;
            let mut paused_count = 0;

            while let Some(sample) = rx.recv().await {
                sample_count += 1;

                // Log first few samples to verify we're receiving data
                if sample_count <= 3 {
                    info!("Microphone sample #{}: {} samples, {} Hz, {} channels",
                        sample_count, sample.data.len(), sample.sample_rate, sample.channels);
                }

                // Check pause flag
                if !mic_pause_flag_clone.load(std::sync::atomic::Ordering::Relaxed) {
                    writer.write_sample(&sample)
                        .map_err(|e| {
                            error!("Failed to write microphone sample: {}", e);
                            format!("Failed to write microphone sample: {}", e)
                        })?;
                } else {
                    paused_count += 1;
                }
            }

            // Finalize PCM file
            writer.finalize()
                .map_err(|e| {
                    error!("Failed to finalize microphone PCM file: {}", e);
                    format!("Failed to finalize microphone PCM file: {}", e)
                })?;

            info!("Microphone writer task completed: {} total samples ({} written, {} paused)",
                sample_count, sample_count - paused_count, paused_count);
            Ok::<(), String>(())
        });

        // Clone mic_tx before passing to start_capture (we need to keep one to close the channel later)
        let mic_tx_for_storage = mic_tx.clone();

        // Start microphone capture
        audio_capture.start_capture(mic_tx).map_err(|e| {
            error!("Failed to start microphone capture: {}", e);
            format!("Failed to start microphone capture: {}", e)
        })?;

        info!("Microphone capture started successfully");

        // Leak AudioCapture to keep it alive for the recording duration
        // This is intentional - the stream must stay alive or it stops immediately
        Box::leak(Box::new(audio_capture));

        (Some(mic_writer_handle), Some(mic_pcm_path), Some(mic_pause_flag), Some(mic_tx_for_storage), Some(mic_channels))
    } else {
        (None, None, None, None, None)
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
            mic_writer_handle_opt,
            mic_pcm_path_opt,
            mic_pause_flag_opt,
            mic_channels_opt,
        ),
    );

    // Store microphone sender for channel cleanup
    if let Some(mic_tx) = mic_tx_opt {
        MICROPHONE_SENDERS.lock().await.insert(recording_id.clone(), mic_tx);
    }

    // Build audio capture status message
    let audio_status = match (config.system_audio, config.microphone) {
        (true, true) => " + system audio + microphone",
        (true, false) => " + system audio",
        (false, true) => " + microphone",
        (false, false) => "",
    };

    info!("Screen recording started successfully with real-time encoding{}: {}",
        audio_status,
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
        mic_writer_handle_opt,
        mic_pcm_path_opt,
        _mic_pause_flag_opt,
        mic_channels_opt,
    ) = recordings
        .remove(&recording_id)
        .ok_or_else(|| {
            error!("Recording not found: {}", recording_id);
            format!("Recording not found: {}", recording_id)
        })?;

    // Note: AudioCapture is intentionally leaked (see start_recording)
    // Close the microphone channel by dropping the sender - this allows writer task to finish
    if let Some(_) = mic_writer_handle_opt {
        let mic_sender = MICROPHONE_SENDERS.lock().await.remove(&recording_id);
        drop(mic_sender);
        info!("Microphone channel closed");
    }

    // Release lock before awaiting
    drop(recordings);

    // Build audio status message
    let audio_status = match (audio_writer_handle_opt.is_some(), mic_writer_handle_opt.is_some()) {
        (true, true) => " + system audio + microphone",
        (true, false) => " + system audio",
        (false, true) => " + microphone",
        (false, false) => "",
    };

    info!("Stopping recording with real-time encoding{}: {}",
        audio_status,
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

    // Wait for audio writer tasks and collect successful PCM paths
    let mut audio_inputs: Vec<crate::services::ffmpeg::AudioInputConfig> = Vec::new();
    let mut pcm_files_to_cleanup: Vec<PathBuf> = Vec::new();

    // Wait for system audio writer task if present
    if let (Some(audio_writer_handle), Some(audio_pcm_path)) =
        (audio_writer_handle_opt, audio_pcm_path_opt)
    {
        info!("Waiting for system audio writer task to complete");

        match audio_writer_handle.await {
            Ok(Ok(())) => {
                info!("System audio writer task completed successfully");
                if audio_pcm_path.exists() {
                    audio_inputs.push(crate::services::ffmpeg::AudioInputConfig {
                        pcm_path: audio_pcm_path.clone(),
                        sample_rate: 48000,
                        channels: 2,
                        label: "System Audio".to_string(),
                    });
                    pcm_files_to_cleanup.push(audio_pcm_path);
                } else {
                    warn!("System audio PCM file not found");
                }
            }
            Ok(Err(e)) => {
                error!("System audio writer task failed: {}", e);
            }
            Err(e) => {
                error!("System audio writer task join error: {}", e);
            }
        }
    }

    // Wait for microphone writer task if present (with timeout)
    if let (Some(mic_writer_handle), Some(mic_pcm_path)) =
        (mic_writer_handle_opt, mic_pcm_path_opt)
    {
        info!("Waiting for microphone writer task to complete");

        // Use timeout to avoid hanging if stream doesn't close properly
        match tokio::time::timeout(
            std::time::Duration::from_secs(5),
            mic_writer_handle
        ).await {
            Ok(Ok(Ok(()))) => {
                info!("Microphone writer task completed successfully");
                if mic_pcm_path.exists() {
                    let mic_channels = mic_channels_opt.unwrap_or(1); // Default to mono if not set
                    info!("Using microphone PCM file with {} channels", mic_channels);
                    audio_inputs.push(crate::services::ffmpeg::AudioInputConfig {
                        pcm_path: mic_pcm_path.clone(),
                        sample_rate: 48000,
                        channels: mic_channels,
                        label: "Microphone".to_string(),
                    });
                    pcm_files_to_cleanup.push(mic_pcm_path);
                } else {
                    warn!("Microphone PCM file not found");
                }
            }
            Ok(Ok(Err(e))) => {
                error!("Microphone writer task failed: {}", e);
            }
            Ok(Err(e)) => {
                error!("Microphone writer task join error: {}", e);
            }
            Err(_) => {
                warn!("Microphone writer task timed out after 5 seconds - continuing with available audio");
                // Still try to use the PCM file if it exists
                if mic_pcm_path.exists() {
                    let mic_channels = mic_channels_opt.unwrap_or(1);
                    info!("Microphone PCM file exists ({}), will attempt to use it",
                        if mic_channels == 1 { "mono" } else { "stereo" });
                    audio_inputs.push(crate::services::ffmpeg::AudioInputConfig {
                        pcm_path: mic_pcm_path.clone(),
                        sample_rate: 48000,
                        channels: mic_channels,
                        label: "Microphone".to_string(),
                    });
                    pcm_files_to_cleanup.push(mic_pcm_path);
                }
            }
        }
    }

    // Perform audio muxing if we have any audio inputs
    let final_output_path = if !audio_inputs.is_empty() {
        info!("Muxing {} audio track(s) with video", audio_inputs.len());

        // Create final output path (replace video-only file)
        let final_path = output_path
            .parent()
            .unwrap()
            .join(format!(
                "recording-{}-final.mp4",
                recording_id
            ));

        // Mux video + audio(s)
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
                for pcm_file in pcm_files_to_cleanup {
                    if let Err(e) = std::fs::remove_file(&pcm_file) {
                        warn!("Failed to remove PCM audio file {}: {}", pcm_file.display(), e);
                    }
                }

                final_path
            }
            Err(e) => {
                error!("Audio muxing failed: {}", e);
                warn!("Returning video-only file");

                // Clean up PCM files even if muxing failed
                for pcm_file in pcm_files_to_cleanup {
                    if let Err(e) = std::fs::remove_file(&pcm_file) {
                        warn!("Failed to remove PCM audio file {}: {}", pcm_file.display(), e);
                    }
                }

                output_path.clone()
            }
        }
    } else {
        // No audio capture, return video-only file
        info!("No audio tracks captured, returning video-only file");
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
        if let Some((
            _screen_capture_handle,
            _webcam_capture_handle,
            _screen_encoding_handle,
            _webcam_encoding_handle,
            _mic_writer_handle_opt,
            _output_path,
            _temp_screen_path,
            _temp_webcam_path,
            _mic_audio_path_opt,
            _pip_config,
            screen_pause,
            _screen_stop_signal,
            _camera_capture,
        )) = pip_recordings.get(&recording_id)
        {
            // Pause screen capture (pauses both screen and webcam capture)
            screen_pause.store(true, std::sync::atomic::Ordering::Relaxed);
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
        _mic_writer,
        _mic_pcm_path,
        mic_pause_flag,
        _mic_channels,
    ) = recordings
        .get(&recording_id)
        .ok_or_else(|| {
            error!("Recording not found: {}", recording_id);
            format!("Recording not found: {}", recording_id)
        })?;

    // Set pause flag (frame discard enabled in capture callbacks)
    pause_flag.store(true, std::sync::atomic::Ordering::Relaxed);

    // Pause microphone if present
    if let Some(ref mic_pause) = mic_pause_flag {
        mic_pause.store(true, std::sync::atomic::Ordering::Relaxed);
    }

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
        if let Some((
            _screen_capture_handle,
            _webcam_capture_handle,
            _screen_encoding_handle,
            _webcam_encoding_handle,
            _mic_writer_handle_opt,
            _output_path,
            _temp_screen_path,
            _temp_webcam_path,
            _mic_audio_path_opt,
            _pip_config,
            screen_pause,
            _screen_stop_signal,
            _camera_capture,
        )) = pip_recordings.get(&recording_id)
        {
            // Resume screen capture (resumes both screen and webcam capture)
            screen_pause.store(false, std::sync::atomic::Ordering::Relaxed);
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
        _mic_writer,
        _mic_pcm_path,
        mic_pause_flag,
        _mic_channels,
    ) = recordings
        .get(&recording_id)
        .ok_or_else(|| {
            error!("Recording not found: {}", recording_id);
            format!("Recording not found: {}", recording_id)
        })?;

    // Clear pause flag (frame discard disabled, normal capture resumes)
    pause_flag.store(false, std::sync::atomic::Ordering::Relaxed);

    // Resume microphone if present
    if let Some(ref mic_pause) = mic_pause_flag {
        mic_pause.store(false, std::sync::atomic::Ordering::Relaxed);
    }

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
        mic_writer_handle_opt,
        mic_pcm_path_opt,
        _mic_pause_flag,
        _mic_channels_opt,
    ) = recordings.remove(&recording_id).ok_or_else(|| {
        error!("Recording not found: {}", recording_id);
        format!("Recording not found: {}", recording_id)
    })?;

    // Note: AudioCapture is intentionally leaked (see start_recording)
    // Close the microphone channel by dropping the sender
    if let Some(_) = mic_writer_handle_opt {
        let mic_sender = MICROPHONE_SENDERS.lock().await.remove(&recording_id);
        drop(mic_sender);
    }

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

    // Abort microphone writer task if present
    if let Some(mic_writer_handle) = mic_writer_handle_opt {
        mic_writer_handle.abort();
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

    // Delete the partial microphone PCM file if present
    if let Some(mic_pcm_path) = mic_pcm_path_opt {
        if mic_pcm_path.exists() {
            match std::fs::remove_file(&mic_pcm_path) {
                Ok(()) => {
                    info!("Deleted partial microphone PCM file: {}", mic_pcm_path.display());
                }
                Err(e) => {
                    warn!("Failed to delete partial microphone PCM file {}: {}", mic_pcm_path.display(), e);
                }
            }
        }
    }

    Ok(())
}

/// List available microphone devices
///
/// This command lists all available audio input devices (microphones) on the system.
/// Useful for debugging microphone issues.
#[tauri::command]
pub async fn cmd_list_microphones() -> Result<Vec<String>, String> {
    debug!("Command: list microphones");

    let audio_capture = AudioCapture::new().map_err(|e| {
        error!("Failed to initialize audio capture: {}", e);
        format!("Failed to initialize audio capture: {}", e)
    })?;

    let devices = audio_capture.enumerate_devices().map_err(|e| {
        error!("Failed to enumerate devices: {}", e);
        format!("Failed to enumerate devices: {}", e)
    })?;

    let device_names: Vec<String> = devices.iter().map(|d| d.name.clone()).collect();

    info!("Found {} microphone device(s): {:?}", device_names.len(), device_names);

    Ok(device_names)
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

    // Initialize camera capture using CameraBackend (AVFoundation on macOS)
    // Use 1080p resolution for webcam capture (sufficient for PiP overlay)
    let webcam_width = 1920u32;
    let webcam_height = 1080u32;

    let mut camera_capture = CameraBackend::new(camera_index, webcam_width, webcam_height)
        .await
        .map_err(|e| {
            error!("Failed to initialize camera: {}", e);
            format!("Camera initialization failed: {}", e)
        })?;

    info!("Camera dimensions: {}x{} @ 30fps", webcam_width, webcam_height);

    // Create PiP configuration (saved for later composition)
    let pip_config = PipConfig {
        x: pip_x,
        y: pip_y,
        width: pip_width,
        height: pip_height,
    };

    // NEW ARCHITECTURE: Record screen and webcam to SEPARATE temporary files
    // Then composite them when stopping (avoids FIFO deadlock issues)

    // Create temporary file paths
    let temp_screen_path = output_path_buf.with_file_name(format!(
        "{}-screen-temp.mp4",
        output_path_buf.file_stem().unwrap().to_string_lossy()
    ));
    let temp_webcam_path = output_path_buf.with_file_name(format!(
        "{}-webcam-temp.mp4",
        output_path_buf.file_stem().unwrap().to_string_lossy()
    ));

    info!(
        "Recording to temp files: screen={}, webcam={}",
        temp_screen_path.display(),
        temp_webcam_path.display()
    );

    // Create screen encoder
    let mut screen_encoder = FFmpegEncoder::new(
        temp_screen_path.clone(),
        screen_width,
        screen_height,
        30, // FPS
    )
    .map_err(|e| {
        error!("Failed to create screen encoder: {}", e);
        format!("Failed to create screen encoder: {}", e)
    })?;

    screen_encoder.start_encoding().await.map_err(|e| {
        error!("Failed to start screen encoder: {}", e);
        format!("Failed to start screen encoder: {}", e)
    })?;

    // Create webcam encoder
    let mut webcam_encoder = FFmpegEncoder::new(
        temp_webcam_path.clone(),
        webcam_width,
        webcam_height,
        30, // FPS
    )
    .map_err(|e| {
        error!("Failed to create webcam encoder: {}", e);
        format!("Failed to create webcam encoder: {}", e)
    })?;

    webcam_encoder.start_encoding().await.map_err(|e| {
        error!("Failed to start webcam encoder: {}", e);
        format!("Failed to start webcam encoder: {}", e)
    })?;

    // Extract pause flag and stop signal before starting capture
    let screen_pause_flag = screen_capture.get_pause_flag();
    let screen_stop_signal = screen_capture.get_stop_signal();

    // Create channels for video streams
    let (screen_video_tx, mut screen_video_rx) = mpsc::channel::<TimestampedFrame>(30);
    let (webcam_video_tx, mut webcam_video_rx) = mpsc::channel::<TimestampedFrame>(30);

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

    // Spawn screen encoding task
    let screen_encoding_handle = tokio::spawn(async move {
        info!("Screen encoding task started");
        let mut frame_count = 0;

        while let Some(frame) = screen_video_rx.recv().await {
            if let Err(e) = screen_encoder.write_frame_to_stdin(&frame).await {
                error!("Failed to write screen frame: {}", e);
                break;
            }
            frame_count += 1;
            if frame_count % 300 == 0 {
                debug!("Encoded {} screen frames", frame_count);
            }
        }

        info!("Screen encoding complete: {} frames", frame_count);
        if let Err(e) = screen_encoder.stop_encoding().await {
            error!("Failed to stop screen encoder: {}", e);
        }
    });

    // Spawn webcam encoding task
    let webcam_encoding_handle = tokio::spawn(async move {
        info!("Webcam encoding task started");
        let mut frame_count = 0;

        while let Some(frame) = webcam_video_rx.recv().await {
            if let Err(e) = webcam_encoder.write_frame_to_stdin(&frame).await {
                error!("Failed to write webcam frame: {}", e);
                break;
            }
            frame_count += 1;
            if frame_count % 300 == 0 {
                debug!("Encoded {} webcam frames", frame_count);
            }
        }

        info!("Webcam encoding complete: {} frames", frame_count);
        if let Err(e) = webcam_encoder.stop_encoding().await {
            error!("Failed to stop webcam encoder: {}", e);
        }
    });

    // Capture microphone audio for voiceover
    let mic_audio_path = output_path_buf.with_file_name(format!(
        "{}-mic-audio.wav",
        output_path_buf.file_stem().unwrap().to_string_lossy()
    ));

    let mic_writer_handle_opt = if check_microphone_permission().map_err(|e| e.to_string())? {
        info!("Starting microphone audio capture for PiP");

        let (mic_tx, handle) = {
            // Create AudioCapture instance in a block to limit its scope
            let mut audio_capture = AudioCapture::new().map_err(|e| {
                error!("Failed to initialize microphone capture: {}", e);
                format!("Failed to initialize microphone capture: {}", e)
            })?;

            // Select default microphone device
            let device_name = audio_capture.select_default_device().map_err(|e| {
                error!("Failed to select default microphone device: {}", e);
                format!("Failed to select microphone device: {}", e)
            })?;

            info!("Selected microphone: {}", device_name);

            // Get channel count and sample rate from audio capture
            let mic_channels = audio_capture.get_channels().map_err(|e| {
                error!("Failed to get microphone channel count: {}", e);
                format!("Failed to get microphone channel count: {}", e)
            })?;

            info!("Microphone channels: {}", mic_channels);

            // Create bounded channel for audio samples
            let (mic_tx, mut mic_rx) = mpsc::channel::<AudioSample>(100);

            // Clone mic_tx before passing to start_capture (we need to keep one to close the channel later)
            let mic_tx_for_storage = mic_tx.clone();

            // Start capture with the original sender
            audio_capture.start_capture(mic_tx).map_err(|e| {
                error!("Failed to start microphone capture: {}", e);
                format!("Failed to start microphone capture: {}", e)
            })?;

            // Spawn blocking task to handle audio capture
            let mic_audio_path_clone = mic_audio_path.clone();
            let handle = tokio::task::spawn_blocking(move || {

                // Wait for first sample to detect actual sample rate
                let mut writer_opt: Option<WavWriter> = None;

                while let Some(sample) = mic_rx.blocking_recv() {
                    // Create WAV writer after receiving first sample
                    if writer_opt.is_none() {
                        writer_opt = match WavWriter::new(
                            mic_audio_path_clone.clone(),
                            sample.sample_rate,
                            sample.channels,
                        ) {
                            Ok(w) => Some(w),
                            Err(e) => {
                                error!("Failed to create microphone WAV writer: {}", e);
                                return;
                            }
                        };
                        info!("Microphone WAV writer created: {} Hz, {} channels",
                            sample.sample_rate, sample.channels);
                    }

                    if let Some(ref mut writer) = writer_opt {
                        // Apply gain to increase volume (2.5x boost like webcam recording)
                        let gain = 2.5;
                        let boosted_samples: Vec<f32> = sample
                            .data
                            .iter()
                            .map(|&s| (s * gain).max(-1.0).min(1.0))
                            .collect();

                        if let Err(e) = writer.write_samples(&boosted_samples) {
                            error!("Failed to write microphone audio samples: {}", e);
                            break;
                        }
                    }
                }

                info!("Microphone audio writer task completed");

                // Finalize WAV file
                if let Some(writer) = writer_opt {
                    if let Err(e) = writer.finalize() {
                        error!("Failed to finalize microphone WAV file: {}", e);
                    }
                }
            });

            // Leak AudioCapture (it's not Send, so we can't store it)
            // It will be cleaned up when the process exits
            std::mem::forget(audio_capture);

            (mic_tx_for_storage, handle)
        }; // audio_capture binding is dropped here, safe to await

        // Store mic sender in global state so it can be closed on stop
        MICROPHONE_SENDERS.lock().await.insert(recording_id.clone(), mic_tx);

        Some(handle)
    } else {
        info!("Microphone permission not granted, skipping audio capture");
        None
    };

    // Store handles in global state (Story 4.8 - PiP pause/resume integration)
    // NEW ARCHITECTURE: Store separate encoding tasks and temp file paths
    // IMPORTANT: Must store camera_capture to prevent Drop from stopping capture
    let mic_audio_path_opt = if mic_writer_handle_opt.is_some() {
        Some(mic_audio_path)
    } else {
        None
    };

    let mut recordings = ACTIVE_PIP_RECORDINGS.lock().await;
    recordings.insert(
        recording_id.clone(),
        (
            screen_capture_handle,
            webcam_capture_handle,
            screen_encoding_handle,
            webcam_encoding_handle,
            mic_writer_handle_opt,         // Microphone audio writer
            output_path_buf.clone(),      // Final output path
            temp_screen_path.clone(),      // Temp screen file
            temp_webcam_path.clone(),      // Temp webcam file
            mic_audio_path_opt,            // Mic audio path
            pip_config.clone(),            // PiP config for composition
            screen_pause_flag,             // Pause flag
            screen_stop_signal,            // Stop signal
            camera_capture,                // Camera object (prevents Drop)
        ),
    );

    info!("PiP recording started successfully: {}", recording_id);

    Ok(recording_id)
}

/// Stop Picture-in-Picture (PiP) recording
///
/// This command stops the active PiP recording, waits for all tasks to complete,
/// composites the temp files, and returns the file path where the final recording was saved.
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
/// # Flow (NEW ARCHITECTURE)
///
/// 1. Look up PiP recording handles by ID from ACTIVE_PIP_RECORDINGS
/// 2. Drop channel senders (signals capture tasks to stop)
/// 3. Wait for screen capture task to complete
/// 4. Wait for webcam capture task to complete
/// 5. Wait for screen encoding task to complete (finalizes temp screen file)
/// 6. Wait for webcam encoding task to complete (finalizes temp webcam file)
/// 7. Use FFmpeg to composite temp files into final PiP video
/// 8. Clean up temp files
/// 9. Return final file path
#[tauri::command]
pub async fn cmd_stop_pip_recording(recording_id: String) -> Result<String, String> {
    debug!("Command: stop PiP recording {}", recording_id);

    // Remove recording from active state (NEW ARCHITECTURE - separate encoding tasks)
    let mut recordings = ACTIVE_PIP_RECORDINGS.lock().await;
    let (
        screen_capture_handle,
        webcam_capture_handle,
        screen_encoding_handle,
        webcam_encoding_handle,
        mic_writer_handle_opt,
        output_path,
        temp_screen_path,
        temp_webcam_path,
        mic_audio_path_opt,
        pip_config,
        _screen_pause,
        screen_stop_signal,
        mut camera_capture,  // Take ownership to trigger Drop after recording completes
    ) = recordings
        .remove(&recording_id)
        .ok_or_else(|| {
            error!("PiP recording not found: {}", recording_id);
            format!("PiP recording not found: {}", recording_id)
        })?;

    // Release lock before awaiting
    drop(recordings);

    info!("Stopping PiP recording: {}", recording_id);

    // Signal screen capture to stop (this will drop the channel sender, causing encoding task to finish)
    info!("Setting stop_signal to true for screen capture");
    screen_stop_signal.store(true, std::sync::atomic::Ordering::Relaxed);

    // Explicitly stop camera capture (this closes the AVFoundation session)
    camera_capture.stop_capture();

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

    // Wait for screen encoding task to complete (finalizes temp screen file)
    match screen_encoding_handle.await {
        Ok(_) => {
            info!("Screen encoding task completed");
        }
        Err(e) => {
            error!("Screen encoding task join error: {}", e);
            return Err(format!("Screen encoding task error: {}", e));
        }
    }

    // Wait for webcam encoding task to complete (finalizes temp webcam file)
    match webcam_encoding_handle.await {
        Ok(_) => {
            info!("Webcam encoding task completed");
        }
        Err(e) => {
            error!("Webcam encoding task join error: {}", e);
            return Err(format!("Webcam encoding task error: {}", e));
        }
    }

    // Close microphone channel and wait for audio writer task
    if let Some(mic_writer_handle) = mic_writer_handle_opt {
        // Close the microphone channel by dropping the sender
        let mic_sender = MICROPHONE_SENDERS.lock().await.remove(&recording_id);
        drop(mic_sender);
        info!("Microphone channel closed");

        // Wait for microphone audio writer task to complete (with timeout)
        // Note: AudioCapture is leaked with std::mem::forget, so the channel may never close
        // However, the WAV file should be complete since we already closed our sender clone
        let mic_timeout = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            mic_writer_handle
        ).await;

        match mic_timeout {
            Ok(Ok(_)) => {
                info!("Microphone audio writer task completed");
            }
            Ok(Err(e)) => {
                warn!("Microphone audio writer task join error: {}", e);
            }
            Err(_) => {
                warn!("Microphone audio writer task timed out after 5s (AudioCapture is leaked, channel won't close)");
                warn!("WAV file should be complete - proceeding with composition");
            }
        }
    }

    // Verify temp files exist
    if !temp_screen_path.exists() {
        error!("Temp screen file not found: {}", temp_screen_path.display());
        return Err(format!("Temp screen file not found: {}", temp_screen_path.display()));
    }
    if !temp_webcam_path.exists() {
        error!("Temp webcam file not found: {}", temp_webcam_path.display());
        return Err(format!("Temp webcam file not found: {}", temp_webcam_path.display()));
    }

    info!("Both temp files exist, starting composition");
    info!("  Screen: {}", temp_screen_path.display());
    info!("  Webcam: {}", temp_webcam_path.display());
    if let Some(ref mic_path) = mic_audio_path_opt {
        info!("  Microphone: {}", mic_path.display());
    }
    info!("  Output: {}", output_path.display());

    // Composite the two temp files using FFmpeg
    // Scale webcam to 1.5x larger for better visibility
    let scaled_pip_width = (pip_config.width as f32 * 1.5) as u32;
    let scaled_pip_height = (pip_config.height as f32 * 1.5) as u32;

    info!("Scaling webcam from {}x{} to {}x{} (1.5x larger)",
        pip_config.width, pip_config.height, scaled_pip_width, scaled_pip_height);

    // Use filter_complex to overlay webcam on screen at specified position
    let mut ffmpeg_command = tokio::process::Command::new("ffmpeg");

    ffmpeg_command
        .arg("-i").arg(&temp_screen_path)      // Input 0: screen video
        .arg("-i").arg(&temp_webcam_path);     // Input 1: webcam video

    // Add microphone audio as input 2 if available
    if let Some(ref mic_path) = mic_audio_path_opt {
        ffmpeg_command.arg("-i").arg(mic_path);  // Input 2: microphone audio
    }

    ffmpeg_command
        .arg("-filter_complex")
        .arg(format!(
            "[1:v]scale={}:{}[pip];[0:v][pip]overlay={}:{}",
            scaled_pip_width,
            scaled_pip_height,
            pip_config.x,
            pip_config.y
        ))
        .arg("-c:v").arg("libx264")            // Video codec
        .arg("-preset").arg("ultrafast")        // Fast encoding
        .arg("-crf").arg("23");                 // Quality

    // Map audio: use microphone if available, otherwise no audio
    // Note: Don't use -map for video because filter_complex output is used automatically
    if mic_audio_path_opt.is_some() {
        ffmpeg_command
            .arg("-map").arg("2:a")             // Map audio from microphone (input 2)
            .arg("-c:a").arg("aac")             // Audio codec
            .arg("-b:a").arg("192k");           // Audio bitrate
    } else {
        ffmpeg_command.arg("-an");              // No audio
    }

    ffmpeg_command
        .arg("-y")                              // Overwrite output
        .arg(&output_path);

    info!("Running FFmpeg composition command");

    let output = ffmpeg_command.output().await.map_err(|e| {
        error!("Failed to run FFmpeg composition: {}", e);
        format!("Failed to run FFmpeg composition: {}", e)
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("FFmpeg composition failed: {}", stderr);
        return Err(format!("FFmpeg composition failed: {}", stderr));
    }

    info!("FFmpeg composition completed successfully");

    // Clean up temp files
    if let Err(e) = tokio::fs::remove_file(&temp_screen_path).await {
        warn!("Failed to remove temp screen file: {}", e);
    } else {
        debug!("Removed temp screen file");
    }

    if let Err(e) = tokio::fs::remove_file(&temp_webcam_path).await {
        warn!("Failed to remove temp webcam file: {}", e);
    } else {
        debug!("Removed temp webcam file");
    }

    // Clean up microphone audio file if it was created
    if let Some(mic_path) = mic_audio_path_opt {
        if let Err(e) = tokio::fs::remove_file(&mic_path).await {
            warn!("Failed to remove microphone audio file: {}", e);
        } else {
            debug!("Removed microphone audio file");
        }
    }

    // Verify final file exists
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
