//! Composition playback test helper for parity validation
//!
//! This module provides a Rust-side helper for testing composition playback
//! by mimicking the frontend compositionStore logic and using MPV for rendering.

use crate::models::timeline::{Clip, Timeline, Track, TrackType};
use crate::services::mpv_player::MpvPlayer;
use anyhow::{Context, Result};
use std::path::Path;

/// Active clip with track context (mirrors frontend ActiveClip interface)
#[derive(Debug, Clone)]
pub struct ActiveClip {
    pub clip: Clip,
    pub track_id: String,
    pub track_type: TrackType,
    pub relative_time: u64,
}

/// Composition playback helper for integration tests
///
/// This struct mimics the frontend composition system (compositionStore + VideoPlayer)
/// for testing purposes.
pub struct CompositionPlaybackHelper {
    timeline: Timeline,
    mpv_player: MpvPlayer,
}

impl CompositionPlaybackHelper {
    /// Create a new composition playback helper
    pub fn new(timeline: Timeline) -> Result<Self> {
        let mpv_player = MpvPlayer::new()
            .context("Failed to initialize MPV player for composition playback")?;

        Ok(Self {
            timeline,
            mpv_player,
        })
    }

    /// Get active clips at a specific timeline time
    ///
    /// Mirrors the frontend `compositionStore.getActiveClipsAtTime()` logic
    pub fn get_active_clips_at_time(&self, time_ms: u64) -> Vec<ActiveClip> {
        let mut active_clips = Vec::new();

        for track in &self.timeline.tracks {
            for clip in &track.clips {
                let clip_start = clip.start_time;
                let clip_duration = clip.trim_out - clip.trim_in;
                let clip_end = clip_start + clip_duration;

                // Inclusive start, exclusive end
                if time_ms >= clip_start && time_ms < clip_end {
                    let relative_time = time_ms - clip_start;

                    active_clips.push(ActiveClip {
                        clip: clip.clone(),
                        track_id: track.id.clone(),
                        track_type: track.track_type.clone(),
                        relative_time,
                    });
                }
            }
        }

        active_clips
    }

    /// Get active video clips at a specific time
    pub fn get_active_video_clips(&self, time_ms: u64) -> Vec<ActiveClip> {
        self.get_active_clips_at_time(time_ms)
            .into_iter()
            .filter(|ac| ac.track_type == TrackType::Video)
            .collect()
    }

    /// Capture a frame at a specific timeline timestamp
    ///
    /// This method:
    /// 1. Finds the active video clip at the given time
    /// 2. Loads the clip into MPV
    /// 3. Seeks to the clip-relative position
    /// 4. Captures the frame
    /// 5. Saves it to the output path
    pub fn capture_frame_at(&mut self, time_ms: u64, output_path: &Path) -> Result<()> {
        // Find active video clip at this time
        let video_clips = self.get_active_video_clips(time_ms);

        if video_clips.is_empty() {
            // No video clip at this time - render black frame (gap handling)
            return self.render_black_frame(output_path);
        }

        // For single-track testing, use the first video clip
        // For multi-track, this will need compositing (Story 5.6)
        let active_clip = &video_clips[0];

        // Load the clip file into MPV
        self.mpv_player
            .load_file(&active_clip.clip.file_path)
            .context("Failed to load clip file")?;

        // Start playback to ensure file is loaded (then immediately pause)
        self.mpv_player.play().ok();
        std::thread::sleep(std::time::Duration::from_millis(200));
        self.mpv_player.pause().ok();

        // Calculate the seek position within the clip
        // relative_time is offset from clip start on timeline
        // Need to add trim_in to get actual position in source file
        let seek_position_ms = active_clip.clip.trim_in + active_clip.relative_time;
        let seek_position_sec = seek_position_ms as f64 / 1000.0;

        eprintln!("[CompositionPlayback] Seeking in file '{}' to {:.3}s ({}ms)",
                 active_clip.clip.file_path, seek_position_sec, seek_position_ms);
        eprintln!("[CompositionPlayback]   trim_in={}, relative_time={}",
                 active_clip.clip.trim_in, active_clip.relative_time);

        // Seek to the position in the clip
        self.mpv_player
            .seek(seek_position_sec)
            .context("Failed to seek to position")?;

        // Wait for MPV to decode the frame at the seek position
        std::thread::sleep(std::time::Duration::from_millis(300));

        // Capture the frame (retry a few times if needed)
        let mut last_error = None;
        for attempt in 0..3 {
            match self.mpv_player.capture_frame() {
                Ok(frame_data) => {
                    // Save to output path
                    std::fs::write(output_path, frame_data)
                        .with_context(|| format!("Failed to write frame to {}", output_path.display()))?;
                    return Ok(());
                }
                Err(e) => {
                    last_error = Some(e);
                    if attempt < 2 {
                        // Wait a bit longer and try again
                        std::thread::sleep(std::time::Duration::from_millis(200));
                    }
                }
            }
        }

        // If all retries failed, return the last error
        Err(last_error.unwrap()).context("Failed to capture frame after 3 attempts")
    }

