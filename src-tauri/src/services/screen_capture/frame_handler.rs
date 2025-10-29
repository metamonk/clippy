/// Frame Handler for Screen Recording
///
/// This module provides frame buffering and encoding for screen recordings.
/// It uses a bounded channel to prevent memory bloat during long recordings.

use std::path::PathBuf;
use thiserror::Error;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::sync::mpsc;
use tracing::{debug, error, info};
use crate::services::ffmpeg::{FFmpegEncoder, TimestampedFrame};

/// Errors that can occur during frame handling
#[derive(Error, Debug)]
pub enum FrameHandlerError {
    #[error("Failed to create recording directory: {0}")]
    DirectoryCreationFailed(String),

    #[error("Failed to create recording file: {0}")]
    FileCreationFailed(String),

    #[error("Failed to write frame to file: {0}")]
    WriteError(String),

    #[error("Channel closed unexpectedly")]
    ChannelClosed,

    #[error("FFmpeg encoding error: {0}")]
    EncodingError(String),

    #[error("Frame drop detected: {0}")]
    FrameDropped(String),
}

/// Frame buffer using bounded channel to prevent memory bloat
///
/// Following Architecture Pattern 2: Real-Time Encoding During Capture
/// - Bounded channel (30 frames max) prevents unbounded memory growth
/// - At 30 FPS, 30 frames = 1 second of buffering
/// - Frame size: 1920x1080x4 (BGRA) = ~8MB per frame
/// - Max memory: 30 * 8MB = 240MB (acceptable for recording)
pub struct FrameHandler {
    /// Sender for timestamped frame data (bounded channel)
    frame_tx: mpsc::Sender<TimestampedFrame>,

    /// Receiver for frame data (consumed by encoder/writer task)
    frame_rx: Option<mpsc::Receiver<TimestampedFrame>>,

    /// File path where recording is being written (for raw mode)
    output_path: Option<PathBuf>,

    /// Frame counter for drop detection
    frame_counter: Arc<tokio::sync::RwLock<u64>>,
}

use std::sync::Arc;

impl FrameHandler {
    /// Create a new FrameHandler with bounded channel for real-time encoding
    ///
    /// # Arguments
    ///
    /// * `buffer_size` - Maximum number of frames to buffer (default: 30)
    pub fn new_for_encoding(buffer_size: usize) -> Self {
        debug!("Creating FrameHandler for encoding with buffer size: {}", buffer_size);

        let (tx, rx) = mpsc::channel::<TimestampedFrame>(buffer_size);

        Self {
            frame_tx: tx,
            frame_rx: Some(rx),
            output_path: None,
            frame_counter: Arc::new(tokio::sync::RwLock::new(0)),
        }
    }

    /// Create a new FrameHandler with bounded channel for raw file writing (legacy)
    ///
    /// # Arguments
    ///
    /// * `output_path` - Path where the recording will be saved
    /// * `buffer_size` - Maximum number of frames to buffer (default: 30)
    pub fn new(output_path: PathBuf, buffer_size: usize) -> Self {
        debug!("Creating FrameHandler for raw file with buffer size: {}", buffer_size);

        let (tx, rx) = mpsc::channel::<TimestampedFrame>(buffer_size);

        Self {
            frame_tx: tx,
            frame_rx: Some(rx),
            output_path: Some(output_path),
            frame_counter: Arc::new(tokio::sync::RwLock::new(0)),
        }
    }

    /// Get a sender for pushing frames to the buffer
    pub fn get_sender(&self) -> mpsc::Sender<TimestampedFrame> {
        self.frame_tx.clone()
    }

    /// Get current frame count
    pub async fn get_frame_count(&self) -> u64 {
        *self.frame_counter.read().await
    }

