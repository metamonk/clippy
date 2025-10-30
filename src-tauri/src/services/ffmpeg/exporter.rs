use crate::models::{ExportConfig, ExportProgress, Timeline, Clip};
use anyhow::{Context, Result};
use ffmpeg_sidecar::command::FfmpegCommand;
use ffmpeg_sidecar::event::{FfmpegEvent, LogLevel};
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

/// Video exporter using ffmpeg-sidecar
pub struct VideoExporter {
    /// Shared progress state
    progress: Arc<Mutex<ExportProgress>>,

    /// Start time for ETA calculation
    start_time: Instant,

    /// FFmpeg child process handle for cancellation
    process_handle: Arc<Mutex<Option<ffmpeg_sidecar::child::FfmpegChild>>>,
}

impl VideoExporter {
    /// Create a new video exporter
    pub fn new(export_id: String, total_duration_ms: u64) -> Self {
        Self {
            progress: Arc::new(Mutex::new(ExportProgress::new(export_id, total_duration_ms))),
            start_time: Instant::now(),
            process_handle: Arc::new(Mutex::new(None)),
        }
    }
}

/// Ensure FFmpeg process is cleaned up when VideoExporter is dropped
impl Drop for VideoExporter {
    fn drop(&mut self) {
        // Try to kill the process if it's still running
        // Note: We can't use async in Drop, so we use try_lock
        if let Ok(mut handle) = self.process_handle.try_lock() {
            if let Some(mut child) = handle.take() {
                if let Err(e) = child.kill() {
                    tracing::warn!(
                        event = "ffmpeg_cleanup_on_drop_failed",
                        error = %e,
                        "Failed to kill FFmpeg process during cleanup"
                    );
                } else {
                    tracing::debug!("FFmpeg process cleaned up on drop");
                }
            }
        }
    }
}

impl VideoExporter {
    /// Get current export progress
    pub async fn get_progress(&self) -> Result<ExportProgress> {
        let progress = self.progress.lock().await;
        Ok(progress.clone())
    }

