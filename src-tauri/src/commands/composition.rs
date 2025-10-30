//! Composition commands for multi-track video rendering
//!
//! Provides Tauri commands for the Hybrid Smart Segment Pre-Rendering architecture (ADR-008).
//! Enables frontend to render complex multi-track segments and classify segment types.

use crate::models::timeline::Clip;
use crate::services::segment_renderer::{CanvasSize, Segment, SegmentRenderer, SegmentType, VideoLayer};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;
use tracing::{debug, error, info};

/// Global segment renderer state
pub struct SegmentRendererState(pub Arc<Mutex<SegmentRenderer>>);

/// Response structure for composition commands
#[derive(Debug, Serialize, Deserialize)]
pub struct CompositionResponse {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl CompositionResponse {
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

/// Active clip representation (from composition store)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveClip {
    pub clip: Clip,
    pub track_id: String,
    pub track_number: u32,
    pub track_type: String, // "video" or "audio"
}

/// Render a multi-track segment to cache
///
/// # Arguments
///
/// * `active_clips` - Currently active clips at the playhead position
/// * `start_time` - Segment start time in milliseconds
/// * `duration` - Segment duration in milliseconds
///
/// # Returns
///
/// Path to the rendered segment file in cache
#[tauri::command]
pub fn cmd_render_segment(
    active_clips: Vec<ActiveClip>,
    start_time: u64,
    duration: u64,
    state: State<SegmentRendererState>,
) -> CompositionResponse {
    info!(
        "[Command] cmd_render_segment called with {} active clips, start_time: {}ms, duration: {}ms",
        active_clips.len(),
        start_time,
        duration
    );

    // Filter for video clips only
    let video_clips: Vec<&ActiveClip> = active_clips
        .iter()
        .filter(|ac| ac.track_type == "video")
        .collect();

    if video_clips.is_empty() {
        error!("[Command] No video clips provided for segment rendering");
        return CompositionResponse::error("No video clips to render");
    }

    debug!("[Command] Rendering {} video layers", video_clips.len());

    // Build video layers from active clips
    let mut video_layers: Vec<VideoLayer> = video_clips
        .iter()
        .map(|ac| VideoLayer {
            clip: ac.clip.clone(),
            track_number: ac.track_number,
            z_index: ac.track_number, // Track 1 = bottom, Track N = top
        })
        .collect();

    // Sort by z-index (bottom to top)
    video_layers.sort_by_key(|layer| layer.z_index);

    // Create segment
    let segment = Segment {
        video_layers,
        start_time,
        duration,
        canvas_size: CanvasSize::default(), // 1920x1080
    };

    // Render segment using SegmentRenderer
    let renderer = state.0.lock().unwrap();
    match renderer.render_segment(&segment) {
        Ok(output_path) => {
            info!(
                "[Command] Segment rendered successfully: {}",
                output_path.display()
            );
            CompositionResponse::success_with_data(
                "Segment rendered successfully",
                serde_json::json!({
                    "output_path": output_path.to_string_lossy(),
                }),
            )
        }
        Err(e) => {
            error!("[Command] Failed to render segment: {}", e);
            CompositionResponse::error(format!("Failed to render segment: {}", e))
        }
    }
}

/// Classify segment type (Simple vs Complex) based on active clips
///
/// # Arguments
///
/// * `active_clips` - Currently active clips at the playhead position
///
/// # Returns
///
/// Segment type: "simple" for single-track, "complex" for multi-track
#[tauri::command]
pub fn cmd_classify_segment_type(active_clips: Vec<ActiveClip>) -> CompositionResponse {
    debug!("[Command] cmd_classify_segment_type called with {} active clips", active_clips.len());

    // Count active video tracks
    let video_track_count = active_clips
        .iter()
        .filter(|ac| ac.track_type == "video")
        .map(|ac| ac.track_id.clone())
        .collect::<std::collections::HashSet<_>>()
        .len();

    let segment_type = if video_track_count <= 1 {
        SegmentType::Simple
    } else {
        SegmentType::Complex
    };

    debug!("[Command] Segment classified as: {:?} ({} video tracks)", segment_type, video_track_count);

    CompositionResponse::success_with_data(
        "Segment type classified",
        serde_json::json!({
            "segment_type": match segment_type {
                SegmentType::Simple => "simple",
                SegmentType::Complex => "complex",
            },
            "video_track_count": video_track_count,
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_single_track_as_simple() {
        let active_clips = vec![ActiveClip {
            clip: Clip {
                id: "clip1".to_string(),
                file_path: "/path/to/video.mp4".to_string(),
                start_time: 0,
                duration: 5000,
                trim_in: 0,
                trim_out: 5000,
                fade_in: None,
                fade_out: None,
                volume: None,
                muted: None,
                audio_tracks: None,
                transform: None,
            },
            track_id: "track1".to_string(),
            track_number: 1,
            track_type: "video".to_string(),
        }];

        let response = cmd_classify_segment_type(active_clips);
        assert!(response.success);
        assert_eq!(
            response.data.unwrap()["segment_type"].as_str().unwrap(),
            "simple"
        );
    }

    #[test]
    fn test_classify_multi_track_as_complex() {
        let active_clips = vec![
            ActiveClip {
                clip: Clip {
                    id: "clip1".to_string(),
                    file_path: "/path/to/video1.mp4".to_string(),
                    start_time: 0,
                    duration: 5000,
                    trim_in: 0,
                    trim_out: 5000,
                    fade_in: None,
                    fade_out: None,
                    volume: None,
                    muted: None,
                    audio_tracks: None,
                    transform: None,
                },
                track_id: "track1".to_string(),
                track_number: 1,
                track_type: "video".to_string(),
            },
            ActiveClip {
                clip: Clip {
                    id: "clip2".to_string(),
                    file_path: "/path/to/video2.mp4".to_string(),
                    start_time: 0,
                    duration: 5000,
                    trim_in: 0,
                    trim_out: 5000,
                    fade_in: None,
                    fade_out: None,
                    volume: None,
                    muted: None,
                    audio_tracks: None,
                    transform: None,
                },
                track_id: "track2".to_string(),
                track_number: 2,
                track_type: "video".to_string(),
            },
        ];

        let response = cmd_classify_segment_type(active_clips);
        assert!(response.success);
        assert_eq!(
            response.data.unwrap()["segment_type"].as_str().unwrap(),
            "complex"
        );
    }
}
