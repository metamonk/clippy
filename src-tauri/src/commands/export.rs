use crate::models::{ExportConfig, ExportProgress, Timeline};
use crate::services::VideoExporter;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

/// Application state for managing export operations
pub struct ExportState {
    /// Active export operations mapped by export ID
    pub exports: Arc<Mutex<HashMap<String, Arc<Mutex<VideoExporter>>>>>,
}

impl ExportState {
    pub fn new() -> Self {
        Self {
            exports: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Start a new video export operation
///
/// This command initiates the export of a timeline to an MP4 file.
/// It spawns the export as a background task and returns immediately with an export ID.
/// Use `cmd_get_export_progress` to monitor progress.
///
/// # Arguments
/// * `timeline` - Timeline with tracks and clips to export
/// * `config` - Export configuration including output path
/// * `state` - Application state for tracking exports
///
/// # Returns
/// * `Ok(String)` - Export ID for tracking progress
/// * `Err(String)` - Error message if export failed to start
#[tauri::command]
pub async fn cmd_start_export(
    timeline: Timeline,
    config: ExportConfig,
    state: State<'_, ExportState>,
) -> Result<String, String> {
    tracing::info!(
        event = "cmd_start_export",
        output_path = %config.output_path,
        timeline_duration = timeline.total_duration,
        track_count = timeline.tracks.len(),
        "Starting export command"
    );

    // Debug: Log track details
    for (idx, track) in timeline.tracks.iter().enumerate() {
        tracing::info!(
            event = "track_details",
            track_index = idx,
            track_id = %track.id,
            track_type = ?track.track_type,
            clip_count = track.clips.len(),
            "Track information"
        );
    }

    // Generate export ID
    let export_id = uuid::Uuid::new_v4().to_string();

    // Create exporter
    let exporter = VideoExporter::new(export_id.clone(), timeline.total_duration);

    // Store exporter in state
    let exporter_arc = Arc::new(Mutex::new(exporter));
    {
        let mut exports = state.exports.lock().await;
        exports.insert(export_id.clone(), exporter_arc.clone());
    }

    // Spawn export task in background
    let timeline_clone = timeline.clone();
    let config_clone = config.clone();
    let export_id_clone = export_id.clone();
    let exports_map = Arc::clone(&state.exports);

    tokio::spawn(async move {
        let result = {
            let mut exporter = exporter_arc.lock().await;
            exporter.export_timeline(&timeline_clone, &config_clone).await
        };

        match result {
            Ok(()) => {
                tracing::info!(
                    event = "export_completed",
                    export_id = %export_id_clone,
                    "Export completed successfully"
                );
            }
            Err(e) => {
                tracing::error!(
                    event = "export_failed",
                    export_id = %export_id_clone,
                    error = %e,
                    "Export failed"
                );
            }
        }

        // Clean up export from state after completion
        let mut exports = exports_map.lock().await;
        exports.remove(&export_id_clone);
    });

    tracing::info!(
        event = "export_started",
        export_id = %export_id,
        "Export started in background"
    );

    Ok(export_id)
}

/// Get progress information for an ongoing export
///
/// # Arguments
/// * `export_id` - ID of the export to query (returned from cmd_start_export)
/// * `state` - Application state for tracking exports
///
/// # Returns
/// * `Ok(ExportProgress)` - Current progress information
/// * `Err(String)` - Error if export not found or progress unavailable
#[tauri::command]
pub async fn cmd_get_export_progress(
    export_id: String,
    state: State<'_, ExportState>,
) -> Result<ExportProgress, String> {
    tracing::debug!(
        event = "cmd_get_export_progress",
        export_id = %export_id,
        "Getting export progress"
    );

    let exports = state.exports.lock().await;

    let exporter_arc = exports
        .get(&export_id)
        .ok_or_else(|| format!("Export not found: {}", export_id))?
        .clone();

    // Drop exports lock before locking exporter
    drop(exports);

    let exporter = exporter_arc.lock().await;

    let progress = exporter
        .get_progress()
        .await
        .map_err(|e| format!("Failed to get progress: {}", e))?;

    Ok(progress)
}

/// Cancel an ongoing export operation
///
/// This command terminates the FFmpeg process for a running export
/// and removes it from the active exports list.
///
/// # Arguments
/// * `export_id` - ID of the export to cancel
/// * `output_path` - Output path for cleanup of partial file
/// * `state` - Application state for tracking exports
///
/// # Returns
/// * `Ok(())` - Export cancelled successfully
/// * `Err(String)` - Error if export not found or cancellation failed
#[tauri::command]
pub async fn cmd_cancel_export(
    export_id: String,
    output_path: String,
    state: State<'_, ExportState>,
) -> Result<(), String> {
    tracing::info!(
        event = "cmd_cancel_export",
        export_id = %export_id,
        "Cancelling export"
    );

    // Get the exporter before removing from state
    let exporter_arc = {
        let exports = state.exports.lock().await;
        exports.get(&export_id).cloned()
    };

    match exporter_arc {
        Some(exporter_arc) => {
            // Call the cancel method on the exporter
            {
                let mut exporter = exporter_arc.lock().await;
                if let Err(e) = exporter.cancel(&output_path).await {
                    tracing::error!(
                        event = "export_cancel_failed",
                        export_id = %export_id,
                        error = %e,
                        "Failed to cancel export"
                    );
                    return Err(format!("Failed to cancel export: {}", e));
                }
            }

            // Remove export from active exports after successful cancellation
            let mut exports = state.exports.lock().await;
            exports.remove(&export_id);

            tracing::info!(
                event = "export_cancelled",
                export_id = %export_id,
                "Export cancelled successfully"
            );
            Ok(())
        }
        None => Err(format!("Export not found: {}", export_id)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_export_state_creation() {
        let state = ExportState::new();
        let exports = state.exports.lock().await;
        assert_eq!(exports.len(), 0);
    }

    // Note: Tests for cmd_start_export, cmd_get_export_progress, and cmd_cancel_export
    // require integration testing with Tauri's State system.
    // These are tested through end-to-end tests with the running application.
}
