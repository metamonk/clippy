use crate::models::{MediaFile, Resolution};
use anyhow::{Context, Result};
use base64::{engine::general_purpose, Engine as _};
use std::path::Path;
use std::process::Command;

/// Extract video metadata using FFmpeg
///
/// This function uses ffprobe (part of FFmpeg) to extract metadata from a video file.
///
/// # Arguments
/// * `file_path` - Path to the video file
///
/// # Returns
/// * `Ok(MediaFile)` - Successfully extracted metadata
/// * `Err(anyhow::Error)` - FFmpeg error with context
pub async fn extract_metadata(file_path: &str) -> Result<MediaFile> {
    tracing::debug!(
        event = "extract_metadata_start",
        file_path = %file_path,
        "Starting metadata extraction"
    );

    let path = Path::new(file_path);

    // Get file size
    let metadata = std::fs::metadata(path)
        .context("Failed to read file metadata")?;
    let file_size = metadata.len();

    // Get filename
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow::anyhow!("Invalid filename"))?
        .to_string();

    // Run ffprobe to get video metadata in JSON format
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            file_path,
        ])
        .output()
        .context("Failed to execute ffprobe")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("FFprobe failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout)
        .context("Failed to parse ffprobe output")?;

    // Extract video stream information
    let streams = parsed["streams"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("No streams found in file"))?;

    let video_stream = streams
        .iter()
        .find(|s| s["codec_type"].as_str() == Some("video"))
        .ok_or_else(|| anyhow::anyhow!("No video stream found in file"))?;

    // Extract duration (in seconds, convert to milliseconds)
    let duration_secs = parsed["format"]["duration"]
        .as_str()
        .and_then(|d| d.parse::<f64>().ok())
        .ok_or_else(|| anyhow::anyhow!("Failed to parse duration"))?;
    let duration = (duration_secs * 1000.0) as u64;

    // Extract resolution
    let width = video_stream["width"]
        .as_u64()
        .ok_or_else(|| anyhow::anyhow!("Failed to get video width"))? as u32;
    let height = video_stream["height"]
        .as_u64()
        .ok_or_else(|| anyhow::anyhow!("Failed to get video height"))? as u32;

    // Extract codec
    let codec = video_stream["codec_name"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("Failed to get codec name"))?
        .to_string();

    // Generate unique ID
    let id = uuid::Uuid::new_v4().to_string();

    // Get current timestamp
    let imported_at = chrono::Utc::now().to_rfc3339();

    // Generate thumbnail
    let thumbnail = match generate_thumbnail(file_path).await {
        Ok(thumb) => {
            tracing::debug!(
                event = "thumbnail_generated",
                file_path = %file_path,
                "Thumbnail generated successfully"
            );
            Some(thumb)
        }
        Err(e) => {
            tracing::warn!(
                event = "thumbnail_generation_failed",
                file_path = %file_path,
                error = %e,
                "Failed to generate thumbnail, continuing without thumbnail"
            );
            None
        }
    };

    let media_file = MediaFile {
        id,
        file_path: file_path.to_string(),
        filename,
        duration,
        resolution: Resolution {
            width,
            height,
        },
        file_size,
        codec,
        thumbnail,
        imported_at,
    };

    tracing::info!(
        event = "extract_metadata_success",
        file_path = %file_path,
        duration_ms = duration,
        resolution = ?media_file.resolution,
        codec = %media_file.codec,
        has_thumbnail = media_file.thumbnail.is_some(),
        "Successfully extracted metadata"
    );

    Ok(media_file)
}

