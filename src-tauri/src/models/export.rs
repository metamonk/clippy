use serde::{Deserialize, Serialize};

/// Configuration for video export operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportConfig {
    /// Output file path selected by user
    pub output_path: String,

    /// Optional resolution override (width, height)
    /// If None, uses source resolution
    pub resolution: Option<(u32, u32)>,

    /// Optional video codec override
    /// If None, defaults to H.264 (libx264)
    pub codec: Option<String>,

    /// Optional audio codec override
    /// If None, defaults to AAC
    pub audio_codec: Option<String>,

    /// Optional video bitrate (e.g., "5M" for 5 Mbps)
    /// If None, uses FFmpeg default
    pub video_bitrate: Option<String>,

    /// Optional audio bitrate (e.g., "192k")
    /// If None, uses FFmpeg default (128k)
    pub audio_bitrate: Option<String>,
}

impl Default for ExportConfig {
    fn default() -> Self {
        Self {
            output_path: String::new(),
            resolution: None,
            codec: Some("libx264".to_string()),
            audio_codec: Some("aac".to_string()),
            video_bitrate: None,
            audio_bitrate: Some("192k".to_string()),
        }
    }
}

/// Export progress status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportStatus {
    /// Export is currently running
    Running,

    /// Export completed successfully
    Completed,

    /// Export failed with error
    Failed,

    /// Export was cancelled by user
    Cancelled,
}

/// Progress information for ongoing export
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    /// Export ID
    pub export_id: String,

    /// Current status
    pub status: ExportStatus,

    /// Percentage complete (0-100)
    pub percentage: f32,

    /// Estimated time remaining in seconds
    /// None if not yet calculable
    pub eta_seconds: Option<u64>,

    /// Current processing time in milliseconds
    pub current_time_ms: Option<u64>,

    /// Total timeline duration in milliseconds
    pub total_duration_ms: u64,

    /// Optional error message if status is Failed
    pub error_message: Option<String>,
}

impl ExportProgress {
    /// Create a new export progress tracker
    pub fn new(export_id: String, total_duration_ms: u64) -> Self {
        Self {
            export_id,
            status: ExportStatus::Running,
            percentage: 0.0,
            eta_seconds: None,
            current_time_ms: Some(0),
            total_duration_ms,
            error_message: None,
        }
    }

    /// Update progress from FFmpeg time output
    pub fn update_from_time(&mut self, time_ms: u64, elapsed_seconds: u64) {
        self.current_time_ms = Some(time_ms);

        // Calculate percentage
        if self.total_duration_ms > 0 {
            self.percentage = ((time_ms as f64 / self.total_duration_ms as f64) * 100.0) as f32;
            self.percentage = self.percentage.min(100.0); // Cap at 100%
        }

        // Calculate ETA based on encoding speed
        if time_ms > 0 && elapsed_seconds > 0 {
            let encoding_speed = time_ms as f64 / (elapsed_seconds as f64 * 1000.0);
            let remaining_ms = self.total_duration_ms.saturating_sub(time_ms);
            self.eta_seconds = Some((remaining_ms as f64 / (encoding_speed * 1000.0)) as u64);
        }
    }

    /// Mark export as completed
    pub fn mark_completed(mut self) -> Self {
        self.status = ExportStatus::Completed;
        self.percentage = 100.0;
        self.eta_seconds = Some(0);
        self
    }

    /// Mark export as failed
    pub fn mark_failed(mut self, error: String) -> Self {
        self.status = ExportStatus::Failed;
        self.error_message = Some(error);
        self
    }

    /// Mark export as cancelled
    pub fn mark_cancelled(mut self) -> Self {
        self.status = ExportStatus::Cancelled;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_config_default() {
        let config = ExportConfig::default();
        assert_eq!(config.codec, Some("libx264".to_string()));
        assert_eq!(config.audio_codec, Some("aac".to_string()));
        assert_eq!(config.audio_bitrate, Some("192k".to_string()));
    }

    #[test]
    fn test_export_progress_percentage_calculation() {
        let mut progress = ExportProgress::new("test-id".to_string(), 10000);

        progress.update_from_time(5000, 10);
        assert_eq!(progress.percentage, 50.0);

        progress.update_from_time(10000, 20);
        assert_eq!(progress.percentage, 100.0);

        // Should cap at 100%
        progress.update_from_time(15000, 30);
        assert_eq!(progress.percentage, 100.0);
    }

    #[test]
    fn test_export_progress_status_transitions() {
        let progress = ExportProgress::new("test-id".to_string(), 10000);
        assert_eq!(progress.status, ExportStatus::Running);

        let progress = progress.mark_completed();
        assert_eq!(progress.status, ExportStatus::Completed);
        assert_eq!(progress.percentage, 100.0);

        let progress = ExportProgress::new("test-id".to_string(), 10000);
        let progress = progress.mark_failed("Test error".to_string());
        assert_eq!(progress.status, ExportStatus::Failed);
        assert_eq!(progress.error_message, Some("Test error".to_string()));

        let progress = ExportProgress::new("test-id".to_string(), 10000);
        let progress = progress.mark_cancelled();
        assert_eq!(progress.status, ExportStatus::Cancelled);
    }
}
