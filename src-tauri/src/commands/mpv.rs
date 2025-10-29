use crate::services::MpvPlayer;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;
use tracing::{error, info};

/// Global MPV player state
pub struct MpvPlayerState(pub Arc<Mutex<Option<MpvPlayer>>>);

/// Response structure for MPV commands
#[derive(Debug, Serialize, Deserialize)]
pub struct MpvResponse {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl MpvResponse {
    fn success(message: impl Into<String>) -> Self {
        Self {
            success: true,
            message: message.into(),
            data: None,
        }
    }

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

/// Initialize MPV player
#[tauri::command]
pub fn mpv_init(state: State<MpvPlayerState>) -> MpvResponse {
    info!("[Command] mpv_init called");

    let mut player = state.0.lock().unwrap();

    match MpvPlayer::new() {
        Ok(mpv) => {
            *player = Some(mpv);
            MpvResponse::success("MPV player initialized successfully")
        }
        Err(e) => {
            error!("[Command] Failed to initialize MPV: {}", e);
            MpvResponse::error(format!("Failed to initialize MPV: {}", e))
        }
    }
}

/// Load a video file
#[tauri::command]
pub fn mpv_load_file(file_path: String, state: State<MpvPlayerState>) -> MpvResponse {
    info!("[Command] mpv_load_file called with path: {}", file_path);

    let player = state.0.lock().unwrap();

    match player.as_ref() {
        Some(mpv) => match mpv.load_file(&file_path) {
            Ok(_) => MpvResponse::success("File loaded successfully"),
            Err(e) => {
                error!("[Command] Failed to load file: {}", e);
                MpvResponse::error(format!("Failed to load file: {}", e))
            }
        },
        None => {
            error!("[Command] MPV player not initialized");
            MpvResponse::error("MPV player not initialized")
        }
    }
}

/// Play the loaded video
#[tauri::command]
pub fn mpv_play(state: State<MpvPlayerState>) -> MpvResponse {
    info!("[Command] mpv_play called");

    let player = state.0.lock().unwrap();

    match player.as_ref() {
        Some(mpv) => match mpv.play() {
            Ok(_) => MpvResponse::success("Playback started"),
            Err(e) => {
                error!("[Command] Failed to start playback: {}", e);
                MpvResponse::error(format!("Failed to start playback: {}", e))
            }
        },
        None => {
            error!("[Command] MPV player not initialized");
            MpvResponse::error("MPV player not initialized")
        }
    }
}

/// Pause playback
#[tauri::command]
pub fn mpv_pause(state: State<MpvPlayerState>) -> MpvResponse {
    info!("[Command] mpv_pause called");

    let player = state.0.lock().unwrap();

    match player.as_ref() {
        Some(mpv) => match mpv.pause() {
            Ok(_) => MpvResponse::success("Playback paused"),
            Err(e) => {
                error!("[Command] Failed to pause playback: {}", e);
                MpvResponse::error(format!("Failed to pause playback: {}", e))
            }
        },
        None => {
            error!("[Command] MPV player not initialized");
            MpvResponse::error("MPV player not initialized")
        }
    }
}

/// Seek to specific time (in seconds)
#[tauri::command]
pub fn mpv_seek(time_seconds: f64, state: State<MpvPlayerState>) -> MpvResponse {
    info!("[Command] mpv_seek called with time: {} seconds", time_seconds);

    let player = state.0.lock().unwrap();

    match player.as_ref() {
        Some(mpv) => match mpv.seek(time_seconds) {
            Ok(_) => MpvResponse::success("Seek completed"),
            Err(e) => {
                error!("[Command] Failed to seek: {}", e);
                MpvResponse::error(format!("Failed to seek: {}", e))
            }
        },
        None => {
            error!("[Command] MPV player not initialized");
            MpvResponse::error("MPV player not initialized")
        }
    }
}

/// Get current playback time (in seconds)
#[tauri::command]
pub fn mpv_get_time(state: State<MpvPlayerState>) -> MpvResponse {
    let player = state.0.lock().unwrap();

    match player.as_ref() {
        Some(mpv) => match mpv.get_time() {
            Ok(time) => MpvResponse::success_with_data(
                "Current time retrieved",
                serde_json::json!({ "time": time }),
            ),
            Err(e) => {
                error!("[Command] Failed to get time: {}", e);
                MpvResponse::error(format!("Failed to get time: {}", e))
            }
        },
        None => {
            error!("[Command] MPV player not initialized");
            MpvResponse::error("MPV player not initialized")
        }
    }
}

/// Get video duration (in seconds)
#[tauri::command]
pub fn mpv_get_duration(state: State<MpvPlayerState>) -> MpvResponse {
    let player = state.0.lock().unwrap();

    match player.as_ref() {
        Some(mpv) => match mpv.get_duration() {
            Ok(duration) => MpvResponse::success_with_data(
                "Duration retrieved",
                serde_json::json!({ "duration": duration }),
            ),
            Err(e) => {
                error!("[Command] Failed to get duration: {}", e);
                MpvResponse::error(format!("Failed to get duration: {}", e))
            }
        },
        None => {
            error!("[Command] MPV player not initialized");
            MpvResponse::error("MPV player not initialized")
        }
    }
}

/// Stop playback and unload file
#[tauri::command]
pub fn mpv_stop(state: State<MpvPlayerState>) -> MpvResponse {
    info!("[Command] mpv_stop called");

    let player = state.0.lock().unwrap();

    match player.as_ref() {
        Some(mpv) => match mpv.stop() {
            Ok(_) => MpvResponse::success("Playback stopped"),
            Err(e) => {
                error!("[Command] Failed to stop playback: {}", e);
                MpvResponse::error(format!("Failed to stop playback: {}", e))
            }
        },
        None => {
            error!("[Command] MPV player not initialized");
            MpvResponse::error("MPV player not initialized")
        }
    }
}

/// Check if video is currently playing
#[tauri::command]
pub fn mpv_is_playing(state: State<MpvPlayerState>) -> MpvResponse {
    let player = state.0.lock().unwrap();

    match player.as_ref() {
        Some(mpv) => match mpv.is_playing() {
            Ok(is_playing) => MpvResponse::success_with_data(
                "Playing state retrieved",
                serde_json::json!({ "is_playing": is_playing }),
            ),
            Err(e) => {
                error!("[Command] Failed to get playing state: {}", e);
                MpvResponse::error(format!("Failed to get playing state: {}", e))
            }
        },
        None => {
            error!("[Command] MPV player not initialized");
            MpvResponse::error("MPV player not initialized")
        }
    }
}

/// Get video dimensions (width and height)
#[tauri::command]
pub fn mpv_get_video_dimensions(state: State<MpvPlayerState>) -> MpvResponse {
    let player = state.0.lock().unwrap();

    match player.as_ref() {
        Some(mpv) => {
            match (mpv.get_width(), mpv.get_height()) {
                (Ok(width), Ok(height)) => MpvResponse::success_with_data(
                    "Video dimensions retrieved",
                    serde_json::json!({ "width": width, "height": height }),
                ),
                (Err(e), _) | (_, Err(e)) => {
                    error!("[Command] Failed to get video dimensions: {}", e);
                    MpvResponse::error(format!("Failed to get video dimensions: {}", e))
                }
            }
        },
        None => {
            error!("[Command] MPV player not initialized");
            MpvResponse::error("MPV player not initialized")
        }
    }
}

/// Capture current video frame as JPEG image
#[tauri::command]
pub fn mpv_capture_frame(state: State<MpvPlayerState>) -> MpvResponse {
    let player = state.0.lock().unwrap();

    match player.as_ref() {
        Some(mpv) => match mpv.capture_frame() {
            Ok(image_data) => {
                // Encode as base64 for transmission
                use base64::{engine::general_purpose, Engine as _};
                let base64_data = general_purpose::STANDARD.encode(&image_data);

                MpvResponse::success_with_data(
                    "Frame captured",
                    serde_json::json!({ "frame": base64_data }),
                )
            },
            Err(e) => {
                error!("[Command] Failed to capture frame: {}", e);
                MpvResponse::error(format!("Failed to capture frame: {}", e))
            }
        },
        None => {
            error!("[Command] MPV player not initialized");
            MpvResponse::error("MPV player not initialized")
        }
    }
}

/// Set volume for current playback (Story 3.9.1/3.10.1)
#[tauri::command]
pub fn mpv_set_volume(volume: f32, muted: bool, state: State<MpvPlayerState>) -> MpvResponse {
    info!("[Command] mpv_set_volume called with volume: {}, muted: {}", volume, muted);

    let player = state.0.lock().unwrap();

    match player.as_ref() {
        Some(mpv) => match mpv.set_volume(volume, muted) {
            Ok(_) => MpvResponse::success("Volume set successfully"),
            Err(e) => {
                error!("[Command] Failed to set volume: {}", e);
                MpvResponse::error(format!("Failed to set volume: {}", e))
            }
        },
        None => {
            error!("[Command] MPV player not initialized");
            MpvResponse::error("MPV player not initialized")
        }
    }
}

/// Apply fade-in and fade-out audio filters (Story 3.10.1)
#[tauri::command]
pub fn mpv_apply_fade_filters(
    fade_in_ms: u64,
    fade_out_ms: u64,
    clip_duration_ms: u64,
    state: State<MpvPlayerState>
) -> MpvResponse {
    info!(
        "[Command] mpv_apply_fade_filters called with fade_in: {}ms, fade_out: {}ms, duration: {}ms",
        fade_in_ms, fade_out_ms, clip_duration_ms
    );

    let player = state.0.lock().unwrap();

    match player.as_ref() {
        Some(mpv) => match mpv.apply_fade_filters(fade_in_ms, fade_out_ms, clip_duration_ms) {
            Ok(_) => MpvResponse::success("Fade filters applied successfully"),
            Err(e) => {
                error!("[Command] Failed to apply fade filters: {}", e);
                MpvResponse::error(format!("Failed to apply fade filters: {}", e))
            }
        },
        None => {
            error!("[Command] MPV player not initialized");
            MpvResponse::error("MPV player not initialized")
        }
    }
}

/// Clear all audio filters (Story 3.10.1)
#[tauri::command]
pub fn mpv_clear_audio_filters(state: State<MpvPlayerState>) -> MpvResponse {
    info!("[Command] mpv_clear_audio_filters called");

    let player = state.0.lock().unwrap();

    match player.as_ref() {
        Some(mpv) => match mpv.clear_audio_filters() {
            Ok(_) => MpvResponse::success("Audio filters cleared successfully"),
            Err(e) => {
                error!("[Command] Failed to clear audio filters: {}", e);
                MpvResponse::error(format!("Failed to clear audio filters: {}", e))
            }
        },
        None => {
            error!("[Command] MPV player not initialized");
            MpvResponse::error("MPV player not initialized")
        }
    }
}
