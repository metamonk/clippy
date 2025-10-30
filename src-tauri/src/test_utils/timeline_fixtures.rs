//! Timeline fixture utilities for parity validation tests
//!
//! Provides builders for creating test timeline configurations.

use crate::models::timeline::{AudioTrack, Clip, ClipTransform, Timeline, Track, TrackType};
use anyhow::{Context, Result};
use std::path::Path;
use uuid::Uuid;

/// Builder for creating test timeline fixtures
pub struct TimelineFixtureBuilder {
    tracks: Vec<Track>,
    total_duration: u64,
}

impl TimelineFixtureBuilder {
    /// Create a new timeline fixture builder
    pub fn new() -> Self {
        Self {
            tracks: Vec::new(),
            total_duration: 0,
        }
    }

    /// Add a video track to the timeline
    pub fn add_video_track(mut self, clips: Vec<Clip>) -> Self {
        // Update total duration based on clips
        for clip in &clips {
            let clip_end = clip.start_time + clip.duration;
            if clip_end > self.total_duration {
                self.total_duration = clip_end;
            }
        }

        let track_number = (self.tracks.iter().filter(|t| t.track_type == TrackType::Video).count() + 1) as u32;
        self.tracks.push(Track {
            id: Uuid::new_v4().to_string(),
            track_number,
            clips,
            track_type: TrackType::Video,
        });
        self
    }

    /// Add an audio track to the timeline
    pub fn add_audio_track(mut self, clips: Vec<Clip>) -> Self {
        // Update total duration based on clips
        for clip in &clips {
            let clip_end = clip.start_time + clip.duration;
            if clip_end > self.total_duration {
                self.total_duration = clip_end;
            }
        }

        let track_number = (self.tracks.iter().filter(|t| t.track_type == TrackType::Audio).count() + 1) as u32;
        self.tracks.push(Track {
            id: Uuid::new_v4().to_string(),
            track_number,
            clips,
            track_type: TrackType::Audio,
        });
        self
    }

    /// Build the timeline
    pub fn build(self) -> Timeline {
        Timeline {
            tracks: self.tracks,
            total_duration: self.total_duration,
        }
    }
}

impl Default for TimelineFixtureBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Builder for creating test clips
pub struct ClipBuilder {
    id: String,
    file_path: String,
    start_time: u64,
    duration: u64,
    trim_in: u64,
    trim_out: u64,
    fade_in: Option<u64>,
    fade_out: Option<u64>,
    volume: Option<f64>,
    muted: Option<bool>,
    audio_tracks: Option<Vec<AudioTrack>>,
    transform: Option<ClipTransform>,
}

impl ClipBuilder {
    /// Create a new clip builder
    pub fn new(file_path: impl Into<String>, start_time: u64, duration: u64) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            file_path: file_path.into(),
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

    /// Set trim points
    pub fn with_trim(mut self, trim_in: u64, trim_out: u64) -> Self {
        self.trim_in = trim_in;
        self.trim_out = trim_out;
        self
    }

    /// Set fade-in duration
    pub fn with_fade_in(mut self, fade_in: u64) -> Self {
        self.fade_in = Some(fade_in);
        self
    }

    /// Set fade-out duration
    pub fn with_fade_out(mut self, fade_out: u64) -> Self {
        self.fade_out = Some(fade_out);
        self
    }

    /// Set volume
    pub fn with_volume(mut self, volume: f64) -> Self {
        self.volume = Some(volume);
        self
    }

    /// Set muted state
    pub fn with_muted(mut self, muted: bool) -> Self {
        self.muted = Some(muted);
        self
    }

    /// Add audio tracks (for PiP recordings)
    pub fn with_audio_tracks(mut self, audio_tracks: Vec<AudioTrack>) -> Self {
        self.audio_tracks = Some(audio_tracks);
        self
    }

    /// Add transform (for PiP positioning)
    pub fn with_transform(mut self, transform: ClipTransform) -> Self {
        self.transform = Some(transform);
        self
    }

    /// Build the clip
    pub fn build(self) -> Clip {
        Clip {
            id: self.id,
            file_path: self.file_path,
            start_time: self.start_time,
            duration: self.duration,
            trim_in: self.trim_in,
            trim_out: self.trim_out,
            fade_in: self.fade_in,
            fade_out: self.fade_out,
            volume: self.volume,
            muted: self.muted,
            audio_tracks: self.audio_tracks,
            transform: self.transform,
        }
    }
}

/// Create a single-track timeline fixture with 3 consecutive clips
///
/// This is the simplest timeline configuration for parity testing.
pub fn create_single_track_timeline(
    clip1_path: impl Into<String>,
    clip2_path: impl Into<String>,
    clip3_path: impl Into<String>,
    clip_duration_ms: u64,
) -> Timeline {
    let clip1 = ClipBuilder::new(clip1_path, 0, clip_duration_ms).build();
    let clip2 = ClipBuilder::new(clip2_path, clip_duration_ms, clip_duration_ms).build();
    let clip3 = ClipBuilder::new(clip3_path, clip_duration_ms * 2, clip_duration_ms).build();

    TimelineFixtureBuilder::new()
        .add_video_track(vec![clip1, clip2, clip3])
        .build()
}

