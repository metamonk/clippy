//! Timeline Renderer for Full Timeline Pre-Rendering
//!
//! This module implements the TimelineRenderer for the Full Timeline Pre-Render architecture.
//! It generates FFmpeg commands to render the entire timeline to a single playable file.
//!
//! # Architecture
//!
//! The TimelineRenderer replaces the Hybrid Smart Segment Pre-Rendering approach with a simpler,
//! more reliable full timeline pre-render:
//!
//! 1. **On Play:** Render entire timeline to single temp file (cache based on timeline hash)
//! 2. **MPV Playback:** Load the pre-rendered file (1:1 time mapping, no offsets)
//! 3. **On Edit:** Invalidate cache, re-render on next play
//! 4. **On Export:** Use the same rendering pipeline
//!
//! # Key Features
//!
//! 1. **Full Timeline Rendering:** Entire timeline rendered to single file
//! 2. **Multi-Track Composition:** FFmpeg overlay filters for layered video
//! 3. **Sequential Clip Concat:** Within each track, clips are concatenated
//! 4. **Z-Index Layer Ordering:** Track 1 = bottom, Track N = top
//! 5. **Progress Updates:** Event-based progress reporting to frontend
//! 6. **Hash-Based Caching:** Avoid re-rendering unchanged timelines
//! 7. **Hardware Acceleration:** VideoToolbox on macOS
//!
//! # FFmpeg Pipeline Example
//!
//! ```bash
//! # Timeline with 2 tracks:
//! # Track 1 (bottom): clip1.mp4 (0-5s) + clip2.mp4 (5-10s)
//! # Track 2 (top): clip3.mp4 (3-8s)
//!
//! ffmpeg \
//!   -i clip1.mp4 -i clip2.mp4 -i clip3.mp4 \
//!   -filter_complex "\
//!     # Track 1: Concatenate clips
//!     [0:v]trim=0:5,setpts=PTS-STARTPTS[v0a]; \
//!     [1:v]trim=0:5,setpts=PTS-STARTPTS[v1a]; \
//!     [v0a][v1a]concat=n=2:v=1:a=0[track1]; \
//!     # Track 2: Trim to timeline range
//!     [2:v]trim=0:5,setpts=PTS-STARTPTS[track2]; \
//!     # Composite: Overlay track2 on track1
//!     [track1][track2]overlay=x=100:y=100:enable='between(t,3,8)'[vout] \
//!   " \
//!   -map "[vout]" timeline.mp4
//! ```

use crate::models::timeline::Timeline;
use anyhow::{anyhow, Context, Result};
use ffmpeg_sidecar::command::FfmpegCommand;
use ffmpeg_sidecar::event::{FfmpegEvent, LogLevel};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tracing::{debug, info, warn};

/// Canvas size for timeline output
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CanvasSize {
    pub width: u32,
    pub height: u32,
}

impl Default for CanvasSize {
    fn default() -> Self {
        Self {
            width: 1920,
            height: 1080,
        }
    }
}

/// Progress callback for rendering updates
pub type ProgressCallback = Arc<Mutex<dyn FnMut(f64) + Send + 'static>>;

/// Timeline renderer for full timeline pre-rendering
pub struct TimelineRenderer {
    /// Cache directory for pre-rendered timelines
    cache_dir: PathBuf,

    /// Canvas size (default 1920x1080)
    canvas_size: CanvasSize,
}

impl TimelineRenderer {
    /// Create a new timeline renderer
    ///
    /// # Arguments
    ///
    /// * `cache_dir` - Directory for storing pre-rendered timeline cache files
    pub fn new(cache_dir: PathBuf) -> Self {
        Self {
            cache_dir,
            canvas_size: CanvasSize::default(),
        }
    }

    /// Set custom canvas size for composition
    pub fn with_canvas_size(mut self, width: u32, height: u32) -> Self {
        self.canvas_size = CanvasSize { width, height };
        self
    }

