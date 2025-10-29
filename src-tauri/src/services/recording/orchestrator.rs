//! Recording Orchestrator
//!
//! Coordinates multi-stream recording (video + system audio + microphone audio)
//! with synchronized timing and real-time FFmpeg encoding.
//!
//! # Architecture
//!
//! The orchestrator:
//! - Receives video frames from ScreenCapture
//! - Receives system audio from ScreenCaptureKit
//! - Receives microphone audio from AudioCapture (optional)
//! - Uses FrameSynchronizer to maintain A/V sync (<50ms tolerance)
//! - Passes synchronized streams to FFmpeg encoder
//! - Handles backpressure with bounded channels (30-frame buffer)

use crate::services::audio_capture::{AudioCapture, AudioSample};
use crate::services::camera::CameraCapture;
use crate::services::ffmpeg::{CompositorFrame, FFmpegCompositor, FFmpegEncoder, PipConfig, TimestampedFrame};
use crate::services::recording::FrameSynchronizer;
use crate::services::screen_capture::ScreenCapture;
use anyhow::{Context, Result};
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tracing::{debug, error, info, warn};

/// Convert f32 audio samples to PCM i16le bytes (Story 4.7)
///
/// Audio samples are normalized f32 (-1.0 to 1.0).
/// PCM format is signed 16-bit little-endian (-32768 to 32767).
fn audio_samples_to_pcm_bytes(samples: &[f32]) -> Vec<u8> {
    samples
        .iter()
        .flat_map(|&sample| {
            let clamped = sample.clamp(-1.0, 1.0);
            let i16_sample = (clamped * 32767.0) as i16;
            i16_sample.to_le_bytes()
        })
        .collect()
}

/// Configuration for multi-stream recording
#[derive(Debug, Clone)]
pub struct RecordingConfig {
    /// Output file path for the recording
    pub output_path: PathBuf,

    /// Video frame width
    pub width: u32,

    /// Video frame height
    pub height: u32,

    /// Target frame rate (default: 30)
    pub fps: u32,

    /// Enable system audio capture
    pub enable_system_audio: bool,

    /// Enable microphone audio capture
    pub enable_microphone: bool,

    /// Enable webcam audio capture (Story 4.7)
    /// Uses third AudioCapture instance for webcam's built-in mic
    pub enable_webcam_audio: bool,

    /// Audio sample rate (default: 48000 Hz)
    pub audio_sample_rate: u32,

    /// Audio channel count (default: 2 for stereo)
    pub audio_channels: u16,
}

impl Default for RecordingConfig {
    fn default() -> Self {
        Self {
            output_path: PathBuf::from("recording.mp4"),
            width: 1920,
            height: 1080,
            fps: 30,
            enable_system_audio: false,
            enable_microphone: false,
            enable_webcam_audio: false,
            audio_sample_rate: 48000,
            audio_channels: 2,
        }
    }
}

/// Recording orchestrator for multi-stream coordination
///
/// Manages the complete recording pipeline:
/// 1. Video capture from ScreenCaptureKit
/// 2. System audio capture from ScreenCaptureKit (optional)
/// 3. Microphone capture from CPAL/CoreAudio (optional)
/// 4. Webcam audio capture from CPAL/CoreAudio (optional, Story 4.7)
/// 5. Timestamp-based synchronization via FrameSynchronizer
/// 6. Real-time FFmpeg encoding with multi-audio muxing
pub struct RecordingOrchestrator {
    /// Recording configuration
    config: RecordingConfig,

    /// Screen capture service
    screen_capture: ScreenCapture,

    /// Microphone capture service (optional)
    audio_capture: Option<AudioCapture>,

    /// Webcam audio capture service (optional, Story 4.7)
    webcam_audio_capture: Option<AudioCapture>,

    /// Frame synchronizer for A/V sync
    synchronizer: FrameSynchronizer,

    /// FFmpeg encoder for real-time encoding
    encoder: Option<FFmpegEncoder>,

    /// Active capture handles
    capture_handles: Vec<JoinHandle<()>>,

    /// Video-only temp file path (Story 4.7 - for audio muxing)
    video_only_path: Option<PathBuf>,
}

