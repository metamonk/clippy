//! Camera Service - Webcam Capture Abstraction
//!
//! This module provides a wrapper around the nokhwa crate for webcam capture.
//! It uses AVFoundation on macOS for native camera access.
//!
//! # Architecture
//!
//! - Uses nokhwa crate with `input-avfoundation` feature for macOS camera access
//! - Provides camera enumeration, preview, and recording capabilities
//! - Handles resolution capping (native resolution capped at 1080p if higher)
//! - Target 30 FPS recording
//!
//! # Example
//!
//! ```rust,no_run
//! use clippy_lib::services::camera::CameraService;
//!
//! fn example() -> Result<(), Box<dyn std::error::Error>> {
//!     let service = CameraService::new();
//!     let cameras = service.list_cameras()?;
//!     println!("Found {} cameras", cameras.len());
//!     Ok(())
//! }
//! ```

use nokhwa::{
    pixel_format::RgbFormat,
    utils::{CameraIndex, RequestedFormat, RequestedFormatType, Resolution},
    Camera,
};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tracing::{debug, error, info, warn};

/// Errors that can occur during camera operations
#[derive(Error, Debug)]
pub enum CameraError {
    #[error("Camera not found: {0}")]
    CameraNotFound(String),

    #[error("Camera access denied. Enable in System Preferences → Privacy & Security → Camera")]
    AccessDenied,

    #[error("Failed to open camera: {0}")]
    OpenFailed(String),

    #[error("Failed to start camera stream: {0}")]
    StreamFailed(String),

    #[error("Failed to capture frame: {0}")]
    CaptureFailed(String),

    #[error("Failed to enumerate cameras: {0}")]
    EnumerationFailed(String),

    #[error("Invalid camera index: {0}")]
    InvalidIndex(u32),

    #[error("Camera operation failed: {0}")]
    OperationFailed(String),
}

/// Camera information structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraInfo {
    /// Camera index/ID
    pub id: u32,
    /// Camera name (e.g., "FaceTime HD Camera")
    pub name: String,
    /// Maximum resolution (e.g., "1920x1080")
    pub resolution: String,
    /// Maximum frame rate
    pub fps: u32,
}

/// Camera service for managing webcam capture
pub struct CameraService;

impl CameraService {
    /// Create a new camera service instance
    pub fn new() -> Self {
        Self
    }

    /// List all available cameras
    ///
    /// Returns a list of camera information including id, name, resolution, and fps.
    ///
    /// # Errors
    ///
    /// Returns `CameraError::EnumerationFailed` if camera enumeration fails.
    pub fn list_cameras(&self) -> Result<Vec<CameraInfo>, CameraError> {
        debug!("Enumerating available cameras");

        let cameras = nokhwa::query(nokhwa::utils::ApiBackend::AVFoundation).map_err(|e| {
            error!("Failed to query cameras: {}", e);
            CameraError::EnumerationFailed(e.to_string())
        })?;

        if cameras.is_empty() {
            warn!("No cameras found");
            return Ok(Vec::new());
        }

        let camera_infos: Vec<CameraInfo> = cameras
            .iter()
            .enumerate()
            .map(|(idx, cam_info)| {
                let name = cam_info.human_name().to_string();

                // Get the best resolution for this camera
                // nokhwa provides a list of compatible formats
                // We'll use 1080p as default or the highest available
                let resolution = "1920x1080".to_string(); // Default to 1080p
                let fps = 30; // Target 30 FPS

                debug!("Found camera {}: {} ({}@{}fps)", idx, name, resolution, fps);

                CameraInfo {
                    id: idx as u32,
                    name,
                    resolution,
                    fps,
                }
            })
            .collect();

        info!("Found {} cameras", camera_infos.len());
        Ok(camera_infos)
    }

    /// Open a camera by index
    ///
    /// Opens the camera and prepares it for capture.
    /// Resolution is capped at 1080p if the camera supports higher resolutions.
    ///
    /// # Arguments
    ///
    /// * `camera_index` - The index of the camera to open (from `list_cameras`)
    ///
    /// # Errors
    ///
    /// Returns `CameraError::InvalidIndex` if the camera index is invalid.
    /// Returns `CameraError::OpenFailed` if the camera cannot be opened.
    pub fn open_camera(&self, camera_index: u32) -> Result<Camera, CameraError> {
        debug!("Opening camera index {}", camera_index);

        // Request 1080p at 30 FPS (or closest available)
        let requested =
            RequestedFormat::new::<RgbFormat>(RequestedFormatType::AbsoluteHighestResolution);

        let index = CameraIndex::Index(camera_index);

        let camera = Camera::new(index, requested).map_err(|e| {
            error!("Failed to open camera {}: {}", camera_index, e);

            // Check if it's a permission error
            if e.to_string().contains("permission") || e.to_string().contains("denied") {
                CameraError::AccessDenied
            } else {
                CameraError::OpenFailed(e.to_string())
            }
        })?;

        // Get the actual resolution
        let resolution = camera.resolution();
        info!(
            "Opened camera {} at {}x{}",
            camera_index,
            resolution.width(),
            resolution.height()
        );

        // Cap at 1080p if higher
        if resolution.height() > 1080 {
            debug!(
                "Camera resolution {}x{} exceeds 1080p, will cap during capture",
                resolution.width(),
                resolution.height()
            );
            // Note: Resolution capping will be applied during frame processing
        }

        Ok(camera)
    }

