//! Camera backend abstraction for both AVFoundation and nokhwa
//!
//! This module provides a unified interface for camera capture that can use either
//! native AVFoundation (macOS) or nokhwa (cross-platform).

use crate::services::ffmpeg::TimestampedFrame;
use anyhow::Result;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

/// Unified camera backend that wraps platform-specific implementations
pub enum CameraBackend {
    #[cfg(target_os = "macos")]
    AVFoundation(crate::services::camera::avfoundation_camera::AVCameraCapture),
    Nokhwa(crate::services::camera::CameraCapture),
}

impl CameraBackend {
    /// Create a new camera backend for the specified camera
    pub async fn new(camera_index: u32, width: u32, height: u32) -> Result<Self> {
        #[cfg(target_os = "macos")]
        {
            // Try AVFoundation first on macOS
            match crate::services::camera::avfoundation_camera::AVCameraCapture::new(
                camera_index,
                width,
                height,
                30,
            ) {
                Ok(av_camera) => {
                    tracing::info!("Using AVFoundation camera backend for 30 FPS capture");
                    return Ok(CameraBackend::AVFoundation(av_camera));
                }
                Err(e) => {
                    tracing::warn!("Failed to initialize AVFoundation, falling back to nokhwa: {}", e);
                }
            }
        }

        // Fallback to nokhwa
        let mut camera = crate::services::camera::CameraCapture::new(camera_index)?;
        camera.set_target_resolution(width, height);
        tracing::info!("Using nokhwa camera backend");
        Ok(CameraBackend::Nokhwa(camera))
    }

    /// Start continuous capture with the given frame channel
    pub fn start_continuous_capture(
        &mut self,
        frame_tx: mpsc::Sender<TimestampedFrame>,
    ) -> Result<JoinHandle<()>> {
        match self {
            #[cfg(target_os = "macos")]
            CameraBackend::AVFoundation(av_camera) => {
                av_camera.start_continuous_capture(frame_tx)
                    .map_err(|e| anyhow::anyhow!("AVFoundation capture failed: {}", e))
            }
            CameraBackend::Nokhwa(camera) => {
                camera.start_continuous_capture(frame_tx)
                    .map_err(|e| anyhow::anyhow!("Nokhwa capture failed: {}", e))
            }
            #[cfg(not(target_os = "macos"))]
            _ => unreachable!(),
        }
    }

    /// Stop camera capture
    pub fn stop_capture(&mut self) {
        match self {
            #[cfg(target_os = "macos")]
            CameraBackend::AVFoundation(av_camera) => {
                av_camera.stop_capture();
            }
            CameraBackend::Nokhwa(camera) => {
                camera.stop_capture();
            }
            #[cfg(not(target_os = "macos"))]
            _ => unreachable!(),
        }
    }
}