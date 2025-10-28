use serde::{Deserialize, Serialize};

/// Resolution of a video file
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
}

/// Media file metadata
///
/// This struct represents a video file that has been imported into the media library.
/// Field names use snake_case (Rust convention) but serialize to camelCase for TypeScript.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaFile {
    /// Unique identifier (UUID v4)
    pub id: String,

    /// Absolute path to the file on disk
    pub file_path: String,

    /// Display name (filename with extension)
    pub filename: String,

    /// Duration in milliseconds
    pub duration: u64,

    /// Video resolution
    pub resolution: Resolution,

    /// File size in bytes
    pub file_size: u64,

    /// Video codec (e.g., "h264", "hevc")
    pub codec: String,

    /// Optional thumbnail (base64 or file path)
    pub thumbnail: Option<String>,

    /// ISO 8601 timestamp of when the file was imported
    pub imported_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_media_file_serialization() {
        let media_file = MediaFile {
            id: "test-id-123".to_string(),
            file_path: "/path/to/video.mp4".to_string(),
            filename: "video.mp4".to_string(),
            duration: 60000, // 60 seconds
            resolution: Resolution {
                width: 1920,
                height: 1080,
            },
            file_size: 10485760, // 10 MB
            codec: "h264".to_string(),
            thumbnail: None,
            imported_at: "2025-10-27T10:00:00Z".to_string(),
        };

        // Serialize to JSON
        let json = serde_json::to_string(&media_file).expect("Failed to serialize");

        // Verify camelCase field names in JSON
        assert!(json.contains("\"filePath\""));
        assert!(json.contains("\"fileName\"") || json.contains("\"filename\""));
        assert!(json.contains("\"fileSize\""));
        assert!(json.contains("\"importedAt\""));

        // Deserialize from JSON
        let deserialized: MediaFile = serde_json::from_str(&json).expect("Failed to deserialize");

        assert_eq!(media_file, deserialized);
    }

    #[test]
    fn test_resolution_serialization() {
        let resolution = Resolution {
            width: 1920,
            height: 1080,
        };

        let json = serde_json::to_string(&resolution).expect("Failed to serialize");
        let deserialized: Resolution = serde_json::from_str(&json).expect("Failed to deserialize");

        assert_eq!(resolution, deserialized);
        assert!(json.contains("\"width\""));
        assert!(json.contains("\"height\""));
    }
}
