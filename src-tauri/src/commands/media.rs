use crate::models::MediaFile;
use crate::utils::ffmpeg;

/// Import a video file and extract its metadata
///
/// This command validates the file path, extracts video metadata using FFmpeg,
/// and returns a MediaFile struct with all relevant information.
///
/// # Arguments
/// * `file_path` - Absolute path to the video file to import
///
/// # Returns
/// * `Ok(MediaFile)` - Successfully imported file with metadata
/// * `Err(String)` - User-friendly error message if import fails
#[tauri::command]
pub async fn cmd_import_media(file_path: String) -> Result<MediaFile, String> {
    tracing::info!(
        event = "cmd_import_media",
        file_path = %file_path,
        "Import media command invoked"
    );

    // Validate file path exists
    if !std::path::Path::new(&file_path).exists() {
        let error_msg = format!("File not found: {}", file_path);
        tracing::error!(event = "file_not_found", file_path = %file_path, error_msg = %error_msg);
        return Err(error_msg);
    }

    // Validate file format (MP4, MOV, and WebM)
    let path = std::path::Path::new(&file_path);
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase());

    match extension.as_deref() {
        Some("mp4") | Some("mov") | Some("webm") => {
            tracing::debug!(
                event = "file_format_validated",
                file_path = %file_path,
                extension = ?extension
            );
        }
        _ => {
            let error_msg = "Unsupported file format. Please import MP4, MOV, or WebM files.".to_string();
            tracing::warn!(
                event = "unsupported_format",
                file_path = %file_path,
                extension = ?extension
            );
            return Err(error_msg);
        }
    }

    // Extract metadata with FFmpeg
    match ffmpeg::extract_metadata(&file_path).await {
        Ok(media_file) => {
            tracing::info!(
                event = "cmd_import_media_success",
                file_path = %file_path,
                media_id = %media_file.id,
                "Successfully imported media file"
            );
            Ok(media_file)
        }
        Err(e) => {
            let error_msg = format!("Failed to import file: {}. Please check the file is not corrupted.", e);
            tracing::error!(
                event = "cmd_import_media_failed",
                file_path = %file_path,
                error = %e,
                "Failed to extract metadata"
            );
            Err(error_msg)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_cmd_import_media_rejects_unsupported_format() {
        // Create a temporary file with unsupported extension
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test_video.avi");
        std::fs::write(&test_file, b"dummy content").expect("Failed to create test file");

        let result = cmd_import_media(test_file.to_string_lossy().to_string()).await;

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err(),
            "Unsupported file format. Please import MP4, MOV, or WebM files."
        );

        // Cleanup
        let _ = std::fs::remove_file(&test_file);
    }

    #[tokio::test]
    async fn test_cmd_import_media_handles_missing_file() {
        let result = cmd_import_media("/nonexistent/path/to/video.mp4".to_string()).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("File not found"));
    }

    #[tokio::test]
    async fn test_cmd_import_media_accepts_mp4() {
        // Create a temporary MP4 file
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test_video.mp4");
        std::fs::write(&test_file, b"dummy content").expect("Failed to create test file");

        let result = cmd_import_media(test_file.to_string_lossy().to_string()).await;

        // Should pass validation but fail at metadata extraction (invalid video)
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to import file"));

        // Cleanup
        let _ = std::fs::remove_file(&test_file);
    }

    #[tokio::test]
    async fn test_cmd_import_media_accepts_mov() {
        // Create a temporary MOV file
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("test_video.mov");
        std::fs::write(&test_file, b"dummy content").expect("Failed to create test file");

        let result = cmd_import_media(test_file.to_string_lossy().to_string()).await;

        // Should pass validation but fail at metadata extraction (invalid video)
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to import file"));

        // Cleanup
        let _ = std::fs::remove_file(&test_file);
    }
}