/// Generate a thumbnail for a video file
///
/// This function uses FFmpeg to extract a frame from a video and returns it as a Base64-encoded data URL.
/// It attempts to extract a frame at 1 second, falling back to the first frame if the video is too short.
///
/// # Arguments
/// * `file_path` - Path to the video file
///
/// # Returns
/// * `Ok(String)` - Base64 data URL of the thumbnail image (PNG format)
/// * `Err(anyhow::Error)` - FFmpeg error with context
pub async fn generate_thumbnail(file_path: &str) -> Result<String> {
    tracing::debug!(
        event = "generate_thumbnail_start",
        file_path = %file_path,
        "Starting thumbnail generation"
    );

    // Get app data directory for temporary thumbnail storage
    let app_data_dir = dirs::data_dir()
        .ok_or_else(|| anyhow::anyhow!("Failed to resolve app data directory"))?
        .join("com.clippy.app")
        .join("thumbnails");

    // Create thumbnails directory if it doesn't exist
    std::fs::create_dir_all(&app_data_dir)
        .context("Failed to create thumbnails directory")?;

    // Generate unique filename for thumbnail
    let thumbnail_filename = format!("{}.png", uuid::Uuid::new_v4());
    let thumbnail_path = app_data_dir.join(&thumbnail_filename);

    // Try extracting frame at 1 second first
    let mut seek_time = "00:00:01";
    let mut result = Command::new("ffmpeg")
        .args([
            "-ss",
            seek_time,
            "-i",
            file_path,
            "-vframes",
            "1",
            "-vf",
            "scale=320:-1",
            "-y", // Overwrite output file if exists
            thumbnail_path.to_str().unwrap(),
        ])
        .output()
        .context("Failed to execute ffmpeg for thumbnail generation");

    // If failed (possibly video shorter than 1 second), try first frame
    if result.is_err() || !result.as_ref().unwrap().status.success() {
        tracing::debug!(
            event = "thumbnail_retry_first_frame",
            file_path = %file_path,
            "Video may be shorter than 1 second, retrying with first frame"
        );

        seek_time = "00:00:00";
        result = Command::new("ffmpeg")
            .args([
                "-ss",
                seek_time,
                "-i",
                file_path,
                "-vframes",
                "1",
                "-vf",
                "scale=320:-1",
                "-y",
                thumbnail_path.to_str().unwrap(),
            ])
            .output()
            .context("Failed to execute ffmpeg for thumbnail generation (retry)");
    }

    let output = result?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("FFmpeg thumbnail generation failed: {}", stderr));
    }

    // Read thumbnail file and convert to Base64 data URL
    let thumbnail_bytes = std::fs::read(&thumbnail_path)
        .context("Failed to read generated thumbnail")?;

    let base64_thumbnail = general_purpose::STANDARD.encode(&thumbnail_bytes);
    let data_url = format!("data:image/png;base64,{}", base64_thumbnail);

    // Clean up temporary file
    if let Err(e) = std::fs::remove_file(&thumbnail_path) {
        tracing::warn!(
            event = "thumbnail_cleanup_failed",
            file_path = %file_path,
            error = %e,
            "Failed to clean up temporary thumbnail file"
        );
    }

    tracing::info!(
        event = "generate_thumbnail_success",
        file_path = %file_path,
        seek_time = seek_time,
        thumbnail_size = thumbnail_bytes.len(),
        "Successfully generated thumbnail"
    );

    Ok(data_url)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests require actual video files or mocked FFmpeg output.
    // For now, we'll test the error handling paths.

    #[tokio::test]
    async fn test_extract_metadata_handles_missing_file() {
        let result = extract_metadata("/nonexistent/file.mp4").await;
        assert!(result.is_err());
        let error = result.unwrap_err();
        assert!(error.to_string().contains("Failed to read file metadata"));
    }

    #[tokio::test]
    async fn test_extract_metadata_handles_invalid_video() {
        // Create a temporary file with invalid video data
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("invalid_video.mp4");
        std::fs::write(&test_file, b"not a video file").expect("Failed to create test file");

        let result = extract_metadata(test_file.to_string_lossy().as_ref()).await;

        // Should fail because it's not a valid video
        assert!(result.is_err());

        // Cleanup
        let _ = std::fs::remove_file(&test_file);
    }

    // Integration test with a real video file would go here
    // This would require creating a minimal valid MP4 file for testing
}
