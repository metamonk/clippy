pub mod macos;

pub use macos::{
    check_screen_recording_permission, request_screen_recording_permission, PermissionError,
};