impl RecordingOrchestrator {
    /// Create a new recording orchestrator
    ///
    /// # Arguments
    ///
    /// * `config` - Recording configuration
    ///
    /// # Returns
    ///
    /// * `Ok(RecordingOrchestrator)` - Orchestrator ready to start recording
    /// * `Err(anyhow::Error)` - Failed to initialize services
    pub fn new(config: RecordingConfig) -> Result<Self> {
        info!(
            event = "orchestrator_create",
            output_path = %config.output_path.display(),
            width = config.width,
            height = config.height,
            fps = config.fps,
            system_audio = config.enable_system_audio,
            microphone = config.enable_microphone,
            "Creating recording orchestrator"
        );

        // Initialize screen capture (fullscreen mode for orchestrator)
        let mut screen_capture = ScreenCapture::new(None)
            .context("Failed to initialize screen capture")?;

        // Enable system audio if requested
        if config.enable_system_audio {
            screen_capture
                .enable_system_audio(config.audio_sample_rate, config.audio_channels)
                .context("Failed to enable system audio")?;
        }

        // Initialize microphone capture if requested
        let audio_capture = if config.enable_microphone {
            let mut capture = AudioCapture::new()
                .context("Failed to initialize microphone capture")?;

            // Select default microphone
            capture
                .select_default_device()
                .context("Failed to select default microphone")?;

            Some(capture)
        } else {
            None
        };

        // Initialize webcam audio capture if requested (Story 4.7)
        let webcam_audio_capture = if config.enable_webcam_audio {
            let mut capture = AudioCapture::new()
                .context("Failed to initialize webcam audio capture")?;

            // Select default device (user can configure to webcam's built-in mic)
            capture
                .select_default_device()
                .context("Failed to select webcam audio device")?;

            Some(capture)
        } else {
            None
        };

        // Create frame synchronizer (30 FPS, 50ms tolerance per AC #4)
        let synchronizer = FrameSynchronizer::new(config.fps, 50);

        info!("Recording orchestrator created successfully");

        Ok(Self {
            config,
            screen_capture,
            audio_capture,
            webcam_audio_capture,
            synchronizer,
            encoder: None,
            capture_handles: Vec::new(),
            video_only_path: None,
        })
    }