    /// Generate cache key (hash) from timeline structure
    ///
    /// The hash includes:
    /// - All clip file paths
    /// - All clip trim points (trim_in, trim_out)
    /// - All clip positions on timeline (start_time)
    /// - All track numbers
    /// - Canvas size
    ///
    /// If any of these change, the cache is invalidated.
    fn generate_cache_key(&self, timeline: &Timeline) -> Result<String> {
        let mut hasher = DefaultHasher::new();

        // Hash canvas size
        self.canvas_size.width.hash(&mut hasher);
        self.canvas_size.height.hash(&mut hasher);

        // Hash all tracks and clips
        for track in &timeline.tracks {
            track.id.hash(&mut hasher);
            track.track_number.hash(&mut hasher);
            track.track_type.hash(&mut hasher);

            for clip in &track.clips {
                clip.id.hash(&mut hasher);
                clip.file_path.hash(&mut hasher);
                clip.start_time.hash(&mut hasher);
                clip.trim_in.hash(&mut hasher);
                clip.trim_out.hash(&mut hasher);

                // Hash transform if present
                if let Some(ref transform) = clip.transform {
                    transform.x.to_bits().hash(&mut hasher);
                    transform.y.to_bits().hash(&mut hasher);
                    transform.width.to_bits().hash(&mut hasher);
                    transform.height.to_bits().hash(&mut hasher);
                    transform.opacity.to_bits().hash(&mut hasher);
                }
            }
        }

        let hash = hasher.finish();
        Ok(format!("timeline_{:x}", hash))
    }

    /// Build FFmpeg filter_complex for timeline rendering
    ///
    /// This generates a complex filter that:
    /// 1. Creates a black background for the full timeline duration
    /// 2. Overlays each clip at its exact timeline position
    ///
    /// # Arguments
    ///
    /// * `timeline` - Timeline to render
    /// * `input_map` - Map from (track_number, clip_index) to FFmpeg input index
    ///
    /// # Returns
    ///
    /// FFmpeg filter_complex string
    fn generate_filter_complex(
        &self,
        timeline: &Timeline,
        input_map: &std::collections::HashMap<(u32, usize), usize>,
    ) -> Result<String> {
        let video_tracks: Vec<_> = timeline
            .video_tracks()
            .collect();

        if video_tracks.is_empty() {
            return Err(anyhow!("Timeline has no video tracks"));
        }

        let mut filter_parts = Vec::new();

        // Step 1: Create black background for full timeline duration
        let duration_seconds = timeline.total_duration as f64 / 1000.0;
        filter_parts.push(format!(
            "color=black:s={}x{}:d={}:r=30[bg]",
            self.canvas_size.width,
            self.canvas_size.height,
            duration_seconds
        ));

        // Step 2: Prepare all clips (trim and scale)
        let mut clip_labels = Vec::new();

        for track in &video_tracks {
            for (clip_idx, clip) in track.clips.iter().enumerate() {
                let input_idx = input_map
                    .get(&(track.track_number, clip_idx))
                    .ok_or_else(|| {
                        anyhow!("Missing input index for track {} clip {}", track.track_number, clip_idx)
                    })?;

                let trim_start = clip.trim_in as f64 / 1000.0;
                let trim_duration = (clip.trim_out - clip.trim_in) as f64 / 1000.0;
                let clip_label = format!("t{}c{}", track.track_number, clip_idx);

                // Trim clip to its trim points and reset PTS
                if track.track_number == 1 {
                    // Bottom track: Scale to canvas with padding
                    filter_parts.push(format!(
                        "[{}:v]trim=start={}:duration={},setpts=PTS-STARTPTS,scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:black[{}]",
                        input_idx, trim_start, trim_duration,
                        self.canvas_size.width, self.canvas_size.height,
                        self.canvas_size.width, self.canvas_size.height,
                        clip_label
                    ));
                } else {
                    // Upper tracks: Scale for PiP
                    let pip_w = self.canvas_size.width / 2;
                    let pip_h = self.canvas_size.height / 2;
                    filter_parts.push(format!(
                        "[{}:v]trim=start={}:duration={},setpts=PTS-STARTPTS,scale={}:{}:force_original_aspect_ratio=decrease[{}]",
                        input_idx, trim_start, trim_duration, pip_w, pip_h, clip_label
                    ));
                }

                clip_labels.push((
                    clip_label,
                    clip.start_time as f64 / 1000.0,  // Timeline start time in seconds
                    trim_duration,  // Clip duration in seconds
                    track.track_number,
                ));
            }
        }

        // Step 3: Overlay clips onto background at their timeline positions
        // Sort by track number (bottom to top) for proper layering
        clip_labels.sort_by_key(|(_, _, _, track_num)| *track_num);

        let mut current_label = "bg".to_string();

        for (i, (clip_label, start_time, duration, track_num)) in clip_labels.iter().enumerate() {
            let end_time = start_time + duration;
            let output_label = if i == clip_labels.len() - 1 {
                "vout".to_string()
            } else {
                format!("tmp{}", i)
            };

            // Calculate overlay position (PiP positioning for upper tracks)
            let (x, y) = if *track_num == 1 {
                // Bottom track: centered (0, 0 works because it's same size as canvas)
                (0, 0)
            } else {
                // Upper tracks: top-right corner with margin
                let margin = 20;
                let pip_w = self.canvas_size.width / 2;
                (
                    (self.canvas_size.width - pip_w - margin) as i32,
                    margin as i32,
                )
            };

            // Overlay clip at its exact timeline position using enable parameter
            // enable='between(t,start,end)' shows the overlay only during that time range
            filter_parts.push(format!(
                "[{}][{}]overlay=x={}:y={}:enable='between(t,{},{})':shortest=0[{}]",
                current_label, clip_label, x, y, start_time, end_time, output_label
            ));

            current_label = output_label;
        }

        Ok(filter_parts.join("; "))
    }

