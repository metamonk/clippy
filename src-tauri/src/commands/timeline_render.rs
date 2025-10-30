//! Timeline rendering commands for Full Timeline Pre-Render architecture
//!
//! Provides Tauri commands for rendering complete timelines with progress updates.
//! This replaces the Hybrid Smart Segment Pre-Rendering approach with a simpler
//! full timeline pre-render architecture.

use crate::models::timeline::Timeline;
use crate::services::timeline_renderer::TimelineRenderer;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tracing::{debug, error, info};

/// Global timeline renderer state
pub struct TimelineRendererState(pub Arc<Mutex<TimelineRenderer>>);

/// Response structure for timeline rendering commands
#[derive(Debug, Serialize, Deserialize)]
pub struct TimelineRenderResponse {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl TimelineRenderResponse {
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

/// Progress event payload sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderProgressEvent {
    /// Progress as a percentage (0-100)
    pub progress: f64,
    /// Human-readable status message
    pub status: String,
}

/// Render timeline to cache with progress updates
///
/// This command renders the entire timeline to a single MP4 file in the cache directory.
/// Progress updates are sent to the frontend via Tauri events.
///
/// # Arguments
///
/// * `timeline` - Timeline to render
///
/// # Returns
///
/// Path to the rendered timeline file in cache
///
/// # Events
///
/// Emits `timeline-render-progress` events with progress percentage (0-100)
#[tauri::command]
pub async fn cmd_render_timeline(
    timeline: Timeline,
    app: AppHandle,
    state: State<'_, TimelineRendererState>,
) -> Result<TimelineRenderResponse, String> {
    info!(
        "[Command] cmd_render_timeline called for timeline with duration: {}ms",
        timeline.total_duration
    );

    // Validate timeline has video tracks
    let video_track_count = timeline.video_tracks().count();
    if video_track_count == 0 {
        error!("[Command] Timeline has no video tracks");
        return Ok(TimelineRenderResponse::error("Timeline has no video tracks"));
    }

    debug!(
        "[Command] Timeline has {} video tracks, total duration: {}ms",
        video_track_count,
        timeline.total_duration
    );

    // Create progress callback that emits Tauri events
    let app_handle = app.clone();
    let progress_callback = Arc::new(Mutex::new(move |progress: f64| {
        let progress_percent = (progress * 100.0).round();

        let status = if progress_percent < 100.0 {
            format!("Rendering timeline... {}%", progress_percent)
        } else {
            "Rendering complete".to_string()
        };

        let event = RenderProgressEvent {
            progress: progress_percent,
            status,
        };

        // Emit progress event to frontend
        if let Err(e) = app_handle.emit("timeline-render-progress", &event) {
            error!("[Command] Failed to emit progress event: {}", e);
        }
    }));

    // Render timeline
    let renderer = state.0.lock().unwrap();
    match renderer.render_timeline(&timeline, Some(progress_callback)) {
        Ok(output_path) => {
            info!(
                "[Command] Timeline rendered successfully: {}",
                output_path.display()
            );
            Ok(TimelineRenderResponse::success_with_data(
                "Timeline rendered successfully",
                serde_json::json!({
                    "output_path": output_path.to_string_lossy(),
                    "duration": timeline.total_duration,
                }),
            ))
        }
        Err(e) => {
            error!("[Command] Failed to render timeline: {}", e);
            Ok(TimelineRenderResponse::error(format!(
                "Failed to render timeline: {}",
                e
            )))
        }
    }
}

/// Clear all cached timeline files
///
/// This command removes all pre-rendered timeline files from the cache directory.
/// Useful for freeing disk space or forcing a fresh render.
#[tauri::command]
pub fn cmd_clear_timeline_cache(
    state: State<TimelineRendererState>,
) -> TimelineRenderResponse {
    info!("[Command] cmd_clear_timeline_cache called");

    let renderer = state.0.lock().unwrap();
    match renderer.clear_cache() {
        Ok(()) => {
            info!("[Command] Timeline cache cleared successfully");
            TimelineRenderResponse::success_with_data(
                "Timeline cache cleared",
                serde_json::json!({
                    "cleared": true
                }),
            )
        }
        Err(e) => {
            error!("[Command] Failed to clear timeline cache: {}", e);
            TimelineRenderResponse::error(format!("Failed to clear cache: {}", e))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_progress_event_serialization() {
        let event = RenderProgressEvent {
            progress: 45.5,
            status: "Rendering timeline... 45%".to_string(),
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("45.5"));
        assert!(json.contains("Rendering timeline... 45%"));
    }
}