    /// Export a timeline to MP4 file
    ///
    /// This function converts a timeline with clips into a single MP4 file using FFmpeg.
    /// It respects trim points and applies H.264 video and AAC audio encoding.
    ///
    /// # Arguments
    /// * `timeline` - Timeline with tracks and clips to export
    /// * `config` - Export configuration (output path, codec settings, etc.)
    ///
    /// # Returns
    /// * `Ok(())` - Export completed successfully
    /// * `Err(anyhow::Error)` - Export failed
    pub async fn export_timeline(
        &mut self,
        timeline: &Timeline,
        config: &ExportConfig,
    ) -> Result<()> {
        let export_id = self.get_progress().await?.export_id.clone();

        tracing::info!(
            event = "export_start",
            export_id = %export_id,
            output_path = %config.output_path,
            timeline_duration_ms = timeline.total_duration,
            "Starting timeline export"
        );

        // Validate and canonicalize output path to prevent path traversal
        let output_path = Path::new(&config.output_path);

        // Canonicalize the path (this also checks if parent exists)
        let output_path_canonical = output_path
            .parent()
            .ok_or_else(|| anyhow::anyhow!("Invalid output path: no parent directory"))?
            .canonicalize()
            .context("Failed to canonicalize output path. Please ensure the parent directory exists.")?
            .join(output_path.file_name().ok_or_else(|| anyhow::anyhow!("Invalid output path: no file name"))?);

        // Verify path is within allowed directories (user home directory)
        if let Ok(home_dir) = std::env::var("HOME") {
            let home_canonical = Path::new(&home_dir).canonicalize().unwrap_or_default();
            if !output_path_canonical.starts_with(&home_canonical) {
                return Err(anyhow::anyhow!(
                    "Invalid output path: must be within user home directory. Path: {:?}",
                    output_path_canonical
                ));
            }
        }

        tracing::debug!(
            event = "output_path_validated",
            original_path = %config.output_path,
            canonical_path = %output_path_canonical.display(),
            "Output path validated and canonicalized"
        );

        // Build FFmpeg command
        let mut ffmpeg = self.build_export_command(timeline, config)?;

        tracing::debug!(
            event = "ffmpeg_command_built",
            "FFmpeg command constructed successfully"
        );

        // Spawn FFmpeg process with event handler
        let progress_clone = Arc::clone(&self.progress);
        let process_handle_clone = Arc::clone(&self.process_handle);
        let start_time = self.start_time;

        let child = ffmpeg
            .spawn()
            .context("Failed to spawn FFmpeg process. Please restart the application to download FFmpeg.")?;

        // Store process handle for cancellation
        {
            let mut handle = process_handle_clone.lock().await;
            *handle = Some(child);
        }

        // Get the iterator from the stored process handle
        let mut iter = {
            let mut handle = process_handle_clone.lock().await;
            handle.as_mut()
                .ok_or_else(|| anyhow::anyhow!("FFmpeg process handle not available"))?
                .iter()
                .context("Failed to create FFmpeg event iterator")?
        };

        // Process FFmpeg events
        while let Some(event) = iter.next() {
            match event {
                FfmpegEvent::Progress(progress_event) => {
                    // Extract current time from progress (format: "time=HH:MM:SS.mmm")
                    let time_str = &progress_event.time;
                    if let Some(time_ms) = parse_ffmpeg_time(time_str) {
                        let elapsed_secs = start_time.elapsed().as_secs();

                        // Update progress
                        let mut prog = progress_clone.lock().await;
                        prog.update_from_time(time_ms, elapsed_secs);

                        tracing::debug!(
                            event = "export_progress",
                            percentage = prog.percentage,
                            time_ms = time_ms,
                            eta_seconds = ?prog.eta_seconds,
                            "Export progress updated"
                        );
                    }
                }
                FfmpegEvent::Log(LogLevel::Error, msg) => {
                    tracing::error!(
                        event = "ffmpeg_error",
                        message = %msg,
                        "FFmpeg error occurred"
                    );
                }
                FfmpegEvent::Log(LogLevel::Warning, msg) => {
                    tracing::warn!(
                        event = "ffmpeg_warning",
                        message = %msg,
                        "FFmpeg warning"
                    );
                }
                FfmpegEvent::Log(LogLevel::Info, msg) => {
                    tracing::debug!(
                        event = "ffmpeg_info",
                        message = %msg,
                        "FFmpeg info"
                    );
                }
                FfmpegEvent::LogEOF => {
                    tracing::debug!("FFmpeg log stream ended");
                    break;
                }
                FfmpegEvent::Done => {
                    tracing::info!("FFmpeg process completed");
                    break;
                }
                _ => {}
            }
        }

        // Check if output file was created
        if !output_path_canonical.exists() {
            let error = "Export failed: output file was not created";
            let mut prog = self.progress.lock().await;
            *prog = prog.clone().mark_failed(error.to_string());

            // Clean up process handle
            let mut handle = self.process_handle.lock().await;
            *handle = None;

            return Err(anyhow::anyhow!(error));
        }

        // Mark as completed
        {
            let mut prog = self.progress.lock().await;
            *prog = prog.clone().mark_completed();
        }

        // Clean up process handle
        {
            let mut handle = self.process_handle.lock().await;
            *handle = None;
        }

        tracing::info!(
            event = "export_complete",
            output_path = %output_path_canonical.display(),
            duration_seconds = start_time.elapsed().as_secs(),
            "Timeline export completed successfully"
        );

        Ok(())
    }

    /// Cancel the running export
    ///
    /// Terminates the FFmpeg process and cleans up partial output file.
    ///
    /// # Returns
    /// * `Ok(())` - Cancellation successful
    /// * `Err(anyhow::Error)` - Cancellation failed
    pub async fn cancel(&mut self, output_path: &str) -> Result<()> {
        tracing::info!(
            event = "export_cancel_requested",
            output_path = %output_path,
            "Cancelling export"
        );

        // Terminate FFmpeg process
        {
            let mut handle = self.process_handle.lock().await;
            if let Some(mut child) = handle.take() {
                // Kill the FFmpeg process
                if let Err(e) = child.kill() {
                    tracing::error!(
                        event = "ffmpeg_kill_failed",
                        error = %e,
                        "Failed to kill FFmpeg process"
                    );
                    return Err(anyhow::anyhow!("Failed to terminate FFmpeg process: {}", e));
                }
                tracing::info!("FFmpeg process terminated");
            } else {
                tracing::warn!("No active FFmpeg process to cancel");
            }
        }

        // Mark progress as cancelled
        {
            let mut prog = self.progress.lock().await;
            *prog = prog.clone().mark_failed("Export cancelled by user".to_string());
        }

        // Clean up partial output file
        let output_path_buf = Path::new(output_path);
        if output_path_buf.exists() {
            if let Err(e) = std::fs::remove_file(output_path_buf) {
                tracing::warn!(
                    event = "partial_file_cleanup_failed",
                    error = %e,
                    path = %output_path,
                    "Failed to remove partial output file"
                );
                // Don't return error - cancellation succeeded even if cleanup failed
            } else {
                tracing::info!(
                    event = "partial_file_removed",
                    path = %output_path,
                    "Removed partial output file"
                );
            }
        }

        tracing::info!("Export cancelled successfully");
        Ok(())
    }