    /// Build complete FFmpeg command for rendering the timeline
    ///
    /// # Arguments
    ///
    /// * `timeline` - Timeline to render
    /// * `output_path` - Path where rendered timeline will be saved
    ///
    /// # Returns
    ///
    /// (FfmpegCommand, expected_duration_seconds)
    fn build_ffmpeg_command(
        &self,
        timeline: &Timeline,
        output_path: &Path,
    ) -> Result<(FfmpegCommand, f64)> {
        let mut args = Vec::new();
        let mut input_map = std::collections::HashMap::new();
        let mut input_idx = 0;

        // Add input files for all clips across all video tracks
        for track in timeline.video_tracks() {
            for (clip_idx, clip) in track.clips.iter().enumerate() {
                args.push("-i".to_string());
                args.push(clip.file_path.clone());

                input_map.insert((track.track_number, clip_idx), input_idx);
                input_idx += 1;
            }
        }

        // Generate filter_complex
        let filter_complex = self.generate_filter_complex(timeline, &input_map)?;
        args.push("-filter_complex".to_string());
        args.push(filter_complex);
        args.push("-map".to_string());
        args.push("[vout]".to_string());

        // Hardware acceleration (macOS)
        #[cfg(target_os = "macos")]
        {
            args.push("-c:v".to_string());
            args.push("h264_videotoolbox".to_string());
            debug!("Using VideoToolbox hardware acceleration for timeline rendering");
        }

        // Fallback to software encoding on other platforms
        #[cfg(not(target_os = "macos"))]
        {
            args.push("-c:v".to_string());
            args.push("libx264".to_string());
            args.push("-preset".to_string());
            args.push("ultrafast".to_string());
        }

        // Limit thread count to prevent CPU saturation
        args.push("-threads".to_string());
        args.push("4".to_string());

        // Encoding settings for good quality
        args.push("-crf".to_string());
        args.push("23".to_string());

        // QuickTime/MPV compatibility
        args.push("-pix_fmt".to_string());
        args.push("yuv420p".to_string());
        args.push("-profile:v".to_string());
        args.push("high".to_string());
        args.push("-movflags".to_string());
        args.push("+faststart".to_string());

        // Output
        args.push("-f".to_string());
        args.push("mp4".to_string());
        args.push("-y".to_string());
        args.push(output_path.to_string_lossy().to_string());

        let mut command = FfmpegCommand::new();
        command.args(&args);

        // Calculate expected timeline duration for progress calculation
        let timeline_duration = timeline.total_duration as f64 / 1000.0; // Convert ms to seconds

        Ok((command, timeline_duration))
    }

