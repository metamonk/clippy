pub mod commands;
pub mod models;
pub mod services;
pub mod utils;

// Test utilities for parity validation (Story 5.7)
// Available in both test and production builds for use in integration tests
pub mod test_utils;

use std::fs;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use commands::{
    cmd_import_media,
    cmd_start_export,
    cmd_get_export_progress,
    cmd_cancel_export,
    mpv_init,
    mpv_load_file,
    mpv_play,
    mpv_pause,
    mpv_seek,
    mpv_get_time,
    mpv_get_duration,
    mpv_stop,
    mpv_is_playing,
    mpv_get_video_dimensions,
    mpv_capture_frame,
    mpv_set_volume,
    mpv_apply_fade_filters,
    mpv_clear_audio_filters,
    cmd_check_screen_recording_permission,
    cmd_request_screen_recording_permission,
    cmd_check_camera_permission,
    cmd_request_camera_permission,
    cmd_list_cameras,
    cmd_start_camera_preview,
    cmd_stop_camera_preview,
    cmd_start_webcam_recording,
    cmd_stop_webcam_recording,
    cmd_start_screen_recording,
    cmd_start_pip_recording,
    cmd_stop_pip_recording,
    cmd_stop_recording,
    cmd_pause_recording,
    cmd_resume_recording,
    cmd_cancel_recording,
    cmd_check_disk_space,
    cmd_send_recording_notification,
    cmd_get_home_dir,
    cmd_get_available_windows,
    get_playback_fps,
    record_playback_frame,
    reset_fps_counter,
    get_buffer_status,
    cmd_render_segment,
    cmd_classify_segment_type,
    cmd_render_timeline,
    cmd_clear_timeline_cache,
};

/// Initialize logging system with file output to ~/Library/Logs/clippy/app.log
fn init_logging() -> anyhow::Result<()> {
    let log_dir = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("Could not determine home directory"))?
        .join("Library")
        .join("Logs")
        .join("clippy");

    // Create log directory if it doesn't exist
    fs::create_dir_all(&log_dir)?;

    let log_file = log_dir.join("app.log");
    let file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)?;

    let file_layer = fmt::layer()
        .with_writer(file)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(true);

    let stdout_layer = fmt::layer()
        .with_writer(std::io::stdout)
        .with_target(false);

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(file_layer)
        .with(stdout_layer)
        .init();

    tracing::info!(
        event = "logging_initialized",
        log_file = ?log_file,
        "Logging system initialized"
    );

    Ok(())
}