    /// Render a black frame for gap handling
    ///
    /// When there are no clips at a given time, we should render a black frame
    /// to match the export behavior (Story 5.4)
    fn render_black_frame(&self, output_path: &Path) -> Result<()> {
        // Create a 1280x720 black image using the image crate
        let img = image::RgbImage::from_pixel(1280, 720, image::Rgb([0, 0, 0]));

        img.save(output_path)
            .with_context(|| format!("Failed to save black frame to {}", output_path.display()))?;

        Ok(())
    }

    /// Check if there's a gap (no clips) at the given time
    pub fn is_gap(&self, time_ms: u64) -> bool {
        self.get_active_clips_at_time(time_ms).is_empty()
    }
}

impl Drop for CompositionPlaybackHelper {
    fn drop(&mut self) {
        // Stop MPV player on cleanup
        let _ = self.mpv_player.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::timeline::{Clip, Timeline, Track, TrackType};
    use uuid::Uuid;

    fn create_test_clip(file_path: &str, start_time: u64, duration: u64) -> Clip {
        Clip {
            id: Uuid::new_v4().to_string(),
            file_path: file_path.to_string(),
            start_time,
            duration,
            trim_in: 0,
            trim_out: duration,
            fade_in: None,
            fade_out: None,
            volume: None,
            muted: None,
            audio_tracks: None,
            transform: None,
        }
    }

    #[test]
    fn test_get_active_clips_at_time() {
        let clip1 = create_test_clip("video1.mp4", 0, 5000);
        let clip2 = create_test_clip("video2.mp4", 5000, 5000);
        let clip3 = create_test_clip("video3.mp4", 10000, 5000);

        let timeline = Timeline {
            tracks: vec![Track {
                id: Uuid::new_v4().to_string(),
                track_number: 1,
                clips: vec![clip1, clip2, clip3],
                track_type: TrackType::Video,
            }],
            total_duration: 15000,
        };

        let helper = CompositionPlaybackHelper::new(timeline).unwrap();

        // Test clip 1 (0-5000ms)
        let active = helper.get_active_clips_at_time(2500);
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].relative_time, 2500);

        // Test clip 2 (5000-10000ms)
        let active = helper.get_active_clips_at_time(7500);
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].relative_time, 2500);

        // Test boundary (exactly at clip start)
        let active = helper.get_active_clips_at_time(5000);
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].relative_time, 0);

        // Test boundary (at clip end - should return next clip)
        let active = helper.get_active_clips_at_time(10000);
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].relative_time, 0);
    }

    #[test]
    fn test_is_gap() {
        let clip1 = create_test_clip("video1.mp4", 0, 5000);
        let clip2 = create_test_clip("video2.mp4", 7000, 5000); // Gap from 5000-7000

        let timeline = Timeline {
            tracks: vec![Track {
                id: Uuid::new_v4().to_string(),
                track_number: 1,
                clips: vec![clip1, clip2],
                track_type: TrackType::Video,
            }],
            total_duration: 12000,
        };

        let helper = CompositionPlaybackHelper::new(timeline).unwrap();

        // Should not be gap
        assert!(!helper.is_gap(2500));
        assert!(!helper.is_gap(8000));

        // Should be gap
        assert!(helper.is_gap(6000));
        assert!(helper.is_gap(5500));
    }
}
