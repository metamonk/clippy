//! Camera Service Module
//!
//! This module provides webcam capture capabilities using either:
//! - Native AVFoundation on macOS (recommended for 30 FPS performance)
//! - nokhwa cross-platform library (legacy, limited to 2-3 FPS)

pub mod avfoundation_camera;
pub mod camera_backend;
mod nokhwa_wrapper;

pub use camera_backend::CameraBackend;
pub use nokhwa_wrapper::{CameraCapture, CameraError, CameraInfo, CameraService};
