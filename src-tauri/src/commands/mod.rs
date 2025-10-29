pub mod media;
pub mod export;
pub mod mpv;
pub mod recording;

pub use media::cmd_import_media;
pub use export::{ExportState, cmd_start_export, cmd_get_export_progress, cmd_cancel_export};
pub use mpv::{
    MpvPlayerState,
    mpv_init,
    mpv_load_file,
    mpv_play,
    mpv_pause,
    mpv_seek,
    mpv_get_time,
    mpv_get_duration,
    mpv_stop,
    mpv_is_playing,
    mpv_get_video_dimensions,
    mpv_capture_frame,
    mpv_set_volume,
    mpv_apply_fade_filters,
    mpv_clear_audio_filters,
};
pub use recording::{
    cmd_check_screen_recording_permission,
    cmd_request_screen_recording_permission,
    cmd_check_camera_permission,
    cmd_request_camera_permission,
    cmd_list_cameras,
    cmd_start_camera_preview,
    cmd_stop_camera_preview,
    cmd_start_webcam_recording,
    cmd_stop_webcam_recording,
    cmd_start_screen_recording,
    cmd_start_pip_recording,
    cmd_stop_pip_recording,
    cmd_stop_recording,
    cmd_pause_recording,
    cmd_resume_recording,
    cmd_cancel_recording,
    cmd_check_disk_space,
    cmd_send_recording_notification,
    cmd_get_home_dir,
    cmd_get_available_windows,
};
