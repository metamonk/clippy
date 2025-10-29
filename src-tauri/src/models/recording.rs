//! Recording configuration and window models
//!
//! This module provides types for recording configuration (Story 4.1),
//! including screen recording mode and window selection, and multi-audio
//! track recording architecture (Story 4.3).

use serde::{Deserialize, Serialize};

/// Audio source type for multi-track recording (Story 4.3)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioSource {
    /// System audio (from ScreenCaptureKit)
    System,
    /// Microphone audio (from CoreAudio/CPAL)
    Microphone,
    /// Webcam microphone (future: Story 4.6+)
    Webcam,
}

/// Audio track metadata for multi-track recording (Story 4.3)
///
/// Represents a single audio track in a multi-track recording.
/// Each track has a unique ID, source type, and optional sync offset for A/V alignment.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrack {
    /// Track ID (1 for Track 1, 2 for Track 2, etc.)
    pub track_id: u32,

    /// Audio source type
    pub source: AudioSource,

    /// Optional sync offset in milliseconds (positive = audio ahead, negative = audio behind)
    /// Used for manual synchronization correction if needed
    #[serde(default)]
    pub sync_offset: i64,

    /// Optional human-readable label (e.g., "System Audio", "Microphone")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Recording mode for capture type (Story 4.6)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecordingMode {
    /// Screen-only recording
    Screen,
    /// Webcam-only recording
    Webcam,
    /// Picture-in-Picture: screen + webcam overlay (Story 4.6)
    Pip,
}

impl Default for RecordingMode {
    fn default() -> Self {
        Self::Screen
    }
}

/// Screen recording mode for window selection (Story 4.1)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScreenRecordingMode {
    /// Full screen recording (default)
    Fullscreen,
    /// Specific window recording
    Window,
}

impl Default for ScreenRecordingMode {
    fn default() -> Self {
        Self::Fullscreen
    }
}

/// PiP position in pixels (Story 4.5)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipPosition {
    /// X coordinate in pixels
    pub x: i32,
    /// Y coordinate in pixels
    pub y: i32,
}

/// PiP size in pixels (Story 4.5)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipSize {
    /// Width in pixels
    pub width: u32,
    /// Height in pixels
    pub height: u32,
}

/// Recording configuration (Story 4.2, extended in Story 4.3 for multi-track, Story 4.5 for PiP, Story 4.6 for recording mode)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingConfig {
    /// Recording mode: screen, webcam, or pip (Story 4.6)
    #[serde(default)]
    pub mode: RecordingMode,

    /// Frame rate in FPS (30 or 60)
    #[serde(default = "default_frame_rate")]
    pub frame_rate: u32,

    /// Resolution (source, 1080p, 720p)
    #[serde(default = "default_resolution")]
    pub resolution: String,

    /// Enable system audio capture
    #[serde(default = "default_true")]
    pub system_audio: bool,

    /// Enable microphone capture
    #[serde(default)]
    pub microphone: bool,

    /// Screen recording mode (fullscreen or window) from Story 4.1
    #[serde(default)]
    pub screen_recording_mode: ScreenRecordingMode,

    /// Selected window ID for window mode (optional) from Story 4.1
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_window_id: Option<u32>,

    /// Audio tracks configuration (Story 4.3 - multi-track recording)
    /// Populated during recording based on enabled audio sources
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub audio_tracks: Vec<AudioTrack>,

    /// PiP position in pixels (Story 4.5)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pip_position: Option<PipPosition>,

    /// PiP size in pixels (Story 4.5)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pip_size: Option<PipSize>,
}

fn default_frame_rate() -> u32 {
    30
}

fn default_resolution() -> String {
    "1080p".to_string()
}

fn default_true() -> bool {
    true
}

impl Default for RecordingConfig {
    fn default() -> Self {
        Self {
            mode: RecordingMode::default(),
            frame_rate: 30,
            resolution: "1080p".to_string(),
            system_audio: true,
            microphone: false,
            screen_recording_mode: ScreenRecordingMode::default(),
            selected_window_id: None,
            audio_tracks: Vec::new(),
            pip_position: None,
            pip_size: None,
        }
    }
}