    /// Render timeline to cache with progress updates
    ///
    /// # Arguments
    ///
    /// * `timeline` - Timeline to render
    /// * `progress_callback` - Optional callback for progress updates (0.0 to 1.0)
    ///
    /// # Returns
    ///
    /// Path to the cached timeline file
    pub fn render_timeline(
        &self,
        timeline: &Timeline,
        progress_callback: Option<ProgressCallback>,
    ) -> Result<PathBuf> {
        // Generate cache key from timeline hash
        let cache_key = self.generate_cache_key(timeline)?;
        let output_path = self.cache_dir.join(format!("{}.mp4", cache_key));

        // Check if cached file already exists
        if output_path.exists() {
            info!("Timeline cache hit: {}", output_path.display());
            if let Some(callback) = progress_callback {
                let mut cb = callback.lock().unwrap();
                cb(1.0); // Immediately report 100% if using cached file
            }
            return Ok(output_path);
        }

        info!("Rendering timeline to cache: {}", output_path.display());

        // Build FFmpeg command
        let (mut command, expected_duration) = self.build_ffmpeg_command(timeline, &output_path)?;

        debug!("Expected timeline duration: {}s", expected_duration);

        // Spawn FFmpeg process
        let mut child = command
            .spawn()
            .context("Failed to spawn FFmpeg for timeline rendering")?;

        // Monitor progress if callback provided
        if let Some(callback) = progress_callback {
            let mut last_progress = 0.0;

            // Iterate over FFmpeg events
            for event in child.iter()? {
                match event {
                    FfmpegEvent::Progress(progress) => {
                        // Calculate progress based on time
                        // FfmpegProgress has a `time` field which is a String (HH:MM:SS.mmm)
                        if let Ok(seconds) = parse_ffmpeg_time(&progress.time) {
                            let progress_ratio = if expected_duration > 0.0 {
                                (seconds / expected_duration).min(1.0)
                            } else {
                                0.0
                            };

                            // Only update if progress increased by at least 1%
                            if progress_ratio > last_progress + 0.01 {
                                let mut cb = callback.lock().unwrap();
                                cb(progress_ratio);
                                last_progress = progress_ratio;
                            }
                        }
                    }
                    FfmpegEvent::Log(LogLevel::Error, msg) => {
                        warn!("FFmpeg error: {}", msg);
                    }
                    _ => {}
                }
            }

            // Ensure 100% progress is reported
            let mut cb = callback.lock().unwrap();
            cb(1.0);
        } else {
            // No progress callback: just wait for completion
            child.wait()?;
        }

        // Verify output file was created
        if !output_path.exists() {
            return Err(anyhow!("Timeline rendering failed: output file not created"));
        }

        info!("Timeline rendering complete: {}", output_path.display());
        Ok(output_path)
    }

    /// Clear all cached timeline files
    pub fn clear_cache(&self) -> Result<()> {
        info!("Clearing timeline cache: {}", self.cache_dir.display());

        if !self.cache_dir.exists() {
            return Ok(());
        }

        for entry in std::fs::read_dir(&self.cache_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("mp4") {
                if let Some(file_name) = path.file_name().and_then(|s| s.to_str()) {
                    if file_name.starts_with("timeline_") {
                        debug!("Deleting cached timeline: {}", path.display());
                        std::fs::remove_file(&path)?;
                    }
                }
            }
        }

        Ok(())
    }
}

/// Parse FFmpeg time string (HH:MM:SS.mmm) to seconds
fn parse_ffmpeg_time(time_str: &str) -> Result<f64> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 3 {
        return Err(anyhow!("Invalid time format: {}", time_str));
    }

    let hours: f64 = parts[0].parse()?;
    let minutes: f64 = parts[1].parse()?;
    let seconds: f64 = parts[2].parse()?;

    Ok(hours * 3600.0 + minutes * 60.0 + seconds)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ffmpeg_time() {
        assert_eq!(parse_ffmpeg_time("00:00:05.123").unwrap(), 5.123);
        assert_eq!(parse_ffmpeg_time("00:01:30.500").unwrap(), 90.5);
        assert_eq!(parse_ffmpeg_time("01:30:45.000").unwrap(), 5445.0);
    }

    #[test]
    fn test_cache_key_generation() {
        let temp_dir = std::env::temp_dir();
        let renderer = TimelineRenderer::new(temp_dir);

        // Create test timeline
        let timeline = Timeline::new("test".to_string());

        let key1 = renderer.generate_cache_key(&timeline).unwrap();
        let key2 = renderer.generate_cache_key(&timeline).unwrap();

        // Same timeline should produce same key
        assert_eq!(key1, key2);
    }
}