/// Create a multi-track timeline fixture with 2 video + 2 audio tracks
///
/// This tests complex composition with multiple video and audio tracks.
pub fn create_multi_track_timeline(
    video1_path: impl Into<String>,
    video2_path: impl Into<String>,
    audio1_path: impl Into<String>,
    audio2_path: impl Into<String>,
    clip_duration_ms: u64,
) -> Timeline {
    // Video track 1: main footage
    let video_clip1 = ClipBuilder::new(video1_path, 0, clip_duration_ms).build();

    // Video track 2: PiP overlay (smaller, positioned in corner)
    let video_clip2 = ClipBuilder::new(video2_path, 0, clip_duration_ms)
        .with_transform(ClipTransform {
            x: 10.0,
            y: 10.0,
            width: 320.0,
            height: 180.0,
            opacity: 1.0,
        })
        .build();

    // Audio track 1: main audio
    let audio_clip1 = ClipBuilder::new(audio1_path, 0, clip_duration_ms)
        .with_volume(1.0)
        .build();

    // Audio track 2: background music
    let audio_clip2 = ClipBuilder::new(audio2_path, 0, clip_duration_ms)
        .with_volume(0.3)
        .build();

    TimelineFixtureBuilder::new()
        .add_video_track(vec![video_clip1])
        .add_video_track(vec![video_clip2])
        .add_audio_track(vec![audio_clip1])
        .add_audio_track(vec![audio_clip2])
        .build()
}

/// Create a timeline with gaps between clips
///
/// This tests black frame handling when there are spaces between clips.
pub fn create_timeline_with_gaps(
    clip1_path: impl Into<String>,
    clip2_path: impl Into<String>,
    clip3_path: impl Into<String>,
    clip_duration_ms: u64,
    gap_duration_ms: u64,
) -> Timeline {
    let clip1 = ClipBuilder::new(clip1_path, 0, clip_duration_ms).build();

    let clip2 = ClipBuilder::new(
        clip2_path,
        clip_duration_ms + gap_duration_ms,
        clip_duration_ms,
    )
    .build();

    let clip3 = ClipBuilder::new(
        clip3_path,
        (clip_duration_ms * 2) + (gap_duration_ms * 2),
        clip_duration_ms,
    )
    .build();

    TimelineFixtureBuilder::new()
        .add_video_track(vec![clip1, clip2, clip3])
        .build()
}

/// Save a timeline fixture to JSON file
pub fn save_timeline_fixture(timeline: &Timeline, output_path: &Path) -> Result<()> {
    let json = serde_json::to_string_pretty(timeline)
        .context("Failed to serialize timeline to JSON")?;

    std::fs::write(output_path, json)
        .with_context(|| format!("Failed to write timeline to {}", output_path.display()))?;

    Ok(())
}

/// Load a timeline fixture from JSON file
pub fn load_timeline_fixture(input_path: &Path) -> Result<Timeline> {
    let json = std::fs::read_to_string(input_path)
        .with_context(|| format!("Failed to read timeline from {}", input_path.display()))?;

    serde_json::from_str(&json).context("Failed to deserialize timeline from JSON")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clip_builder() {
        let clip = ClipBuilder::new("test.mp4", 0, 5000)
            .with_volume(0.8)
            .with_fade_in(500)
            .build();

        assert_eq!(clip.file_path, "test.mp4");
        assert_eq!(clip.start_time, 0);
        assert_eq!(clip.duration, 5000);
        assert_eq!(clip.volume, Some(0.8));
        assert_eq!(clip.fade_in, Some(500));
    }

    #[test]
    fn test_single_track_timeline() {
        let timeline = create_single_track_timeline("a.mp4", "b.mp4", "c.mp4", 5000);

        assert_eq!(timeline.tracks.len(), 1);
        assert_eq!(timeline.tracks[0].clips.len(), 3);
        assert_eq!(timeline.total_duration, 15000);
        assert_eq!(timeline.tracks[0].track_type, TrackType::Video);
    }

    #[test]
    fn test_timeline_with_gaps() {
        let timeline = create_timeline_with_gaps("a.mp4", "b.mp4", "c.mp4", 5000, 2000);

        assert_eq!(timeline.tracks.len(), 1);
        assert_eq!(timeline.tracks[0].clips.len(), 3);

        // Check clip positions with gaps
        assert_eq!(timeline.tracks[0].clips[0].start_time, 0);
        assert_eq!(timeline.tracks[0].clips[1].start_time, 7000); // 5000 + 2000
        assert_eq!(timeline.tracks[0].clips[2].start_time, 14000); // (5000 * 2) + (2000 * 2)
    }
}