/// Window information from ScreenCaptureKit
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    /// Window ID from ScreenCaptureKit
    pub window_id: u32,

    /// Application name that owns the window
    pub owner_name: String,

    /// Window title
    pub title: String,

    /// Whether window is currently visible on screen
    pub is_on_screen: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_screen_recording_mode_default() {
        assert_eq!(
            ScreenRecordingMode::default(),
            ScreenRecordingMode::Fullscreen
        );
    }

    #[test]
    fn test_recording_config_default() {
        let config = RecordingConfig::default();
        assert_eq!(config.mode, RecordingMode::Screen);
        assert_eq!(config.frame_rate, 30);
        assert_eq!(config.resolution, "1080p");
        assert_eq!(config.system_audio, true);
        assert_eq!(config.microphone, false);
        assert_eq!(
            config.screen_recording_mode,
            ScreenRecordingMode::Fullscreen
        );
        assert_eq!(config.selected_window_id, None);
    }

    #[test]
    fn test_recording_config_serialization() {
        let config = RecordingConfig {
            mode: RecordingMode::Screen,
            frame_rate: 60,
            resolution: "source".to_string(),
            system_audio: false,
            microphone: true,
            screen_recording_mode: ScreenRecordingMode::Window,
            selected_window_id: Some(12345),
            audio_tracks: Vec::new(),
            pip_position: None,
            pip_size: None,
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("\"mode\":\"screen\""));
        assert!(json.contains("\"frameRate\":60"));
        assert!(json.contains("\"resolution\":\"source\""));
        assert!(json.contains("\"systemAudio\":false"));
        assert!(json.contains("\"microphone\":true"));
        assert!(json.contains("\"screenRecordingMode\":\"window\""));
        assert!(json.contains("\"selectedWindowId\":12345"));
    }

    #[test]
    fn test_recording_config_deserialization() {
        let json = r#"{
            "mode": "screen",
            "frameRate": 30,
            "resolution": "720p",
            "systemAudio": true,
            "microphone": false,
            "screenRecordingMode": "fullscreen"
        }"#;

        let config: RecordingConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.mode, RecordingMode::Screen);
        assert_eq!(config.frame_rate, 30);
        assert_eq!(config.resolution, "720p");
        assert_eq!(config.system_audio, true);
        assert_eq!(config.microphone, false);
        assert_eq!(
            config.screen_recording_mode,
            ScreenRecordingMode::Fullscreen
        );
        assert_eq!(config.selected_window_id, None);
    }

    #[test]
    fn test_window_info_serialization() {
        let window = WindowInfo {
            window_id: 42,
            owner_name: "Safari".to_string(),
            title: "Test Window".to_string(),
            is_on_screen: true,
        };

        let json = serde_json::to_string(&window).unwrap();
        assert!(json.contains("\"windowId\":42"));
        assert!(json.contains("\"ownerName\":\"Safari\""));
        assert!(json.contains("\"title\":\"Test Window\""));
        assert!(json.contains("\"isOnScreen\":true"));
    }

    // Story 4.3: Multi-Audio Track Recording Architecture Tests
    // AC#6: Audio track architecture future-ready for additional sources

    #[test]
    fn test_4_3_unit_001_audio_source_enum_serialization() {
        // Test system audio source
        let system = AudioSource::System;
        let json = serde_json::to_string(&system).unwrap();
        assert_eq!(json, "\"system\"");

        // Test microphone source
        let mic = AudioSource::Microphone;
        let json = serde_json::to_string(&mic).unwrap();
        assert_eq!(json, "\"microphone\"");

        // Test webcam source (future)
        let webcam = AudioSource::Webcam;
        let json = serde_json::to_string(&webcam).unwrap();
        assert_eq!(json, "\"webcam\"");
    }

    #[test]
    fn test_4_3_unit_002_audio_track_creation_and_serialization() {
        let track = AudioTrack {
            track_id: 1,
            source: AudioSource::System,
            sync_offset: 0,
            label: Some("System Audio".to_string()),
        };

        let json = serde_json::to_string(&track).unwrap();
        assert!(json.contains("\"trackId\":1"));
        assert!(json.contains("\"source\":\"system\""));
        assert!(json.contains("\"syncOffset\":0"));
        assert!(json.contains("\"label\":\"System Audio\""));
    }

    #[test]
    fn test_4_3_unit_003_audio_track_deserialization() {
        let json = r#"{
            "trackId": 2,
            "source": "microphone",
            "syncOffset": -10,
            "label": "Microphone"
        }"#;

        let track: AudioTrack = serde_json::from_str(json).unwrap();
        assert_eq!(track.track_id, 2);
        assert_eq!(track.source, AudioSource::Microphone);
        assert_eq!(track.sync_offset, -10);
        assert_eq!(track.label, Some("Microphone".to_string()));
    }

    #[test]
    fn test_4_3_unit_004_recording_config_with_audio_tracks() {
        let mut config = RecordingConfig::default();

        // Add two audio tracks
        config.audio_tracks.push(AudioTrack {
            track_id: 1,
            source: AudioSource::System,
            sync_offset: 0,
            label: Some("System".to_string()),
        });

        config.audio_tracks.push(AudioTrack {
            track_id: 2,
            source: AudioSource::Microphone,
            sync_offset: 0,
            label: Some("Microphone".to_string()),
        });

        // Serialize and verify
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("\"audioTracks\""));
        assert!(json.contains("\"system\""));
        assert!(json.contains("\"microphone\""));
    }

    #[test]
    fn test_4_3_unit_005_audio_track_unique_ids() {
        // Verify track IDs can be assigned uniquely
        let track1 = AudioTrack {
            track_id: 1,
            source: AudioSource::System,
            sync_offset: 0,
            label: None,
        };

        let track2 = AudioTrack {
            track_id: 2,
            source: AudioSource::Microphone,
            sync_offset: 0,
            label: None,
        };

        assert_ne!(track1.track_id, track2.track_id);
    }

    #[test]
    fn test_4_3_unit_006_audio_track_sync_offset() {
        // Test positive sync offset (audio ahead of video)
        let track_ahead = AudioTrack {
            track_id: 1,
            source: AudioSource::System,
            sync_offset: 50,
            label: None,
        };
        assert_eq!(track_ahead.sync_offset, 50);

        // Test negative sync offset (audio behind video)
        let track_behind = AudioTrack {
            track_id: 2,
            source: AudioSource::Microphone,
            sync_offset: -30,
            label: None,
        };
        assert_eq!(track_behind.sync_offset, -30);
    }

    #[test]
    fn test_4_3_unit_007_recording_config_default_empty_tracks() {
        let config = RecordingConfig::default();
        assert!(config.audio_tracks.is_empty());
    }

    #[test]
    fn test_4_3_unit_008_future_ready_three_plus_tracks() {
        // AC#6: Verify architecture supports 3+ tracks (future webcam mic)
        let mut config = RecordingConfig::default();

        config.audio_tracks.push(AudioTrack {
            track_id: 1,
            source: AudioSource::System,
            sync_offset: 0,
            label: Some("System".to_string()),
        });

        config.audio_tracks.push(AudioTrack {
            track_id: 2,
            source: AudioSource::Microphone,
            sync_offset: 0,
            label: Some("Microphone".to_string()),
        });

        config.audio_tracks.push(AudioTrack {
            track_id: 3,
            source: AudioSource::Webcam,
            sync_offset: 0,
            label: Some("Webcam Mic".to_string()),
        });

        assert_eq!(config.audio_tracks.len(), 3);

        // Verify all three sources can coexist
        let sources: Vec<AudioSource> = config.audio_tracks.iter().map(|t| t.source).collect();
        assert!(sources.contains(&AudioSource::System));
        assert!(sources.contains(&AudioSource::Microphone));
        assert!(sources.contains(&AudioSource::Webcam));
    }

    // Story 4.5: PiP Position and Size Configuration Tests

    #[test]
    fn test_4_5_unit_001_pip_position_serialization() {
        let position = PipPosition { x: 100, y: 200 };
        let json = serde_json::to_string(&position).unwrap();
        assert!(json.contains("\"x\":100"));
        assert!(json.contains("\"y\":200"));
    }

    #[test]
    fn test_4_5_unit_002_pip_position_deserialization() {
        let json = r#"{"x":50,"y":75}"#;
        let position: PipPosition = serde_json::from_str(json).unwrap();
        assert_eq!(position.x, 50);
        assert_eq!(position.y, 75);
    }

    #[test]
    fn test_4_5_unit_003_pip_size_serialization() {
        let size = PipSize {
            width: 384,
            height: 216,
        };
        let json = serde_json::to_string(&size).unwrap();
        assert!(json.contains("\"width\":384"));
        assert!(json.contains("\"height\":216"));
    }

    #[test]
    fn test_4_5_unit_004_pip_size_deserialization() {
        let json = r#"{"width":640,"height":360}"#;
        let size: PipSize = serde_json::from_str(json).unwrap();
        assert_eq!(size.width, 640);
        assert_eq!(size.height, 360);
    }

    #[test]
    fn test_4_5_unit_005_recording_config_with_pip() {
        let mut config = RecordingConfig::default();
        config.pip_position = Some(PipPosition { x: 100, y: 100 });
        config.pip_size = Some(PipSize {
            width: 384,
            height: 216,
        });

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("\"pipPosition\""));
        assert!(json.contains("\"pipSize\""));
        assert!(json.contains("\"x\":100"));
        assert!(json.contains("\"y\":100"));
        assert!(json.contains("\"width\":384"));
        assert!(json.contains("\"height\":216"));
    }

    #[test]
    fn test_4_5_unit_006_recording_config_pip_deserialization() {
        let json = r#"{
            "frameRate": 30,
            "resolution": "1080p",
            "systemAudio": true,
            "microphone": false,
            "recordingMode": "fullscreen",
            "pipPosition": {"x": 1500, "y": 800},
            "pipSize": {"width": 384, "height": 216}
        }"#;

        let config: RecordingConfig = serde_json::from_str(json).unwrap();
        assert!(config.pip_position.is_some());
        assert!(config.pip_size.is_some());

        let position = config.pip_position.unwrap();
        assert_eq!(position.x, 1500);
        assert_eq!(position.y, 800);

        let size = config.pip_size.unwrap();
        assert_eq!(size.width, 384);
        assert_eq!(size.height, 216);
    }

    #[test]
    fn test_4_5_unit_007_recording_config_default_no_pip() {
        let config = RecordingConfig::default();
        assert!(config.pip_position.is_none());
        assert!(config.pip_size.is_none());
    }

    #[test]
    fn test_4_5_unit_008_pip_position_negative_coordinates() {
        // Negative coordinates should not be used, but type allows them
        // Frontend validation should prevent this
        let position = PipPosition { x: -10, y: -20 };
        assert_eq!(position.x, -10);
        assert_eq!(position.y, -20);
    }

    // Story 4.6: Simultaneous Screen + Webcam Recording Tests

    #[test]
    fn test_4_6_unit_001_recording_mode_enum() {
        // Test all recording modes
        assert_eq!(RecordingMode::Screen as u8, 0);
        assert_eq!(RecordingMode::Webcam as u8, 1);
        assert_eq!(RecordingMode::Pip as u8, 2);
    }

    #[test]
    fn test_4_6_unit_002_recording_mode_default() {
        assert_eq!(RecordingMode::default(), RecordingMode::Screen);
    }

    #[test]
    fn test_4_6_unit_003_recording_mode_serialization() {
        // Test screen mode
        let screen = RecordingMode::Screen;
        let json = serde_json::to_string(&screen).unwrap();
        assert_eq!(json, "\"screen\"");

        // Test webcam mode
        let webcam = RecordingMode::Webcam;
        let json = serde_json::to_string(&webcam).unwrap();
        assert_eq!(json, "\"webcam\"");

        // Test PiP mode
        let pip = RecordingMode::Pip;
        let json = serde_json::to_string(&pip).unwrap();
        assert_eq!(json, "\"pip\"");
    }

    #[test]
    fn test_4_6_unit_004_recording_mode_deserialization() {
        let screen: RecordingMode = serde_json::from_str("\"screen\"").unwrap();
        assert_eq!(screen, RecordingMode::Screen);

        let webcam: RecordingMode = serde_json::from_str("\"webcam\"").unwrap();
        assert_eq!(webcam, RecordingMode::Webcam);

        let pip: RecordingMode = serde_json::from_str("\"pip\"").unwrap();
        assert_eq!(pip, RecordingMode::Pip);
    }

    #[test]
    fn test_4_6_unit_005_pip_recording_config() {
        // AC#1: "Screen + Webcam" recording mode triggers both captures
        let mut config = RecordingConfig::default();
        config.mode = RecordingMode::Pip;
        config.pip_position = Some(PipPosition { x: 1500, y: 800 });
        config.pip_size = Some(PipSize {
            width: 384,
            height: 216,
        });

        assert_eq!(config.mode, RecordingMode::Pip);
        assert!(config.pip_position.is_some());
        assert!(config.pip_size.is_some());

        // Verify serialization includes PiP mode
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("\"mode\":\"pip\""));
        assert!(json.contains("\"pipPosition\""));
        assert!(json.contains("\"pipSize\""));
    }

    #[test]
    fn test_4_6_unit_006_pip_config_with_audio() {
        // AC#1: PiP mode can include system audio and microphone
        let mut config = RecordingConfig::default();
        config.mode = RecordingMode::Pip;
        config.system_audio = true;
        config.microphone = true;
        config.pip_position = Some(PipPosition { x: 100, y: 100 });
        config.pip_size = Some(PipSize {
            width: 384,
            height: 216,
        });

        assert_eq!(config.mode, RecordingMode::Pip);
        assert!(config.system_audio);
        assert!(config.microphone);
    }

    #[test]
    fn test_4_6_unit_007_pip_recording_config_deserialization() {
        // AC#5: PiP position and size from configuration
        let json = r#"{
            "mode": "pip",
            "frameRate": 30,
            "resolution": "1080p",
            "systemAudio": true,
            "microphone": false,
            "screenRecordingMode": "fullscreen",
            "pipPosition": {"x": 1500, "y": 800},
            "pipSize": {"width": 384, "height": 216}
        }"#;

        let config: RecordingConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.mode, RecordingMode::Pip);
        assert!(config.pip_position.is_some());
        assert!(config.pip_size.is_some());

        let position = config.pip_position.unwrap();
        assert_eq!(position.x, 1500);
        assert_eq!(position.y, 800);

        let size = config.pip_size.unwrap();
        assert_eq!(size.width, 384);
        assert_eq!(size.height, 216);
    }

    #[test]
    fn test_4_6_unit_008_screen_only_mode() {
        let config = RecordingConfig {
            mode: RecordingMode::Screen,
            ..Default::default()
        };

        assert_eq!(config.mode, RecordingMode::Screen);
        assert!(config.pip_position.is_none());
        assert!(config.pip_size.is_none());
    }

    #[test]
    fn test_4_6_unit_009_webcam_only_mode() {
        let config = RecordingConfig {
            mode: RecordingMode::Webcam,
            ..Default::default()
        };

        assert_eq!(config.mode, RecordingMode::Webcam);
        // Webcam-only mode doesn't need PiP config
        assert!(config.pip_position.is_none());
        assert!(config.pip_size.is_none());
    }
}