    /// Start recording with multi-stream coordination
    ///
    /// Spawns async tasks for:
    /// - Video frame capture
    /// - System audio capture (if enabled)
    /// - Microphone audio capture (if enabled)
    /// - Frame synchronization and encoding
    ///
    /// # Returns
    ///
    /// * `Ok(())` - Recording started successfully
    /// * `Err(anyhow::Error)` - Failed to start recording
    pub async fn start_recording(&mut self) -> Result<()> {
        info!(
            event = "recording_start",
            output_path = %self.config.output_path.display(),
            "Starting multi-stream recording"
        );

        // Create FFmpeg encoder (Story 4.7: encode to temp video-only file for later muxing)
        let video_only_path = self.config.output_path.with_file_name(
            format!("{}_video_only.mp4", self.config.output_path.file_stem().unwrap().to_str().unwrap())
        );

        // Store video-only path for audio muxing in stop_recording()
        self.video_only_path = Some(video_only_path.clone());

        let mut encoder = FFmpegEncoder::new(
            video_only_path,
            self.config.width,
            self.config.height,
            self.config.fps,
        )
        .context("Failed to create FFmpeg encoder")?;

        // Start encoding process
        encoder
            .start_encoding()
            .await
            .context("Failed to start FFmpeg encoding")?;

        self.encoder = Some(encoder);

        // Create channels for video and audio streams
        // Use bounded channels (30-frame buffer per architecture)
        let (video_tx, mut video_rx) = mpsc::channel::<TimestampedFrame>(30);

        let (system_audio_tx, mut system_audio_rx) = if self.config.enable_system_audio {
            let (tx, rx) = mpsc::channel::<AudioSample>(30);
            (Some(tx), Some(rx))
        } else {
            (None, None)
        };

        let (mic_audio_tx, mut mic_audio_rx) = if self.config.enable_microphone {
            let (tx, rx) = mpsc::channel::<AudioSample>(30);
            (Some(tx), Some(rx))
        } else {
            (None, None)
        };

        let (webcam_audio_tx, mut webcam_audio_rx) = if self.config.enable_webcam_audio {
            let (tx, rx) = mpsc::channel::<AudioSample>(30);
            (Some(tx), Some(rx))
        } else {
            (None, None)
        };

        // Start screen capture (video + optional system audio)
        let capture_handle = self
            .screen_capture
            .start_continuous_capture(video_tx, system_audio_tx, None)
            .context("Failed to start screen capture")?;

        self.capture_handles.push(capture_handle);

        // Start microphone capture if enabled
        if let Some(ref mut audio_capture) = self.audio_capture {
            if let Some(mic_tx) = mic_audio_tx.clone() {
                audio_capture
                    .start_capture(mic_tx)
                    .context("Failed to start microphone capture")?;
                info!("Microphone capture started");
            }
        }

        // Start webcam audio capture if enabled (Story 4.7)
        if let Some(ref mut webcam_capture) = self.webcam_audio_capture {
            if let Some(webcam_tx) = webcam_audio_tx.clone() {
                webcam_capture
                    .start_capture(webcam_tx)
                    .context("Failed to start webcam audio capture")?;
                info!("Webcam audio capture started");
            }
        }

        // Create PCM file paths for audio muxing (Story 4.7)
        let output_path = self.config.output_path.clone();
        let system_audio_pcm_path = output_path.with_file_name(
            format!("{}_system_audio.pcm", output_path.file_stem().unwrap().to_str().unwrap())
        );
        let mic_audio_pcm_path = output_path.with_file_name(
            format!("{}_microphone.pcm", output_path.file_stem().unwrap().to_str().unwrap())
        );
        let webcam_audio_pcm_path = output_path.with_file_name(
            format!("{}_webcam_audio.pcm", output_path.file_stem().unwrap().to_str().unwrap())
        );

        let enable_system_audio = self.config.enable_system_audio;
        let enable_microphone = self.config.enable_microphone;
        let enable_webcam_audio = self.config.enable_webcam_audio;

        // Spawn synchronization and encoding task
        let mut encoder = self.encoder.take().expect("Encoder should be initialized");
        let mut synchronizer = self.synchronizer.clone();

        let sync_handle = tokio::spawn(async move {
            let mut current_video_timestamp_ms: u64 = 0;

            // Open PCM file handles for audio writing (Story 4.7)
            let mut system_audio_file = if enable_system_audio {
                File::create(&system_audio_pcm_path).ok()
            } else {
                None
            };

            let mut mic_audio_file = if enable_microphone {
                File::create(&mic_audio_pcm_path).ok()
            } else {
                None
            };

            let mut webcam_audio_file = if enable_webcam_audio {
                File::create(&webcam_audio_pcm_path).ok()
            } else {
                None
            };

            loop {
                tokio::select! {
                    // Process video frames
                    Some(frame) = video_rx.recv() => {
                        current_video_timestamp_ms = frame.timestamp_ms;

                        // Synchronize video frame
                        let frame_number = current_video_timestamp_ms / 33;  // Approximate frame number
                        let should_process = synchronizer.process_frame(frame.timestamp_ms, frame_number);

                        if should_process {
                            // Write frame to FFmpeg encoder
                            if let Err(e) = encoder.write_frame_to_stdin(&frame).await {
                                error!(
                                    event = "video_encode_error",
                                    error = %e,
                                    "Failed to write video frame to encoder"
                                );
                                break;
                            }
                        }
                    }

                    // Process system audio samples
                    Some(audio_sample) = async {
                        if let Some(ref mut rx) = system_audio_rx {
                            rx.recv().await
                        } else {
                            // If no system audio, park this branch forever
                            std::future::pending().await
                        }
                    } => {
                        // Synchronize system audio with video
                        let should_process = synchronizer.process_audio_sample(
                            audio_sample.timestamp_ns,
                            true,  // is_system_audio
                            current_video_timestamp_ms,
                        );

                        if should_process {
                            debug!(
                                event = "system_audio_processed",
                                samples = audio_sample.data.len(),
                                timestamp_ns = audio_sample.timestamp_ns,
                                "System audio sample synchronized"
                            );
                            // Story 4.7: Write audio samples to PCM file
                            if let Some(ref mut file) = system_audio_file {
                                let pcm_bytes = audio_samples_to_pcm_bytes(&audio_sample.data);
                                if let Err(e) = file.write_all(&pcm_bytes) {
                                    error!(
                                        event = "system_audio_write_error",
                                        error = %e,
                                        "Failed to write system audio to PCM file"
                                    );
                                }
                            }
                        }
                    }

                    // Process microphone audio samples
                    Some(audio_sample) = async {
                        if let Some(ref mut rx) = mic_audio_rx {
                            rx.recv().await
                        } else {
                            // If no microphone, park this branch forever
                            std::future::pending().await
                        }
                    } => {
                        // Synchronize microphone audio with video
                        let should_process = synchronizer.process_audio_sample(
                            audio_sample.timestamp_ns,
                            false,  // is_system_audio = false (microphone)
                            current_video_timestamp_ms,
                        );

                        if should_process {
                            debug!(
                                event = "mic_audio_processed",
                                samples = audio_sample.data.len(),
                                timestamp_ns = audio_sample.timestamp_ns,
                                "Microphone audio sample synchronized"
                            );
                            // Story 4.7: Write audio samples to PCM file
                            if let Some(ref mut file) = mic_audio_file {
                                let pcm_bytes = audio_samples_to_pcm_bytes(&audio_sample.data);
                                if let Err(e) = file.write_all(&pcm_bytes) {
                                    error!(
                                        event = "mic_audio_write_error",
                                        error = %e,
                                        "Failed to write microphone audio to PCM file"
                                    );
                                }
                            }
                        }
                    }

                    // Process webcam audio samples (Story 4.7)
                    Some(audio_sample) = async {
                        if let Some(ref mut rx) = webcam_audio_rx {
                            rx.recv().await
                        } else {
                            // If no webcam audio, park this branch forever
                            std::future::pending().await
                        }
                    } => {
                        // Synchronize webcam audio with video
                        let should_process = synchronizer.process_audio_sample(
                            audio_sample.timestamp_ns,
                            false,  // is_system_audio = false (webcam mic)
                            current_video_timestamp_ms,
                        );

                        if should_process {
                            debug!(
                                event = "webcam_audio_processed",
                                samples = audio_sample.data.len(),
                                timestamp_ns = audio_sample.timestamp_ns,
                                "Webcam audio sample synchronized"
                            );
                            // Story 4.7: Write webcam audio samples to PCM file
                            if let Some(ref mut file) = webcam_audio_file {
                                let pcm_bytes = audio_samples_to_pcm_bytes(&audio_sample.data);
                                if let Err(e) = file.write_all(&pcm_bytes) {
                                    error!(
                                        event = "webcam_audio_write_error",
                                        error = %e,
                                        "Failed to write webcam audio to PCM file"
                                    );
                                }
                            }
                        }
                    }

                    else => {
                        // All channels closed, stop recording
                        info!("All capture channels closed, stopping recording");
                        break;
                    }
                }

                // Check synchronization health periodically
                if !synchronizer.is_sync_healthy() {
                    warn!(
                        event = "sync_unhealthy",
                        "Audio/video synchronization drift detected"
                    );
                }
            }

            // Flush and close PCM files (Story 4.7)
            if let Some(ref mut file) = system_audio_file {
                let _ = file.flush();
            }
            if let Some(ref mut file) = mic_audio_file {
                let _ = file.flush();
            }
            if let Some(ref mut file) = webcam_audio_file {
                let _ = file.flush();
            }

            // Stop encoding when capture finishes
            if let Err(e) = encoder.stop_encoding().await {
                error!(
                    event = "encoding_stop_error",
                    error = %e,
                    "Failed to stop encoder cleanly"
                );
            } else {
                info!("Recording encoding completed successfully");
            }
        });

        self.capture_handles.push(sync_handle);

        info!("Multi-stream recording started successfully");

        Ok(())
    }