    /// Build FFmpeg command for timeline export
    fn build_export_command(
        &self,
        timeline: &Timeline,
        config: &ExportConfig,
    ) -> Result<FfmpegCommand> {
        // For MVP: Export single-track timeline with simple concatenation
        // Future: Support multi-track with filter_complex

        // Get video clips from first video track
        let video_track = timeline.video_tracks()
            .next()
            .ok_or_else(|| anyhow::anyhow!("No video track found in timeline"))?;

        if video_track.clips.is_empty() {
            return Err(anyhow::anyhow!("No clips in video track"));
        }

        tracing::debug!(
            event = "building_ffmpeg_command",
            clip_count = video_track.clips.len(),
            "Building FFmpeg export command"
        );

        // Start building FFmpeg command
        let mut command = FfmpegCommand::new();

        // For single clip: use simple trim + encode
        if video_track.clips.len() == 1 {
            let clip = &video_track.clips[0];
            self.add_single_clip_encoding(&mut command, clip, config)?;
        } else {
            // Multiple clips: use concat demuxer
            self.add_multi_clip_encoding(&mut command, &video_track.clips, config)?;
        }

        Ok(command)
    }

    /// Add FFmpeg parameters for single clip export
    fn add_single_clip_encoding(
        &self,
        command: &mut FfmpegCommand,
        clip: &Clip,
        config: &ExportConfig,
    ) -> Result<()> {
        // Validate clip file exists
        if !Path::new(&clip.file_path).exists() {
            return Err(anyhow::anyhow!("Clip file not found: {}", clip.file_path));
        }

        // Calculate trim duration (convert ms to seconds for FFmpeg)
        let trim_start_sec = clip.trim_in as f64 / 1000.0;
        let trim_duration_sec = (clip.trim_out - clip.trim_in) as f64 / 1000.0;

        tracing::debug!(
            event = "single_clip_export",
            file_path = %clip.file_path,
            trim_start_sec = trim_start_sec,
            trim_duration_sec = trim_duration_sec,
            "Configuring single clip export"
        );

        // Seek to trim start position
        command.arg("-ss").arg(format!("{:.3}", trim_start_sec));

        // Input file
        command.arg("-i").arg(&clip.file_path);

        // Set duration (trim length)
        command.arg("-t").arg(format!("{:.3}", trim_duration_sec));

        // Story 3.10: Apply audio fade filters if clip has fade properties
        let mut audio_filters = Vec::new();

        // Fade-in filter (applied at clip start, relative to trimmed segment)
        if let Some(fade_in_ms) = clip.fade_in {
            if fade_in_ms > 0 {
                let fade_in_sec = fade_in_ms as f64 / 1000.0;
                audio_filters.push(format!("afade=t=in:st=0:d={:.3}", fade_in_sec));
            }
        }

        // Fade-out filter (applied at clip end, relative to trimmed segment)
        if let Some(fade_out_ms) = clip.fade_out {
            if fade_out_ms > 0 {
                let fade_out_sec = fade_out_ms as f64 / 1000.0;
                let fade_out_start = trim_duration_sec - fade_out_sec;
                audio_filters.push(format!("afade=t=out:st={:.3}:d={:.3}", fade_out_start, fade_out_sec));
            }
        }

        // Apply audio filters if any exist
        if !audio_filters.is_empty() {
            let audio_filter_str = audio_filters.join(",");
            command.arg("-af").arg(&audio_filter_str);

            tracing::debug!(
                event = "audio_filters_applied",
                filters = %audio_filter_str,
                "Applied audio fade filters to single clip export"
            );
        }

        // Apply encoding settings
        self.add_encoding_params(command, config);

        // Output file
        command.arg(&config.output_path);

        Ok(())
    }

