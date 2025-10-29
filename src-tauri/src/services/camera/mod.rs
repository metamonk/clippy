//! Camera Service Module
//!
//! This module provides webcam capture capabilities using the nokhwa crate
//! with AVFoundation backend on macOS.

mod nokhwa_wrapper;

pub use nokhwa_wrapper::{CameraCapture, CameraError, CameraInfo, CameraService};