/// Initialize FFmpeg by downloading binaries if needed
fn init_ffmpeg() -> anyhow::Result<()> {
    tracing::info!(event = "ffmpeg_init_start", "Initializing FFmpeg");

    ffmpeg_sidecar::download::auto_download()
        .map_err(|e| anyhow::anyhow!("Failed to initialize FFmpeg: {}", e))?;

    tracing::info!(event = "ffmpeg_init_success", "FFmpeg initialized successfully");
    Ok(())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    tracing::info!(event = "greet_command", name = name, "Greet command invoked");
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging first
    if let Err(e) = init_logging() {
        eprintln!("Failed to initialize logging: {}", e);
    }

    // Initialize FFmpeg
    if let Err(e) = init_ffmpeg() {
        tracing::error!(error = %e, "Failed to initialize FFmpeg");
        eprintln!("Warning: FFmpeg initialization failed: {}", e);
    }

    tracing::info!(
        event = "app_startup",
        version = env!("CARGO_PKG_VERSION"),
        "Application starting"
    );

    // Initialize cache directories (Story 5.8 Task 2)
    let cache_base_dir = dirs::home_dir()
        .expect("Could not determine home directory")
        .join("Library")
        .join("Caches")
        .join("com.clippy.app");

    // Segment cache for hybrid pre-rendering (old approach)
    let segment_cache_dir = cache_base_dir.join("segments");
    if let Err(e) = fs::create_dir_all(&segment_cache_dir) {
        tracing::warn!(error = %e, "Failed to create segment cache directory");
    } else {
        tracing::info!(cache_dir = ?segment_cache_dir, "Segment cache directory initialized");
    }

    // Timeline cache for full timeline pre-rendering (new approach)
    let timeline_cache_dir = cache_base_dir.join("timelines");
    if let Err(e) = fs::create_dir_all(&timeline_cache_dir) {
        tracing::warn!(error = %e, "Failed to create timeline cache directory");
    } else {
        tracing::info!(cache_dir = ?timeline_cache_dir, "Timeline cache directory initialized");
    }

    // Initialize renderers
    let segment_renderer = services::SegmentRenderer::new(segment_cache_dir.clone());
    let timeline_renderer = services::TimelineRenderer::new(timeline_cache_dir.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::ExportState::new())
        .manage(commands::MpvPlayerState(std::sync::Arc::new(std::sync::Mutex::new(None))))
        .manage(commands::FpsCounterState(std::sync::Arc::new(std::sync::Mutex::new(services::FpsCounter::new()))))
        .manage(commands::SegmentPreloaderState(std::sync::Arc::new(tokio::sync::Mutex::new(services::SegmentPreloader::new(segment_cache_dir)))))
        .manage(commands::SegmentRendererState(std::sync::Arc::new(std::sync::Mutex::new(segment_renderer))))
        .manage(commands::TimelineRendererState(std::sync::Arc::new(std::sync::Mutex::new(timeline_renderer))))
        .invoke_handler(tauri::generate_handler![
            greet,
            cmd_import_media,
            cmd_start_export,
            cmd_get_export_progress,
            cmd_cancel_export,
            mpv_init,
            mpv_load_file,
            mpv_play,
            mpv_pause,
            mpv_seek,
            mpv_get_time,
            mpv_get_duration,
            mpv_stop,
            mpv_is_playing,
            mpv_get_video_dimensions,
            mpv_capture_frame,
            mpv_set_volume,
            mpv_apply_fade_filters,
            mpv_clear_audio_filters,
            cmd_check_screen_recording_permission,
            cmd_request_screen_recording_permission,
            cmd_check_camera_permission,
            cmd_request_camera_permission,
            cmd_list_cameras,
            cmd_start_camera_preview,
            cmd_stop_camera_preview,
            cmd_start_webcam_recording,
            cmd_stop_webcam_recording,
            cmd_start_screen_recording,
            cmd_start_pip_recording,
            cmd_stop_pip_recording,
            cmd_stop_recording,
            cmd_pause_recording,
            cmd_resume_recording,
            cmd_cancel_recording,
            cmd_check_disk_space,
            cmd_send_recording_notification,
            cmd_get_home_dir,
            cmd_get_available_windows,
            get_playback_fps,
            record_playback_frame,
            reset_fps_counter,
            get_buffer_status,
            cmd_render_segment,
            cmd_classify_segment_type,
            cmd_render_timeline,
            cmd_clear_timeline_cache
        ])
        .setup(|app| {
            use tauri::menu::*;

            // Build native macOS menu bar
            let menu = Menu::new(app)?;

            // File menu
            let file_menu = Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &MenuItem::with_id(app, "import", "Import...", true, Some("CmdOrCtrl+O"))?,
                    &MenuItem::with_id(app, "save", "Save Project", true, Some("CmdOrCtrl+S"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "quit", "Quit", true, Some("CmdOrCtrl+Q"))?,
                ],
            )?;

            // Edit menu
            let edit_menu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &MenuItem::with_id(app, "undo", "Undo", true, Some("CmdOrCtrl+Z"))?,
                    &MenuItem::with_id(
                        app,
                        "redo",
                        "Redo",
                        true,
                        Some("CmdOrCtrl+Shift+Z"),
                    )?,
                ],
            )?;

            // Window menu
            let window_menu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &MenuItem::with_id(app, "close", "Close", true, Some("CmdOrCtrl+W"))?,
                ],
            )?;

            menu.append(&file_menu)?;
            menu.append(&edit_menu)?;
            menu.append(&window_menu)?;

            app.set_menu(menu)?;

            tracing::info!(event = "menu_initialized", "Native macOS menu bar configured");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    tracing::info!(event = "app_shutdown", "Application shutting down");
}