    /// Add FFmpeg parameters for multi-clip export using concat filter
    fn add_multi_clip_encoding(
        &self,
        command: &mut FfmpegCommand,
        clips: &[Clip],
        config: &ExportConfig,
    ) -> Result<()> {
        // Build filter_complex for concatenation with trim support
        // Format: [0:v]trim=start=X:duration=Y,setpts=PTS-STARTPTS[v0]; ... concat=n=N:v=1:a=1[outv][outa]

        let mut filter_parts = Vec::new();

        for (idx, clip) in clips.iter().enumerate() {
            // Validate clip file exists
            if !Path::new(&clip.file_path).exists() {
                return Err(anyhow::anyhow!("Clip file not found: {}", clip.file_path));
            }

            // Add input file
            command.arg("-i").arg(&clip.file_path);

            // Calculate trim points in seconds
            let trim_start_sec = clip.trim_in as f64 / 1000.0;
            let trim_end_sec = clip.trim_out as f64 / 1000.0;

            // Video filter: trim and reset timestamps
            let video_filter = format!(
                "[{}:v]trim=start={:.3}:end={:.3},setpts=PTS-STARTPTS[v{}]",
                idx, trim_start_sec, trim_end_sec, idx
            );
            filter_parts.push(video_filter);

            // Story 3.10: Build audio filter chain with fade support
            let trim_duration_sec = trim_end_sec - trim_start_sec;
            let mut audio_filter_chain = vec![
                format!("atrim=start={:.3}:end={:.3}", trim_start_sec, trim_end_sec),
                "asetpts=PTS-STARTPTS".to_string(),
            ];

            // Add fade-in if clip has fade_in property
            if let Some(fade_in_ms) = clip.fade_in {
                if fade_in_ms > 0 {
                    let fade_in_sec = fade_in_ms as f64 / 1000.0;
                    audio_filter_chain.push(format!("afade=t=in:st=0:d={:.3}", fade_in_sec));
                }
            }

            // Add fade-out if clip has fade_out property
            if let Some(fade_out_ms) = clip.fade_out {
                if fade_out_ms > 0 {
                    let fade_out_sec = fade_out_ms as f64 / 1000.0;
                    let fade_out_start = trim_duration_sec - fade_out_sec;
                    audio_filter_chain.push(format!("afade=t=out:st={:.3}:d={:.3}", fade_out_start, fade_out_sec));
                }
            }

            let audio_filter = format!(
                "[{}:a]{}[a{}]",
                idx,
                audio_filter_chain.join(","),
                idx
            );
            filter_parts.push(audio_filter);
        }

        // Build concat inputs
        let mut concat_video_inputs = String::new();
        let mut concat_audio_inputs = String::new();
        for i in 0..clips.len() {
            concat_video_inputs.push_str(&format!("[v{}]", i));
            concat_audio_inputs.push_str(&format!("[a{}]", i));
        }

        // Concat filter
        let concat_filter = format!(
            "{}{}concat=n={}:v=1:a=1[outv][outa]",
            concat_video_inputs,
            concat_audio_inputs,
            clips.len()
        );
        filter_parts.push(concat_filter);

        // Join all filter parts with semicolons
        let filter_complex = filter_parts.join(";");

        tracing::debug!(
            event = "multi_clip_export",
            clip_count = clips.len(),
            filter_complex_length = filter_complex.len(),
            "Configuring multi-clip export with concat filter"
        );

        // Add filter_complex
        command.arg("-filter_complex").arg(filter_complex);

        // Map output streams
        command.arg("-map").arg("[outv]");
        command.arg("-map").arg("[outa]");

        // Apply encoding settings
        self.add_encoding_params(command, config);

        // Output file
        command.arg(&config.output_path);

        Ok(())
    }

