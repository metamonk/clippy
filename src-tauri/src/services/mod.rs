pub mod audio_capture;
pub mod ffmpeg;
pub mod mpv_player;
pub mod permissions;
pub mod screen_capture;
pub mod recording;

pub use audio_capture::{AudioCapture, AudioDevice, AudioSample};
pub use ffmpeg::{VideoExporter, check_ffmpeg_available};
pub use mpv_player::MpvPlayer;
pub use permissions::{check_screen_recording_permission, request_screen_recording_permission};
pub use screen_capture::ScreenCapture;
pub use recording::{FrameSynchronizer, SyncMetrics};