    /// Start PiP recording with screen + webcam composition (Story 4.6)
    ///
    /// Spawns async tasks for:
    /// - Screen video capture
    /// - Webcam video capture
    /// - System audio capture (if enabled)
    /// - Microphone audio capture (if enabled)
    /// - Dual video stream synchronization and composition
    ///
    /// # Arguments
    ///
    /// * `camera_index` - Index of the webcam to use (from camera::list_cameras())
    /// * `pip_config` - PiP position and size configuration
    ///
    /// # Returns
    ///
    /// * `Ok(())` - PiP recording started successfully
    /// * `Err(anyhow::Error)` - Failed to start recording
    ///
    /// # Implementation Notes
    ///
    /// - Uses FFmpegCompositor for real-time PiP composition
    /// - Screen and webcam frames written to separate named pipes (FIFOs)
    /// - FrameSynchronizer tracks both video streams independently
    /// - Drift between streams detected and logged
    pub async fn start_pip_recording(
        &mut self,
        camera_index: u32,
        pip_config: PipConfig,
    ) -> Result<()> {
        info!(
            event = "pip_recording_start",
            output_path = %self.config.output_path.display(),
            camera_index = camera_index,
            pip_position = format!("({},{})", pip_config.x, pip_config.y),
            pip_size = format!("{}x{}", pip_config.width, pip_config.height),
            "Starting PiP recording (screen + webcam)"
        );

        // Initialize webcam capture
        let mut camera_capture = CameraCapture::new(camera_index)
            .context("Failed to initialize camera capture")?;

        let webcam_width = camera_capture.width();
        let webcam_height = camera_capture.height();

        info!(
            "Camera initialized: {}x{} @ 30fps (camera index {})",
            webcam_width, webcam_height, camera_index
        );

        // Create FFmpeg compositor for PiP (Story 4.7: encode to temp video-only file for later muxing)
        let video_only_path_pip = self.config.output_path.with_file_name(
            format!("{}_video_only.mp4", self.config.output_path.file_stem().unwrap().to_str().unwrap())
        );

        // Store video-only path for audio muxing in stop_recording()
        self.video_only_path = Some(video_only_path_pip.clone());

        let mut compositor = FFmpegCompositor::new(
            video_only_path_pip,
            self.config.width,
            self.config.height,
            webcam_width,
            webcam_height,
            self.config.fps,
            pip_config,
        )
        .context("Failed to create FFmpeg compositor")?;

        // Start composition process (with named pipes)
        compositor
            .start_composition()
            .await
            .context("Failed to start FFmpeg composition")?;

        // Create channels for video and audio streams
        // Use bounded channels (30-frame buffer per architecture)
        let (screen_video_tx, mut screen_video_rx) = mpsc::channel::<TimestampedFrame>(30);
        let (webcam_video_tx, mut webcam_video_rx) = mpsc::channel::<TimestampedFrame>(30);

        let (system_audio_tx, mut system_audio_rx) = if self.config.enable_system_audio {
            let (tx, rx) = mpsc::channel::<AudioSample>(30);
            (Some(tx), Some(rx))
        } else {
            (None, None)
        };

        let (mic_audio_tx, mut mic_audio_rx) = if self.config.enable_microphone {
            let (tx, rx) = mpsc::channel::<AudioSample>(30);
            (Some(tx), Some(rx))
        } else {
            (None, None)
        };

        let (webcam_audio_tx, mut webcam_audio_rx) = if self.config.enable_webcam_audio {
            let (tx, rx) = mpsc::channel::<AudioSample>(30);
            (Some(tx), Some(rx))
        } else {
            (None, None)
        };

        // Start screen capture (video + optional system audio)
        let screen_capture_handle = self
            .screen_capture
            .start_continuous_capture(screen_video_tx, system_audio_tx, None)
            .context("Failed to start screen capture")?;

        self.capture_handles.push(screen_capture_handle);

        // Start webcam capture
        let webcam_capture_handle = camera_capture
            .start_continuous_capture(webcam_video_tx)
            .context("Failed to start webcam capture")?;

        self.capture_handles.push(webcam_capture_handle);

        // Start microphone capture if enabled
        if let Some(ref mut audio_capture) = self.audio_capture {
            if let Some(mic_tx) = mic_audio_tx.clone() {
                audio_capture
                    .start_capture(mic_tx)
                    .context("Failed to start microphone capture")?;
                info!("Microphone capture started");
            }
        }

        // Start webcam audio capture if enabled (Story 4.7)
        if let Some(ref mut webcam_capture) = self.webcam_audio_capture {
            if let Some(webcam_tx) = webcam_audio_tx.clone() {
                webcam_capture
                    .start_capture(webcam_tx)
                    .context("Failed to start webcam audio capture")?;
                info!("Webcam audio capture started");
            }
        }

        // Create PCM file paths for audio muxing (Story 4.7)
        let output_path_pip = self.config.output_path.clone();
        let system_audio_pcm_path_pip = output_path_pip.with_file_name(
            format!("{}_system_audio.pcm", output_path_pip.file_stem().unwrap().to_str().unwrap())
        );
        let mic_audio_pcm_path_pip = output_path_pip.with_file_name(
            format!("{}_microphone.pcm", output_path_pip.file_stem().unwrap().to_str().unwrap())
        );
        let webcam_audio_pcm_path_pip = output_path_pip.with_file_name(
            format!("{}_webcam_audio.pcm", output_path_pip.file_stem().unwrap().to_str().unwrap())
        );

        let enable_system_audio_pip = self.config.enable_system_audio;
        let enable_microphone_pip = self.config.enable_microphone;
        let enable_webcam_audio_pip = self.config.enable_webcam_audio;

        // Spawn synchronization and composition task
        let mut synchronizer = self.synchronizer.clone();

        let composition_handle = tokio::spawn(async move {
            let mut current_screen_timestamp_ms: u64 = 0;
            let mut screen_frame_number: u64 = 0;
            let mut webcam_frame_number: u64 = 0;

            // Open PCM file handles for audio writing (Story 4.7)
            let mut system_audio_file = if enable_system_audio_pip {
                File::create(&system_audio_pcm_path_pip).ok()
            } else {
                None
            };

            let mut mic_audio_file = if enable_microphone_pip {
                File::create(&mic_audio_pcm_path_pip).ok()
            } else {
                None
            };

            let mut webcam_audio_file = if enable_webcam_audio_pip {
                File::create(&webcam_audio_pcm_path_pip).ok()
            } else {
                None
            };

            loop {
                tokio::select! {
                    // Process screen video frames
                    Some(screen_frame) = screen_video_rx.recv() => {
                        current_screen_timestamp_ms = screen_frame.timestamp_ms;

                        // Synchronize screen video frame
                        let should_process = synchronizer.process_frame(
                            screen_frame.timestamp_ms,
                            screen_frame_number,
                        );

                        if should_process {
                            // Convert to CompositorFrame
                            let compositor_frame = CompositorFrame {
                                data: screen_frame.data,
                                timestamp_ms: screen_frame.timestamp_ms,
                                width: screen_frame.width,
                                height: screen_frame.height,
                            };

                            // Write frame to compositor screen pipe
                            if let Err(e) = compositor.write_screen_frame(&compositor_frame).await {
                                error!(
                                    event = "screen_frame_write_error",
                                    error = %e,
                                    "Failed to write screen frame to compositor"
                                );
                                break;
                            }

                            screen_frame_number += 1;
                        }
                    }

                    // Process webcam video frames
                    Some(webcam_frame) = webcam_video_rx.recv() => {
                        // Synchronize webcam frame with screen video reference
                        let should_process = synchronizer.process_webcam_frame(
                            webcam_frame.timestamp_ms,
                            webcam_frame_number,
                            current_screen_timestamp_ms,
                        );

                        if should_process {
                            // Convert to CompositorFrame
                            let compositor_frame = CompositorFrame {
                                data: webcam_frame.data,
                                timestamp_ms: webcam_frame.timestamp_ms,
                                width: webcam_frame.width,
                                height: webcam_frame.height,
                            };

                            // Write frame to compositor webcam pipe
                            if let Err(e) = compositor.write_webcam_frame(&compositor_frame).await {
                                error!(
                                    event = "webcam_frame_write_error",
                                    error = %e,
                                    "Failed to write webcam frame to compositor"
                                );
                                break;
                            }

                            webcam_frame_number += 1;
                        }
                    }

                    // Process system audio samples
                    Some(audio_sample) = async {
                        if let Some(ref mut rx) = system_audio_rx {
                            rx.recv().await
                        } else {
                            // If no system audio, park this branch forever
                            std::future::pending().await
                        }
                    } => {
                        // Synchronize system audio with video
                        let should_process = synchronizer.process_audio_sample(
                            audio_sample.timestamp_ns,
                            true,  // is_system_audio
                            current_screen_timestamp_ms,
                        );

                        if should_process {
                            debug!(
                                event = "system_audio_processed",
                                samples = audio_sample.data.len(),
                                timestamp_ns = audio_sample.timestamp_ns,
                                "System audio sample synchronized"
                            );
                            // Story 4.7: Write audio samples to PCM file (PiP recording)
                            if let Some(ref mut file) = system_audio_file {
                                let pcm_bytes = audio_samples_to_pcm_bytes(&audio_sample.data);
                                if let Err(e) = file.write_all(&pcm_bytes) {
                                    error!(
                                        event = "system_audio_write_error",
                                        error = %e,
                                        "Failed to write system audio to PCM file (PiP)"
                                    );
                                }
                            }
                        }
                    }

                    // Process microphone audio samples
                    Some(audio_sample) = async {
                        if let Some(ref mut rx) = mic_audio_rx {
                            rx.recv().await
                        } else {
                            // If no microphone, park this branch forever
                            std::future::pending().await
                        }
                    } => {
                        // Synchronize microphone audio with video
                        let should_process = synchronizer.process_audio_sample(
                            audio_sample.timestamp_ns,
                            false,  // is_system_audio = false (microphone)
                            current_screen_timestamp_ms,
                        );

                        if should_process {
                            debug!(
                                event = "mic_audio_processed",
                                samples = audio_sample.data.len(),
                                timestamp_ns = audio_sample.timestamp_ns,
                                "Microphone audio sample synchronized"
                            );
                            // Story 4.7: Write audio samples to PCM file (PiP recording)
                            if let Some(ref mut file) = mic_audio_file {
                                let pcm_bytes = audio_samples_to_pcm_bytes(&audio_sample.data);
                                if let Err(e) = file.write_all(&pcm_bytes) {
                                    error!(
                                        event = "mic_audio_write_error",
                                        error = %e,
                                        "Failed to write microphone audio to PCM file (PiP)"
                                    );
                                }
                            }
                        }
                    }

                    // Process webcam audio samples (Story 4.7)
                    Some(audio_sample) = async {
                        if let Some(ref mut rx) = webcam_audio_rx {
                            rx.recv().await
                        } else {
                            // If no webcam audio, park this branch forever
                            std::future::pending().await
                        }
                    } => {
                        // Synchronize webcam audio with video
                        let should_process = synchronizer.process_audio_sample(
                            audio_sample.timestamp_ns,
                            false,  // is_system_audio = false (webcam mic)
                            current_screen_timestamp_ms,
                        );

                        if should_process {
                            debug!(
                                event = "webcam_audio_processed",
                                samples = audio_sample.data.len(),
                                timestamp_ns = audio_sample.timestamp_ns,
                                "Webcam audio sample synchronized (PiP recording)"
                            );
                            // Story 4.7: Write webcam audio samples to PCM file (PiP recording)
                            if let Some(ref mut file) = webcam_audio_file {
                                let pcm_bytes = audio_samples_to_pcm_bytes(&audio_sample.data);
                                if let Err(e) = file.write_all(&pcm_bytes) {
                                    error!(
                                        event = "webcam_audio_write_error",
                                        error = %e,
                                        "Failed to write webcam audio to PCM file (PiP)"
                                    );
                                }
                            }
                        }
                    }

                    else => {
                        // All channels closed, stop recording
                        info!("All capture channels closed, stopping PiP recording");
                        break;
                    }
                }

                // Check synchronization health periodically
                if !synchronizer.is_sync_healthy() {
                    warn!(
                        event = "pip_sync_unhealthy",
                        "PiP recording: Audio/video synchronization drift detected"
                    );
                }
            }

            // Flush and close PCM files (Story 4.7)
            if let Some(ref mut file) = system_audio_file {
                let _ = file.flush();
            }
            if let Some(ref mut file) = mic_audio_file {
                let _ = file.flush();
            }
            if let Some(ref mut file) = webcam_audio_file {
                let _ = file.flush();
            }

            // Stop composition when capture finishes
            if let Err(e) = compositor.stop_composition().await {
                error!(
                    event = "composition_stop_error",
                    error = %e,
                    "Failed to stop compositor cleanly"
                );
            } else {
                info!("PiP recording composition completed successfully");
            }
        });

        self.capture_handles.push(composition_handle);

        info!("PiP recording started successfully (screen + webcam)");

        Ok(())
    }

