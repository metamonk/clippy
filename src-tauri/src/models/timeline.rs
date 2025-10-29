use serde::{Deserialize, Serialize};

/// Audio track metadata for multi-audio clips (Story 4.7)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrack {
    /// Track index (0-based: 0 = first audio track, 1 = second, etc.)
    pub track_index: u32,

    /// Human-readable label (e.g., "System Audio", "Microphone", "Webcam")
    pub label: String,

    /// Volume level for this track (0.0 to 1.0)
    pub volume: f64,

    /// Whether this track is muted
    pub muted: bool,
}

/// Timeline clip representation
/// All timestamps are in MILLISECONDS (ADR-005)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    /// Unique identifier (UUID)
    pub id: String,

    /// Absolute path to media file
    pub file_path: String,

    /// Position on timeline in milliseconds
    pub start_time: u64,

    /// Total clip duration in milliseconds
    pub duration: u64,

    /// Trim start point in milliseconds (default 0)
    pub trim_in: u64,

    /// Trim end point in milliseconds (default duration)
    pub trim_out: u64,

    /// Audio fade-in duration in milliseconds (Story 3.10)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fade_in: Option<u64>,

    /// Audio fade-out duration in milliseconds (Story 3.10)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fade_out: Option<u64>,

    /// Volume level (0.0 to 1.0, Story 3.9)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume: Option<f64>,

    /// Whether clip is muted (Story 3.9)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub muted: Option<bool>,

    /// Multiple audio tracks for PiP recordings (Story 4.7)
    /// Each track can be independently muted/volume controlled
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_tracks: Option<Vec<AudioTrack>>,
}

/// Track containing ordered clips
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    /// Unique identifier (UUID)
    pub id: String,

    /// Ordered clips on track
    pub clips: Vec<Clip>,

    /// Track type (video or audio)
    pub track_type: TrackType,
}

/// Track type enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TrackType {
    Video,
    Audio,
}

/// Timeline containing tracks
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timeline {
    /// All tracks in timeline
    pub tracks: Vec<Track>,

    /// Total duration calculated from clips in milliseconds
    pub total_duration: u64,
}

impl Timeline {
    /// Get all video tracks
    pub fn video_tracks(&self) -> impl Iterator<Item = &Track> {
        self.tracks.iter().filter(|t| t.track_type == TrackType::Video)
    }

    /// Get all audio tracks
    pub fn audio_tracks(&self) -> impl Iterator<Item = &Track> {
        self.tracks.iter().filter(|t| t.track_type == TrackType::Audio)
    }

    /// Convert milliseconds to FFmpeg time format (HH:MM:SS.mmm)
    pub fn ms_to_ffmpeg_time(ms: u64) -> String {
        let total_seconds = ms / 1000;
        let milliseconds = ms % 1000;
        let hours = total_seconds / 3600;
        let minutes = (total_seconds % 3600) / 60;
        let seconds = total_seconds % 60;

        format!("{:02}:{:02}:{:02}.{:03}", hours, minutes, seconds, milliseconds)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ms_to_ffmpeg_time() {
        assert_eq!(Timeline::ms_to_ffmpeg_time(0), "00:00:00.000");
        assert_eq!(Timeline::ms_to_ffmpeg_time(1000), "00:00:01.000");
        assert_eq!(Timeline::ms_to_ffmpeg_time(61500), "00:01:01.500");
        assert_eq!(Timeline::ms_to_ffmpeg_time(3661250), "01:01:01.250");
    }

    #[test]
    fn test_timeline_filters() {
        let timeline = Timeline {
            tracks: vec![
                Track {
                    id: "1".to_string(),
                    clips: vec![],
                    track_type: TrackType::Video,
                },
                Track {
                    id: "2".to_string(),
                    clips: vec![],
                    track_type: TrackType::Audio,
                },
                Track {
                    id: "3".to_string(),
                    clips: vec![],
                    track_type: TrackType::Video,
                },
            ],
            total_duration: 0,
        };

        assert_eq!(timeline.video_tracks().count(), 2);
        assert_eq!(timeline.audio_tracks().count(), 1);
    }

    #[test]
    fn test_4_7_unit_003_audio_track_serialization() {
        // Create clip with 3 audio tracks (Story 4.7)
        let audio_tracks = vec![
            AudioTrack {
                track_index: 0,
                label: "System Audio".to_string(),
                volume: 1.0,
                muted: false,
            },
            AudioTrack {
                track_index: 1,
                label: "Microphone".to_string(),
                volume: 0.8,
                muted: false,
            },
            AudioTrack {
                track_index: 2,
                label: "Webcam".to_string(),
                volume: 0.6,
                muted: true,
            },
        ];

        let clip = Clip {
            id: "test-clip-001".to_string(),
            file_path: "/path/to/recording.mp4".to_string(),
            start_time: 0,
            duration: 5000,
            trim_in: 0,
            trim_out: 5000,
            fade_in: None,
            fade_out: None,
            volume: Some(1.0),
            muted: Some(false),
            audio_tracks: Some(audio_tracks),
        };

        // Serialize to JSON
        let json = serde_json::to_string(&clip).expect("Failed to serialize");

        // Verify JSON contains audio tracks
        assert!(json.contains("audioTracks"));
        assert!(json.contains("System Audio"));
        assert!(json.contains("Microphone"));
        assert!(json.contains("Webcam"));

        // Deserialize back
        let deserialized: Clip = serde_json::from_str(&json).expect("Failed to deserialize");

        // Verify fields match
        assert_eq!(deserialized.id, clip.id);
        assert_eq!(deserialized.audio_tracks.as_ref().unwrap().len(), 3);
        assert_eq!(deserialized.audio_tracks.as_ref().unwrap()[0].track_index, 0);
        assert_eq!(deserialized.audio_tracks.as_ref().unwrap()[0].label, "System Audio");
        assert_eq!(deserialized.audio_tracks.as_ref().unwrap()[1].volume, 0.8);
        assert_eq!(deserialized.audio_tracks.as_ref().unwrap()[2].muted, true);
    }

    #[test]
    fn test_4_7_unit_004_backward_compatibility() {
        // Test that Clip without audioTracks field can still be deserialized (Story 4.7)
        let json = r#"{
            "id": "old-clip-001",
            "filePath": "/path/to/old_recording.mp4",
            "startTime": 0,
            "duration": 3000,
            "trimIn": 0,
            "trimOut": 3000
        }"#;

        // Should deserialize successfully
        let clip: Clip = serde_json::from_str(json).expect("Failed to deserialize old format");

        // Verify basic fields work
        assert_eq!(clip.id, "old-clip-001");
        assert_eq!(clip.duration, 3000);

        // Verify audio_tracks is None (backward compatible)
        assert!(clip.audio_tracks.is_none());

        // Serialize back
        let serialized = serde_json::to_string(&clip).expect("Failed to serialize");

        // Verify audioTracks is not in JSON (skip_serializing_if works)
        assert!(!serialized.contains("audioTracks"));
    }
}