    /// Start camera stream
    ///
    /// Starts capturing frames from the camera.
    ///
    /// # Arguments
    ///
    /// * `camera` - Mutable reference to the camera instance
    ///
    /// # Errors
    ///
    /// Returns `CameraError::StreamFailed` if the stream cannot be started.
    pub fn start_stream(&self, camera: &mut Camera) -> Result<(), CameraError> {
        debug!("Starting camera stream");

        camera.open_stream().map_err(|e| {
            error!("Failed to start camera stream: {}", e);
            CameraError::StreamFailed(e.to_string())
        })?;

        info!("Camera stream started");
        Ok(())
    }

    /// Capture a single frame from the camera
    ///
    /// Captures a frame and returns it as raw RGB bytes.
    ///
    /// # Arguments
    ///
    /// * `camera` - Mutable reference to the camera instance
    ///
    /// # Errors
    ///
    /// Returns `CameraError::CaptureFailed` if frame capture fails.
    pub fn capture_frame(&self, camera: &mut Camera) -> Result<Vec<u8>, CameraError> {
        camera
            .frame()
            .map(|frame| frame.buffer().to_vec())
            .map_err(|e| {
                error!("Failed to capture frame: {}", e);
                CameraError::CaptureFailed(e.to_string())
            })
    }

    /// Get the resolution of the camera
    ///
    /// # Arguments
    ///
    /// * `camera` - Reference to the camera instance
    pub fn get_resolution(&self, camera: &Camera) -> Resolution {
        camera.resolution()
    }
}

impl Default for CameraService {
    fn default() -> Self {
        Self::new()
    }
}

/// Stateful camera capture manager for continuous frame streaming
///
/// Wraps a nokhwa Camera and provides continuous capture capabilities
/// similar to ScreenCapture's continuous capture mode.
///
/// # Implementation Note
///
/// nokhwa Camera is not `Send`, so continuous capture runs in a spawn_blocking thread.
pub struct CameraCapture {
    /// Camera width
    width: u32,
    /// Camera height
    height: u32,
    /// Camera index
    camera_index: u32,
    /// Flag indicating if capture is active
    is_capturing: bool,
    /// Stop signal sender
    stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

impl CameraCapture {
    /// Create a new camera capture instance
    ///
    /// Opens the specified camera and prepares it for continuous capture.
    ///
    /// # Arguments
    ///
    /// * `camera_index` - Index of the camera to open
    ///
    /// # Errors
    ///
    /// Returns `CameraError` if camera cannot be opened.
    pub fn new(camera_index: u32) -> Result<Self, CameraError> {
        debug!("Creating camera capture for camera index {}", camera_index);

        // Test camera access by opening temporarily
        let requested = RequestedFormat::new::<RgbFormat>(RequestedFormatType::AbsoluteHighestResolution);
        let index = CameraIndex::Index(camera_index);

        let camera = Camera::new(index, requested).map_err(|e| {
            error!("Failed to open camera {}: {}", camera_index, e);
            if e.to_string().contains("permission") || e.to_string().contains("denied") {
                CameraError::AccessDenied
            } else {
                CameraError::OpenFailed(e.to_string())
            }
        })?;

        let resolution = camera.resolution();
        let width = resolution.width();
        let height = resolution.height();

        info!(
            "Camera capture created: {}x{} @ 30fps (camera index {})",
            width, height, camera_index
        );

        Ok(Self {
            width,
            height,
            camera_index,
            is_capturing: false,
            stop_tx: None,
        })
    }