    /// Stop recording and finalize output file
    ///
    /// Stops all capture streams, waits for encoding to complete,
    /// and returns sync metrics.
    ///
    /// # Returns
    ///
    /// * `Ok(SyncMetrics)` - Final synchronization metrics
    /// * `Err(anyhow::Error)` - Failed to stop recording cleanly
    pub async fn stop_recording(&mut self) -> Result<()> {
        info!(
            event = "recording_stop",
            output_path = %self.config.output_path.display(),
            "Stopping multi-stream recording"
        );

        // Stop screen capture
        info!("ORCHESTRATOR: About to call screen_capture.stop_capture()");
        self.screen_capture.stop_capture();
        info!("ORCHESTRATOR: Returned from screen_capture.stop_capture()");

        // Stop microphone capture
        if let Some(ref mut audio_capture) = self.audio_capture {
            audio_capture.stop_capture();
        }

        // Stop webcam audio capture (Story 4.7)
        if let Some(ref mut webcam_capture) = self.webcam_audio_capture {
            webcam_capture.stop_capture();
        }

        // Wait for all capture tasks to complete
        for handle in self.capture_handles.drain(..) {
            if let Err(e) = handle.await {
                warn!(
                    event = "capture_task_error",
                    error = %e,
                    "Capture task failed"
                );
            }
        }

        // Get final sync metrics
        let metrics = self.synchronizer.get_metrics();
        info!(
            event = "recording_complete",
            total_frames = metrics.total_frames,
            dropped_frames = metrics.dropped_frames,
            system_audio_samples = metrics.total_system_audio_samples,
            mic_audio_samples = metrics.total_mic_audio_samples,
            max_drift_ms = metrics.max_drift_ms,
            "Recording completed"
        );

        // Story 4.7: Mux audio tracks with video if any audio streams enabled
        if self.config.enable_system_audio || self.config.enable_microphone || self.config.enable_webcam_audio {
            if let Some(video_only_path) = &self.video_only_path {
                info!("Starting audio muxing with video");

                // Build AudioInputConfig for each enabled audio stream
                let mut audio_inputs = Vec::new();

                let output_stem = self.config.output_path.file_stem().unwrap().to_str().unwrap();

                if self.config.enable_system_audio {
                    let pcm_path = self.config.output_path.with_file_name(
                        format!("{}_system_audio.pcm", output_stem)
                    );
                    audio_inputs.push(crate::services::ffmpeg::AudioInputConfig {
                        pcm_path,
                        sample_rate: self.config.audio_sample_rate,
                        channels: self.config.audio_channels,
                        label: "System Audio".to_string(),
                    });
                }

                if self.config.enable_microphone {
                    let pcm_path = self.config.output_path.with_file_name(
                        format!("{}_microphone.pcm", output_stem)
                    );
                    audio_inputs.push(crate::services::ffmpeg::AudioInputConfig {
                        pcm_path,
                        sample_rate: self.config.audio_sample_rate,
                        channels: self.config.audio_channels,
                        label: "Microphone".to_string(),
                    });
                }

                if self.config.enable_webcam_audio {
                    let pcm_path = self.config.output_path.with_file_name(
                        format!("{}_webcam_audio.pcm", output_stem)
                    );
                    audio_inputs.push(crate::services::ffmpeg::AudioInputConfig {
                        pcm_path,
                        sample_rate: self.config.audio_sample_rate,
                        channels: self.config.audio_channels,
                        label: "Webcam".to_string(),
                    });
                }

                // Call finalize_with_audio to mux video + audio
                crate::services::ffmpeg::FFmpegEncoder::finalize_with_audio(
                    video_only_path.clone(),
                    audio_inputs,
                    self.config.output_path.clone(),
                )
                .await
                .context("Failed to mux audio with video")?;

                info!("Audio muxing completed successfully");

                // Clean up temporary files
                let _ = std::fs::remove_file(video_only_path);
                if self.config.enable_system_audio {
                    let _ = std::fs::remove_file(self.config.output_path.with_file_name(
                        format!("{}_system_audio.pcm", output_stem)
                    ));
                }
                if self.config.enable_microphone {
                    let _ = std::fs::remove_file(self.config.output_path.with_file_name(
                        format!("{}_microphone.pcm", output_stem)
                    ));
                }
                if self.config.enable_webcam_audio {
                    let _ = std::fs::remove_file(self.config.output_path.with_file_name(
                        format!("{}_webcam_audio.pcm", output_stem)
                    ));
                }
            }
        }

        // Verify output file exists
        if !self.config.output_path.exists() {
            return Err(anyhow::anyhow!(
                "Recording output file not created: {}",
                self.config.output_path.display()
            ));
        }

        info!(
            "Recording saved successfully: {}",
            self.config.output_path.display()
        );

        Ok(())
    }

