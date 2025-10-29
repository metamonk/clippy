pub mod macos;

pub use macos::{
    check_screen_recording_permission,
    request_screen_recording_permission,
    check_camera_permission,
    request_camera_permission,
    check_microphone_permission,
    request_microphone_permission,
    PermissionError,
};
