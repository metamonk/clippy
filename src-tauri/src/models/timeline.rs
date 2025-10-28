use serde::{Deserialize, Serialize};

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
}