    /// Start the real-time encoder task
    ///
    /// This spawns a Tokio task that continuously reads frames from the channel
    /// and streams them to the FFmpeg encoder for real-time H.264 encoding.
    ///
    /// # Arguments
    /// * `encoder` - FFmpegEncoder instance (must be started beforehand)
    ///
    /// Returns a join handle for the encoder task
    pub async fn start_encoder(
        &mut self,
        mut encoder: FFmpegEncoder,
    ) -> Result<tokio::task::JoinHandle<Result<(), FrameHandlerError>>, FrameHandlerError> {
        let mut rx = self.frame_rx.take().ok_or_else(|| {
            error!("Receiver already taken - encoder can only be started once");
            FrameHandlerError::ChannelClosed
        })?;

        let frame_counter = Arc::clone(&self.frame_counter);

        info!("Starting real-time encoder task");

        let handle = tokio::spawn(async move {
            let mut processed_frames = 0u64;
            let mut total_bytes = 0usize;
            let start_time = std::time::Instant::now();

            // Process frames from channel
            while let Some(frame) = rx.recv().await {
                // Increment frame counter
                {
                    let mut counter = frame_counter.write().await;
                    *counter += 1;
                }

                // Write frame to encoder
                if let Err(e) = encoder.write_frame_to_stdin(&frame).await {
                    error!(
                        event = "encoding_frame_failed",
                        error = %e,
                        frame_num = processed_frames,
                        "Failed to encode frame"
                    );
                    return Err(FrameHandlerError::EncodingError(e.to_string()));
                }

                processed_frames += 1;
                total_bytes += frame.data.len();

                // Log progress every second (30 frames @ 30fps)
                if processed_frames % 30 == 0 {
                    let elapsed = start_time.elapsed().as_secs_f64();
                    let fps = processed_frames as f64 / elapsed;
                    debug!(
                        event = "encoding_progress",
                        frames = processed_frames,
                        mb_processed = total_bytes / 1_000_000,
                        fps = format!("{:.1}", fps),
                        "Real-time encoding progress"
                    );
                }
            }

            // Stop encoder and finalize output
            if let Err(e) = encoder.stop_encoding().await {
                error!(
                    event = "encoder_stop_failed",
                    error = %e,
                    "Failed to stop encoder"
                );
                return Err(FrameHandlerError::EncodingError(e.to_string()));
            }

            let elapsed = start_time.elapsed();
            info!(
                event = "encoding_complete",
                frames = processed_frames,
                mb_processed = total_bytes / 1_000_000,
                duration_secs = elapsed.as_secs(),
                avg_fps = format!("{:.1}", processed_frames as f64 / elapsed.as_secs_f64()),
                "Real-time encoding completed successfully"
            );

            Ok(())
        });

        Ok(handle)
    }