    /// Pause recording (Story 4.8 - AC #1, H1, H2)
    ///
    /// Pauses all active capture streams (screen, microphone, webcam audio).
    /// Uses frame/sample discard approach - streams continue running but discard data.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if pause succeeded for all streams
    pub fn pause_recording(&mut self) -> Result<()> {
        info!("Pausing multi-stream recording");

        // Pause screen capture (video + system audio)
        self.screen_capture
            .pause_capture()
            .context("Failed to pause screen capture")?;

        // Pause microphone capture if active
        if let Some(ref audio_capture) = self.audio_capture {
            audio_capture
                .pause_capture()
                .context("Failed to pause microphone capture")?;
        }

        // Pause webcam audio capture if active (Story 4.7 - H2)
        if let Some(ref webcam_audio) = self.webcam_audio_capture {
            webcam_audio
                .pause_capture()
                .context("Failed to pause webcam audio capture")?;
        }

        info!("All streams paused successfully");
        Ok(())
    }

    /// Resume recording (Story 4.8 - AC #3, H1, H2)
    ///
    /// Resumes all active capture streams after a pause.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if resume succeeded for all streams
    pub fn resume_recording(&mut self) -> Result<()> {
        info!("Resuming multi-stream recording");

        // Resume screen capture (video + system audio)
        self.screen_capture
            .resume_capture()
            .context("Failed to resume screen capture")?;

        // Resume microphone capture if active
        if let Some(ref audio_capture) = self.audio_capture {
            audio_capture
                .resume_capture()
                .context("Failed to resume microphone capture")?;
        }

        // Resume webcam audio capture if active (Story 4.7 - H2)
        if let Some(ref webcam_audio) = self.webcam_audio_capture {
            webcam_audio
                .resume_capture()
                .context("Failed to resume webcam audio capture")?;
        }

        info!("All streams resumed successfully");
        Ok(())
    }

