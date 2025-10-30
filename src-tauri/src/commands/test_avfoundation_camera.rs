//! Test command for AVFoundation camera capture

use crate::services::camera::avfoundation_camera::AVCameraCapture;
use crate::services::ffmpeg::{FFmpegEncoder, TimestampedFrame};
use std::path::PathBuf;
use tokio::sync::mpsc;
use tracing::{error, info};

/// Test AVFoundation camera capture at 30 FPS
#[tauri::command]
pub async fn test_avfoundation_camera(
    output_path: String,
    camera_index: u32,
) -> Result<String, String> {
    info!("Testing AVFoundation camera capture at {}", output_path);

    let output_path = PathBuf::from(output_path);

    // Create output directory if needed
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            format!("Failed to create output directory: {}", e)
        })?;
    }

    // Fixed 1080p resolution
    let (width, height) = (1920u32, 1080u32);

    // Initialize AVFoundation camera
    let mut av_camera = AVCameraCapture::new(camera_index, width, height, 30)
        .map_err(|e| {
            error!("Failed to initialize AVFoundation camera: {}", e);
            format!("AVFoundation camera initialization failed: {}", e)
        })?;

    // Create FFmpeg encoder
    let mut encoder = FFmpegEncoder::new(output_path.clone(), width, height, 30)
        .map_err(|e| {
            error!("Failed to create FFmpeg encoder: {}", e);
            format!("Failed to create encoder: {}", e)
        })?;

    // Start encoding process
    encoder.start_encoding().await.map_err(|e| {
        error!("Failed to start encoding: {}", e);
        format!("Failed to start encoding: {}", e)
    })?;

    // Create bounded channel for video frames
    let (video_tx, mut video_rx) = mpsc::channel::<TimestampedFrame>(30);

    // Start AVFoundation capture
    let _capture_handle = av_camera
        .start_continuous_capture(video_tx)
        .map_err(|e| {
            error!("Failed to start AVFoundation capture: {}", e);
            format!("Failed to start AVFoundation capture: {}", e)
        })?;

    // Encoding task
    let output_path_clone = output_path.clone();
    let encoding_handle = tokio::spawn(async move {
        info!("Starting encoding task");
        let mut frame_count = 0u64;

        while let Some(frame) = video_rx.recv().await {
            if let Err(e) = encoder.write_frame_to_stdin(&frame).await {
                error!("Failed to write frame to encoder: {}", e);
                break;
            }

            frame_count += 1;
            if frame_count % 30 == 0 {
                info!("Encoded {} frames", frame_count);
            }
        }

        info!("Video channel closed, finalizing encoding ({} frames)", frame_count);

        // Finalize encoding
        match encoder.stop_encoding().await {
            Ok(()) => {
                info!("Encoding completed, output file ready: {:?}", output_path_clone);
                Ok(())
            }
            Err(e) => {
                error!("Failed to finalize encoding: {}", e);
                Err(format!("Failed to finalize encoding: {}", e))
            }
        }
    });

    // Run for 10 seconds as a test
    tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;

    // Stop capture (this will also close the channel)
    av_camera.stop_capture();
    info!("Stopped AVFoundation capture");

    // Wait for encoding to complete
    encoding_handle.await.map_err(|e| {
        format!("Encoding task failed: {}", e)
    })?.map_err(|e| e)?;

    Ok(format!("Test recording saved to: {}", output_path.display()))
}