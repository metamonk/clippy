pub mod commands;
pub mod models;
pub mod services;
pub mod utils;

use std::fs;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(commands::ExportState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::media::cmd_import_media,
            commands::export::cmd_start_export,
            commands::export::cmd_get_export_progress,
            commands::export::cmd_cancel_export
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