    /// Check if recording is currently paused (Story 4.8)
    ///
    /// Returns true if screen capture is paused (all streams pause together)
    pub fn is_paused(&self) -> bool {
        self.screen_capture.is_paused()
    }

    /// Get pause flags for external control (Story 4.8 - PiP pause/resume integration)
    ///
    /// Returns Arc<AtomicBool> references for each active stream's pause flag.
    /// These can be stored in PipRecordingHandle and controlled by commands without
    /// accessing the orchestrator instance.
    ///
    /// # Returns
    ///
    /// Tuple of:
    /// - Screen capture pause flag (always present)
    /// - Microphone pause flag (optional, if microphone enabled)
    /// - Webcam audio pause flag (optional, if webcam audio enabled)
    pub fn get_pause_flags(&self) -> (
        std::sync::Arc<std::sync::atomic::AtomicBool>,
        Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
        Option<std::sync::Arc<std::sync::atomic::AtomicBool>>,
    ) {
        let screen_pause = self.screen_capture.get_pause_flag();
        let mic_pause = self.audio_capture.as_ref().map(|a| a.get_pause_flag());
        let webcam_audio_pause = self.webcam_audio_capture.as_ref().map(|a| a.get_pause_flag());

        (screen_pause, mic_pause, webcam_audio_pause)
    }