    /// Add encoding parameters (codec, bitrate, etc.)
    fn add_encoding_params(&self, command: &mut FfmpegCommand, config: &ExportConfig) {
        // Video codec (default: H.264)
        let video_codec = config.codec.as_deref().unwrap_or("libx264");
        command.arg("-c:v").arg(video_codec);

        // Video encoding preset for H.264
        if video_codec == "libx264" {
            command.arg("-preset").arg("medium");
            command.arg("-crf").arg("23"); // Constant rate factor for quality
        }

        // Video bitrate (if specified)
        if let Some(bitrate) = &config.video_bitrate {
            command.arg("-b:v").arg(bitrate);
        }

        // Audio codec (default: AAC)
        let audio_codec = config.audio_codec.as_deref().unwrap_or("aac");
        command.arg("-c:a").arg(audio_codec);

        // Audio bitrate (default: 192k)
        let audio_bitrate = config.audio_bitrate.as_deref().unwrap_or("192k");
        command.arg("-b:a").arg(audio_bitrate);

        // Resolution (if specified)
        if let Some((width, height)) = config.resolution {
            command.arg("-s").arg(format!("{}x{}", width, height));
        }

        // Output format: MP4
        command.arg("-f").arg("mp4");

        // Overwrite output file without asking
        command.arg("-y");
    }
}

/// Parse FFmpeg time string (format: "HH:MM:SS.mmm" or "00:01:23.45") to milliseconds
fn parse_ffmpeg_time(time_str: &str) -> Option<u64> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 3 {
        return None;
    }

    let hours: u64 = parts[0].parse().ok()?;
    let minutes: u64 = parts[1].parse().ok()?;
    let seconds_parts: Vec<&str> = parts[2].split('.').collect();

    let seconds: u64 = seconds_parts[0].parse().ok()?;
    let millis: u64 = if seconds_parts.len() > 1 {
        // Pad or truncate to 3 digits for milliseconds
        let ms_str = format!("{:0<3}", seconds_parts[1]);
        ms_str[..3].parse().unwrap_or(0)
    } else {
        0
    };

    Some((hours * 3600 + minutes * 60 + seconds) * 1000 + millis)
}

/// Check if FFmpeg is available (will auto-download if not present)
pub async fn check_ffmpeg_available() -> Result<bool> {
    tracing::debug!("Checking FFmpeg availability");

    // ffmpeg-sidecar will auto-download FFmpeg if not present
    // Try to spawn a simple FFmpeg command to verify it works
    let result = FfmpegCommand::new()
        .arg("-version")
        .spawn();

    let available = result.is_ok();

    if available {
        tracing::info!("FFmpeg is available and ready");
    } else {
        tracing::warn!("FFmpeg check failed");
    }

    Ok(available)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Track, TrackType, ExportStatus};

    #[tokio::test]
    async fn test_video_exporter_creation() {
        let exporter = VideoExporter::new("test-id".to_string(), 10000);
        let progress = exporter.get_progress().await.unwrap();

        assert_eq!(progress.export_id, "test-id");
        assert_eq!(progress.status, ExportStatus::Running);
        assert_eq!(progress.percentage, 0.0);
    }

    #[test]
    fn test_build_command_validates_empty_timeline() {
        let exporter = VideoExporter::new("test-id".to_string(), 10000);
        let timeline = Timeline {
            tracks: vec![],
            total_duration: 0,
        };
        let config = ExportConfig::default();

        let result = exporter.build_export_command(&timeline, &config);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("No video track"));
    }

    #[test]
    fn test_build_command_validates_empty_clips() {
        let exporter = VideoExporter::new("test-id".to_string(), 10000);
        let timeline = Timeline {
            tracks: vec![Track {
                id: "track-1".to_string(),
                track_number: 1,
                clips: vec![],
                track_type: TrackType::Video,
            }],
            total_duration: 0,
        };
        let config = ExportConfig::default();

        let result = exporter.build_export_command(&timeline, &config);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("No clips"));
    }

    #[tokio::test]
    async fn test_ffmpeg_availability_check() {
        // This test will trigger auto-download if FFmpeg is not present
        let result = check_ffmpeg_available().await;

        // Should succeed (either already available or auto-downloaded)
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_ffmpeg_time() {
        assert_eq!(parse_ffmpeg_time("00:00:00.000"), Some(0));
        assert_eq!(parse_ffmpeg_time("00:00:01.000"), Some(1000));
        assert_eq!(parse_ffmpeg_time("00:00:01.500"), Some(1500));
        assert_eq!(parse_ffmpeg_time("00:01:01.500"), Some(61500));
        assert_eq!(parse_ffmpeg_time("01:01:01.250"), Some(3661250));

        // Test without milliseconds
        assert_eq!(parse_ffmpeg_time("00:00:05"), Some(5000));

        // Test invalid formats
        assert_eq!(parse_ffmpeg_time("invalid"), None);
        assert_eq!(parse_ffmpeg_time("00:00"), None);
    }
}
