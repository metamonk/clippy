use anyhow::{Context, Result};
use std::path::PathBuf;

/// Get the recordings directory for the application
///
/// Returns ~/Documents/clippy/recordings/ (macOS standard user directory)
/// Creates the directory if it doesn't exist.
///
/// # Returns
///
/// * `Ok(PathBuf)` - Path to the recordings directory
/// * `Err(anyhow::Error)` - Failed to get or create directory
pub fn get_recordings_directory() -> Result<PathBuf> {
    // Get user's Documents directory (cross-platform using dirs crate)
    let documents_dir = dirs::document_dir().context("Failed to get user Documents directory")?;

    // Build path: ~/Documents/clippy/recordings
    let recordings_dir = documents_dir.join("clippy").join("recordings");

    // Create directory if it doesn't exist
    if !recordings_dir.exists() {
        std::fs::create_dir_all(&recordings_dir).with_context(|| {
            format!(
                "Failed to create recordings directory: {}",
                recordings_dir.display()
            )
        })?;

        tracing::info!(
            event = "recordings_dir_created",
            path = %recordings_dir.display(),
            "Created recordings directory"
        );
    }

    Ok(recordings_dir)
}

/// Get a unique recording filename with timestamp
///
/// Returns a filename like: recording-2025-10-28-143527.mp4
///
/// # Returns
///
/// Filename string with timestamp
pub fn get_recording_filename() -> String {
    let now = chrono::Local::now();
    format!("recording-{}.mp4", now.format("%Y-%m-%d-%H%M%S"))
}

/// Get full path for a new recording
///
/// Combines the recordings directory with a timestamped filename.
///
/// # Returns
///
/// * `Ok(PathBuf)` - Full path for new recording
/// * `Err(anyhow::Error)` - Failed to get recordings directory
pub fn get_recording_path() -> Result<PathBuf> {
    let dir = get_recordings_directory()?;
    let filename = get_recording_filename();
    Ok(dir.join(filename))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_recordings_directory() {
        let result = get_recordings_directory();
        assert!(
            result.is_ok(),
            "Should successfully get recordings directory"
        );

        let dir = result.unwrap();
        assert!(dir.exists(), "Recordings directory should exist after call");
        assert!(
            dir.to_string_lossy().contains("Documents"),
            "Should be in Documents folder"
        );
        assert!(
            dir.to_string_lossy().contains("clippy"),
            "Should contain clippy folder"
        );
        assert!(
            dir.to_string_lossy().contains("recordings"),
            "Should contain recordings folder"
        );
    }

    #[test]
    fn test_get_recording_filename() {
        let filename = get_recording_filename();

        assert!(
            filename.starts_with("recording-"),
            "Should start with recording-"
        );
        assert!(filename.ends_with(".mp4"), "Should end with .mp4");
        assert!(filename.contains("-"), "Should contain date separators");
    }

    #[test]
    fn test_get_recording_path() {
        let result = get_recording_path();
        assert!(result.is_ok(), "Should successfully get recording path");

        let path = result.unwrap();
        assert!(path.parent().is_some(), "Should have parent directory");
        assert!(path.file_name().is_some(), "Should have filename");

        let filename = path.file_name().unwrap().to_string_lossy();
        assert!(
            filename.starts_with("recording-"),
            "Filename should follow pattern"
        );
        assert!(
            filename.ends_with(".mp4"),
            "Filename should have .mp4 extension"
        );
    }
}