    /// Get current synchronization metrics
    pub fn get_sync_metrics(&self) -> &crate::services::recording::SyncMetrics {
        self.synchronizer.get_metrics()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_recording_config_default() {
        let config = RecordingConfig::default();
        assert_eq!(config.width, 1920);
        assert_eq!(config.height, 1080);
        assert_eq!(config.fps, 30);
        assert_eq!(config.audio_sample_rate, 48000);
        assert_eq!(config.audio_channels, 2);
        assert!(!config.enable_system_audio);
        assert!(!config.enable_microphone);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_orchestrator_creation_video_only() {
        let temp_dir = env::temp_dir();
        let output_path = temp_dir.join("test_orchestrator_video.mp4");

        let config = RecordingConfig {
            output_path,
            width: 640,
            height: 480,
            fps: 30,
            enable_system_audio: false,
            enable_microphone: false,
            ..Default::default()
        };

        // Should succeed if screen recording permission granted
        match RecordingOrchestrator::new(config) {
            Ok(orchestrator) => {
                assert!(orchestrator.audio_capture.is_none());
                assert!(!orchestrator.screen_capture.is_system_audio_enabled());
            }
            Err(e) => {
                // Acceptable if permission not granted
                println!("Orchestrator creation failed (permission?): {}", e);
            }
        }
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_orchestrator_creation_with_system_audio() {
        let temp_dir = env::temp_dir();
        let output_path = temp_dir.join("test_orchestrator_system_audio.mp4");

        let config = RecordingConfig {
            output_path,
            width: 640,
            height: 480,
            fps: 30,
            enable_system_audio: true,
            enable_microphone: false,
            ..Default::default()
        };

        match RecordingOrchestrator::new(config) {
            Ok(orchestrator) => {
                assert!(orchestrator.audio_capture.is_none());
                assert!(orchestrator.screen_capture.is_system_audio_enabled());
            }
            Err(e) => {
                println!("Orchestrator creation failed (permission?): {}", e);
            }
        }
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_orchestrator_creation_with_microphone() {
        let temp_dir = env::temp_dir();
        let output_path = temp_dir.join("test_orchestrator_microphone.mp4");

        let config = RecordingConfig {
            output_path,
            width: 640,
            height: 480,
            fps: 30,
            enable_system_audio: false,
            enable_microphone: true,
            ..Default::default()
        };

        match RecordingOrchestrator::new(config) {
            Ok(orchestrator) => {
                assert!(orchestrator.audio_capture.is_some());
            }
            Err(e) => {
                // Acceptable if no microphone available
                println!("Orchestrator creation failed (no microphone?): {}", e);
            }
        }
    }
}
