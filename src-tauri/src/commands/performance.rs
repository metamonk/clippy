use crate::services::performance_monitor::{FpsCounter, PerformanceMetrics};
use crate::services::segment_preloader::SegmentPreloader;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use tauri::State;
use tokio::sync::Mutex as TokioMutex;
use tracing::{debug, info};

/// Global FPS counter state
pub struct FpsCounterState(pub Arc<StdMutex<FpsCounter>>);

/// Global segment preloader state (Story 5.8 Task 2)
pub struct SegmentPreloaderState(pub Arc<TokioMutex<SegmentPreloader>>);

/// Response structure for performance commands
#[derive(Debug, Serialize, Deserialize)]
pub struct PerformanceResponse {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl PerformanceResponse {
    fn success_with_data(message: impl Into<String>, data: serde_json::Value) -> Self {
        Self {
            success: true,
            message: message.into(),
            data: Some(data),
        }
    }

    fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            message: message.into(),
            data: None,
        }
    }
}

/// Get current playback FPS metrics
///
/// Returns current FPS, average FPS, total frames, and uptime.
/// This command should be called from the frontend to display FPS overlay.
#[tauri::command]
pub fn get_playback_fps(state: State<FpsCounterState>) -> PerformanceResponse {
    debug!("[Command] get_playback_fps called");

    let counter = state.0.lock().unwrap();
    let metrics = PerformanceMetrics::from_counter(&counter);

    match serde_json::to_value(&metrics) {
        Ok(data) => {
            PerformanceResponse::success_with_data("Performance metrics retrieved", data)
        }
        Err(e) => {
            PerformanceResponse::error(format!("Failed to serialize metrics: {}", e))
        }
    }
}

/// Record a frame for FPS tracking
///
/// This should be called from the playback loop whenever a frame is rendered.
/// Internal command - not exposed to frontend directly.
#[tauri::command]
pub fn record_playback_frame(state: State<FpsCounterState>) -> PerformanceResponse {
    let mut counter = state.0.lock().unwrap();
    counter.record_frame();

    PerformanceResponse {
        success: true,
        message: "Frame recorded".into(),
        data: None,
    }
}

/// Reset FPS counter
///
/// Clears all recorded frames and resets counters.
/// Useful when starting a new playback session.
#[tauri::command]
pub fn reset_fps_counter(state: State<FpsCounterState>) -> PerformanceResponse {
    info!("[Command] reset_fps_counter called");

    let mut counter = state.0.lock().unwrap();
    counter.reset();

    PerformanceResponse {
        success: true,
        message: "FPS counter reset successfully".into(),
        data: None,
    }
}

/// Get decode-ahead buffer status (Story 5.8 Task 2 - Subtask 2.4)
///
/// Returns buffer monitoring metrics:
/// - segments_in_queue: Number of segments waiting to be rendered
/// - segments_cached: Number of segments cached and ready
/// - cache_hit_rate: Percentage of cache hits (0.0 to 1.0)
/// - rendering_segment: Currently rendering segment ID (if any)
/// - is_rendering: Whether background rendering is active
#[tauri::command]
pub async fn get_buffer_status(state: State<'_, SegmentPreloaderState>) -> Result<PerformanceResponse, String> {
    debug!("[Command] get_buffer_status called");

    let preloader = state.0.lock().await;
    let buffer_status = preloader.get_buffer_status().await;

    match serde_json::to_value(&buffer_status) {
        Ok(data) => {
            Ok(PerformanceResponse::success_with_data(
                "Buffer status retrieved",
                data,
            ))
        }
        Err(e) => {
            Ok(PerformanceResponse::error(format!(
                "Failed to serialize buffer status: {}",
                e
            )))
        }
    }
}
