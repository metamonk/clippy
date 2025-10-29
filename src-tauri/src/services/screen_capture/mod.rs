pub mod screencapturekit;
pub mod frame_handler;

pub use screencapturekit::{ScreenCapture, ScreenCaptureError, SystemAudioConfig};
pub use frame_handler::{FrameHandler, FrameHandlerError};