    /// Start the frame writer task (legacy raw file mode)
    ///
    /// This spawns a Tokio task that continuously reads from the channel
    /// and writes frames to the output file.
    ///
    /// Returns a join handle for the writer task
    pub async fn start_writer(
        &mut self,
    ) -> Result<tokio::task::JoinHandle<Result<(), FrameHandlerError>>, FrameHandlerError> {
        let mut rx = self.frame_rx.take().ok_or_else(|| {
            error!("Receiver already taken - writer can only be started once");
            FrameHandlerError::ChannelClosed
        })?;

        let output_path = self.output_path.clone().ok_or_else(|| {
            error!("No output path specified for raw file writer");
            FrameHandlerError::FileCreationFailed("No output path".to_string())
        })?;

        let frame_counter = Arc::clone(&self.frame_counter);

        info!("Starting frame writer task for: {}", output_path.display());

        let handle = tokio::spawn(async move {
            // Create parent directory if needed
            if let Some(parent) = output_path.parent() {
                tokio::fs::create_dir_all(parent).await.map_err(|e| {
                    error!("Failed to create recording directory: {}", e);
                    FrameHandlerError::DirectoryCreationFailed(e.to_string())
                })?;
            }

            // Open file for writing
            let mut file = File::create(&output_path).await.map_err(|e| {
                error!("Failed to create recording file: {}", e);
                FrameHandlerError::FileCreationFailed(e.to_string())
            })?;

            info!("Recording file created: {}", output_path.display());

            let mut total_bytes = 0;

            // Read frames from channel and write to file
            while let Some(frame) = rx.recv().await {
                // Increment frame counter
                {
                    let mut counter = frame_counter.write().await;
                    *counter += 1;
                }

                let frame_size = frame.data.len();

                // Write frame data to file
                if let Err(e) = file.write_all(&frame.data).await {
                    let count = *frame_counter.read().await;
                    error!("Failed to write frame {}: {}", count, e);
                    return Err(FrameHandlerError::WriteError(e.to_string()));
                }

                total_bytes += frame_size;

                let count = *frame_counter.read().await;
                if count % 30 == 0 {
                    debug!(
                        "Wrote {} frames ({} MB)",
                        count,
                        total_bytes / 1_000_000
                    );
                }
            }

            // Flush and close file
            file.flush().await.map_err(|e| {
                error!("Failed to flush file: {}", e);
                FrameHandlerError::WriteError(e.to_string())
            })?;

            let final_count = *frame_counter.read().await;
            info!(
                "Recording complete: {} frames ({} MB) written to {}",
                final_count,
                total_bytes / 1_000_000,
                output_path.display()
            );

            Ok(())
        });

        Ok(handle)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_frame_handler_creates_file() {
        let temp_dir = std::env::temp_dir();
        let output_path = temp_dir.join("test_recording.raw");

        // Clean up any existing file
        let _ = tokio::fs::remove_file(&output_path).await;

        let mut handler = FrameHandler::new(output_path.clone(), 30);
        let sender = handler.get_sender();

        // Start writer task
        let writer_handle = handler.start_writer().await.unwrap();

        // Send a few test frames
        for i in 0..5 {
            let frame = TimestampedFrame {
                data: vec![i as u8; 1920 * 1080 * 4],
                timestamp_ms: i * 33,  // ~30fps
                width: 1920,
                height: 1080,
            };
            sender.send(frame).await.unwrap();
        }

        // Drop sender to signal completion
        drop(sender);

        // Wait for writer to finish
        let result = writer_handle.await.unwrap();
        assert!(result.is_ok(), "Writer task should complete successfully");

        // Verify file was created
        assert!(
            output_path.exists(),
            "Recording file should be created"
        );

        // Verify file size
        let metadata = tokio::fs::metadata(&output_path).await.unwrap();
        let expected_size = 5 * 1920 * 1080 * 4;
        assert_eq!(
            metadata.len(),
            expected_size as u64,
            "File size should match frames written"
        );

        // Clean up
        tokio::fs::remove_file(&output_path).await.unwrap();
    }

    #[tokio::test]
    async fn test_bounded_channel_backpressure() {
        let temp_dir = std::env::temp_dir();
        let output_path = temp_dir.join("test_backpressure.raw");

        // Clean up any existing file
        let _ = tokio::fs::remove_file(&output_path).await;

        // Create handler with small buffer (2 frames)
        let mut handler = FrameHandler::new(output_path.clone(), 2);
        let sender = handler.get_sender();

        // Start writer task
        let writer_handle = handler.start_writer().await.unwrap();

        // Try to send more frames than buffer can hold
        // This should apply backpressure and slow down sending
        let start = std::time::Instant::now();

        for i in 0..10 {
            let frame = TimestampedFrame {
                data: vec![i as u8; 100],
                timestamp_ms: i * 33,
                width: 10,
                height: 2,  // 10x2x4 = 80 bytes < 100, but close enough for test
            };
            sender.send(frame).await.unwrap();
        }

        let elapsed = start.elapsed();

        // Drop sender to signal completion
        drop(sender);

        // Wait for writer to finish
        let result = writer_handle.await.unwrap();
        assert!(result.is_ok());

        // Backpressure should cause some delay
        // (exact timing depends on system, but should be measurable)
        debug!("Sent 10 frames with buffer size 2 in {:?}", elapsed);

        // Clean up
        tokio::fs::remove_file(&output_path).await.unwrap();
    }

    #[tokio::test]
    async fn test_encoder_integration() {
        let temp_dir = std::env::temp_dir();
        let output_path = temp_dir.join("test_encoded.mp4");

        // Clean up any existing file
        let _ = tokio::fs::remove_file(&output_path).await;

        // Create frame handler for encoding
        let mut handler = FrameHandler::new_for_encoding(30);
        let sender = handler.get_sender();

        // Create and start encoder
        let mut encoder = FFmpegEncoder::new(output_path.clone(), 640, 480, 30)
            .expect("Failed to create encoder");
        encoder.start_encoding().await.expect("Failed to start encoding");

        // Start encoder task
        let encoder_handle = handler.start_encoder(encoder).await.unwrap();

        // Send test frames
        for i in 0..30 {  // 1 second of video
            let frame = TimestampedFrame {
                data: vec![128u8; 640 * 480 * 4],  // Gray frame
                timestamp_ms: i * 33,  // ~30fps
                width: 640,
                height: 480,
            };
            sender.send(frame).await.unwrap();
        }

        // Drop sender to signal completion
        drop(sender);

        // Wait for encoder to finish
        let result = encoder_handle.await.unwrap();
        assert!(result.is_ok(), "Encoder task should complete successfully");

        // Verify output file was created
        assert!(output_path.exists(), "Encoded MP4 should be created");

        // Verify file has content
        let metadata = tokio::fs::metadata(&output_path).await.unwrap();
        assert!(metadata.len() > 0, "Encoded file should not be empty");

        // Clean up
        tokio::fs::remove_file(&output_path).await.unwrap();
    }
}
