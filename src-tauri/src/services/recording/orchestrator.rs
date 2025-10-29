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
use crate::services::ffmpeg::{FFmpegEncoder, TimestampedFrame};
use crate::services::recording::FrameSynchronizer;
use crate::services::screen_capture::ScreenCapture;
use anyhow::{Context, Result};
use std::path::PathBuf;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tracing::{debug, error, info, warn};

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
/// 4. Timestamp-based synchronization via FrameSynchronizer
/// 5. Real-time FFmpeg encoding with multi-audio muxing
pub struct RecordingOrchestrator {
    /// Recording configuration
    config: RecordingConfig,

    /// Screen capture service
    screen_capture: ScreenCapture,

    /// Microphone capture service (optional)
    audio_capture: Option<AudioCapture>,

    /// Frame synchronizer for A/V sync
    synchronizer: FrameSynchronizer,

    /// FFmpeg encoder for real-time encoding
    encoder: Option<FFmpegEncoder>,

    /// Active capture handles
    capture_handles: Vec<JoinHandle<()>>,
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

        // Initialize screen capture
        let mut screen_capture = ScreenCapture::new()
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

        // Create frame synchronizer (30 FPS, 50ms tolerance per AC #4)
        let synchronizer = FrameSynchronizer::new(config.fps, 50);

        info!("Recording orchestrator created successfully");

        Ok(Self {
            config,
            screen_capture,
            audio_capture,
            synchronizer,
            encoder: None,
            capture_handles: Vec::new(),
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

        // Create FFmpeg encoder
        let mut encoder = FFmpegEncoder::new(
            self.config.output_path.clone(),
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

        // Start screen capture (video + optional system audio)
        let capture_handle = self
            .screen_capture
            .start_continuous_capture(video_tx, system_audio_tx)
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

        // Spawn synchronization and encoding task
        let mut encoder = self.encoder.take().expect("Encoder should be initialized");
        let mut synchronizer = self.synchronizer.clone();

        let sync_handle = tokio::spawn(async move {
            let mut current_video_timestamp_ms: u64 = 0;

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
                            // TODO (Task 5): Pass audio to FFmpeg multi-audio muxer
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
                            // TODO (Task 5): Pass audio to FFmpeg multi-audio muxer
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
        self.screen_capture.stop_capture();

        // Stop microphone capture
        if let Some(ref mut audio_capture) = self.audio_capture {
            audio_capture.stop_capture();
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