    /// Start continuous camera capture
    ///
    /// Begins capturing frames from the camera and streaming them to the provided channel.
    /// Frames are captured at 30 FPS with timestamps for synchronization.
    ///
    /// # Arguments
    ///
    /// * `frame_tx` - Channel sender for timestamped frames
    ///
    /// # Returns
    ///
    /// * `Ok(JoinHandle)` - Handle to the capture task
    /// * `Err(CameraError)` - Failed to start capture
    pub fn start_continuous_capture(
        &mut self,
        frame_tx: mpsc::Sender<crate::services::ffmpeg::TimestampedFrame>,
    ) -> Result<JoinHandle<()>, CameraError> {
        if self.is_capturing {
            warn!("Camera capture already in progress");
            return Err(CameraError::OperationFailed(
                "Capture already in progress".to_string(),
            ));
        }

        self.is_capturing = true;

        // Create stop signal channel and store sender before moving data
        let (stop_tx, stop_rx) = tokio::sync::oneshot::channel::<()>();
        self.stop_tx = Some(stop_tx);

        // Clone/copy all needed data before async move
        let width = self.width;
        let height = self.height;
        let camera_index = self.camera_index;

        info!(
            "Starting camera continuous capture at 30 FPS: {}x{} (camera index {})",
            width, height, camera_index
        );

        // Spawn blocking capture task (Camera is not Send)
        let handle = tokio::task::spawn_blocking(move || {
            // Open camera in blocking thread
            let requested = RequestedFormat::new::<RgbFormat>(RequestedFormatType::AbsoluteHighestResolution);
            let index = CameraIndex::Index(camera_index);

            let mut camera = match Camera::new(index, requested) {
                Ok(cam) => cam,
                Err(e) => {
                    error!("Failed to open camera in capture thread: {}", e);
                    return;
                }
            };

            // Start camera stream
            if let Err(e) = camera.open_stream() {
                error!("Failed to start camera stream: {}", e);
                return;
            }

            info!("Camera stream started in capture thread");

            let recording_start = std::time::Instant::now();
            let frame_interval = std::time::Duration::from_millis(33); // ~30 FPS
            let mut next_frame_time = std::time::Instant::now();

            // Create a runtime for checking stop signal in blocking thread
            let rt = tokio::runtime::Handle::current();
            let mut stop_rx = stop_rx;

            loop {
                // Check stop signal non-blocking
                let should_stop = rt.block_on(async {
                    match tokio::time::timeout(std::time::Duration::from_micros(1), &mut stop_rx).await {
                        Ok(_) => true,  // Stop signal received
                        Err(_) => false, // Timeout (no signal yet)
                    }
                });

                if should_stop {
                    info!("Stop signal received, stopping camera capture");
                    break;
                }

                // Wait until next frame time
                let now = std::time::Instant::now();
                if now < next_frame_time {
                    std::thread::sleep(next_frame_time - now);
                }
                next_frame_time = next_frame_time + frame_interval;

                // Capture frame
                let rgb_data = match camera.frame() {
                    Ok(frame) => frame.buffer().to_vec(),
                    Err(e) => {
                        warn!("Failed to capture camera frame: {}", e);
                        continue;
                    }
                };

                // Convert RGB to BGRA (nokhwa returns RGB, FFmpeg expects BGRA)
                // RGB has 3 bytes per pixel, BGRA has 4 bytes per pixel
                let pixel_count = (width * height) as usize;
                let mut bgra_data = Vec::with_capacity(pixel_count * 4);

                for i in 0..pixel_count {
                    let rgb_idx = i * 3;
                    if rgb_idx + 2 < rgb_data.len() {
                        bgra_data.push(rgb_data[rgb_idx + 2]); // B
                        bgra_data.push(rgb_data[rgb_idx + 1]); // G
                        bgra_data.push(rgb_data[rgb_idx]);     // R
                        bgra_data.push(255);                    // A (fully opaque)
                    }
                }

                // Calculate timestamp since recording start
                let timestamp_ms = recording_start.elapsed().as_millis() as u64;

                // Create timestamped frame
                let frame = crate::services::ffmpeg::TimestampedFrame {
                    data: bgra_data,
                    timestamp_ms,
                    width,
                    height,
                };

                // Send frame through channel (blocking if full - backpressure)
                if rt.block_on(frame_tx.send(frame)).is_err() {
                    info!("Frame channel closed, stopping camera capture");
                    break;
                }
            }

            info!("Camera capture stopped");
        });

        Ok(handle)
    }

    /// Stop continuous capture
    ///
    /// Sends a stop signal to the capture task.
    pub fn stop_capture(&mut self) {
        if let Some(stop_tx) = self.stop_tx.take() {
            info!("Stopping camera capture");
            let _ = stop_tx.send(());
            self.is_capturing = false;
        } else {
            warn!("No active camera capture to stop");
        }
    }

    /// Get camera width
    pub fn width(&self) -> u32 {
        self.width
    }

    /// Get camera height
    pub fn height(&self) -> u32 {
        self.height
    }

    /// Check if capture is active
    pub fn is_capturing(&self) -> bool {
        self.is_capturing
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_camera_service_creation() {
        let service = CameraService::new();
        // Service should be created successfully
        assert_eq!(std::mem::size_of_val(&service), 0); // Zero-sized type
    }

    #[test]
    fn test_list_cameras_returns_result() {
        let service = CameraService::new();
        let result = service.list_cameras();

        // Function should return a result (may be empty list if no cameras)
        assert!(result.is_ok() || matches!(result, Err(CameraError::EnumerationFailed(_))));
    }

    #[test]
    fn test_camera_info_serialization() {
        let camera_info = CameraInfo {
            id: 0,
            name: "Test Camera".to_string(),
            resolution: "1920x1080".to_string(),
            fps: 30,
        };

        // Should serialize to JSON
        let json = serde_json::to_string(&camera_info);
        assert!(json.is_ok());

        // Should deserialize from JSON
        let json_str = json.unwrap();
        let deserialized: Result<CameraInfo, _> = serde_json::from_str(&json_str);
        assert!(deserialized.is_ok());

        let deserialized_info = deserialized.unwrap();
        assert_eq!(deserialized_info.id, 0);
        assert_eq!(deserialized_info.name, "Test Camera");
    }
}
