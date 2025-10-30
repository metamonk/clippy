use anyhow::{Context, Result};
use ffmpeg_sidecar::command::FfmpegCommand;
use ffmpeg_sidecar::child::FfmpegChild;
use std::path::PathBuf;
use std::sync::Arc;
use std::process::ChildStdin;
use tokio::sync::Mutex;
use std::io::Write;

/// Frame data structure with timestamp for synchronization
#[derive(Debug, Clone)]
pub struct TimestampedFrame {
    /// Raw BGRA pixel data (4 bytes per pixel)
    pub data: Vec<u8>,

    /// High-precision timestamp in milliseconds since recording start
    pub timestamp_ms: u64,

    /// Frame width in pixels
    pub width: u32,

    /// Frame height in pixels
    pub height: u32,
}

/// Real-time FFmpeg encoder for screen recording
///
/// Encodes raw BGRA frames to H.264 MP4 in real-time during capture.
/// Uses stdin pipe streaming to FFmpeg process.
pub struct FFmpegEncoder {
    /// FFmpeg child process
    process: Arc<Mutex<Option<FfmpegChild>>>,

    /// Stdin channel for writing frame data
    stdin: Arc<Mutex<Option<ChildStdin>>>,

    /// Output file path
    output_path: PathBuf,

    /// Video width
    width: u32,

    /// Video height
    height: u32,

    /// Frame rate (frames per second)
    fps: u32,
}

impl FFmpegEncoder {
    /// Create a new FFmpeg encoder
    ///
    /// # Arguments
    /// * `output_path` - Path where the encoded MP4 will be saved
    /// * `width` - Video frame width in pixels
    /// * `height` - Video frame height in pixels
    /// * `fps` - Target frame rate (default: 30)
    ///
    /// # Returns
    /// * `Ok(FFmpegEncoder)` - Encoder ready to start
    /// * `Err(anyhow::Error)` - Failed to create encoder
    pub fn new(output_path: PathBuf, width: u32, height: u32, fps: u32) -> Result<Self> {
        tracing::info!(
            event = "encoder_create",
            output_path = %output_path.display(),
            width = width,
            height = height,
            fps = fps,
            "Creating FFmpeg real-time encoder"
        );

        // Validate output path parent directory exists
        if let Some(parent) = output_path.parent() {
            if !parent.exists() {
                return Err(anyhow::anyhow!(
                    "Output directory does not exist: {}",
                    parent.display()
                ));
            }
        }

        Ok(Self {
            process: Arc::new(Mutex::new(None)),
            stdin: Arc::new(Mutex::new(None)),
            output_path,
            width,
            height,
            fps,
        })
    }

    /// Start the FFmpeg encoding process
    ///
    /// Spawns FFmpeg with H.264 codec configured for real-time encoding.
    /// FFmpeg reads raw BGRA frames from stdin pipe.
    ///
    /// Configuration:
    /// - Codec: H.264 (libx264)
    /// - Preset: fast (optimized for real-time encoding)
    /// - CRF: 23 (quality level, lower = better quality)
    /// - Format: MP4 with BGRA input
    ///
    /// # Returns
    /// * `Ok(())` - FFmpeg process started successfully
    /// * `Err(anyhow::Error)` - Failed to start encoding
    pub async fn start_encoding(&mut self) -> Result<()> {
        tracing::info!(
            event = "encoding_start",
            output_path = %self.output_path.display(),
            "Starting FFmpeg encoding process"
        );

        // Build FFmpeg command for real-time H.264 encoding
        let mut command = FfmpegCommand::new();

        command
            // Input format: raw video from stdin
            .arg("-f").arg("rawvideo")
            .arg("-pix_fmt").arg("bgra")  // BGRA format from ScreenCaptureKit
            .arg("-s").arg(format!("{}x{}", self.width, self.height))
            .arg("-r").arg(self.fps.to_string())
            .arg("-i").arg("pipe:0")  // Read from stdin

            // H.264 encoding with real-time optimizations
            .arg("-c:v").arg("libx264")
            .arg("-preset").arg("fast")  // Fast preset for real-time encoding
            .arg("-crf").arg("23")  // Constant Rate Factor for quality
            .arg("-pix_fmt").arg("yuv420p")  // Standard pixel format for maximum compatibility

            // macOS VideoToolbox hardware acceleration (if available)
            // Note: libx264 will automatically use VideoToolbox on macOS

            // Output format
            .arg("-f").arg("mp4")
            .arg("-movflags").arg("faststart")  // Move moov atom to beginning for QuickTime compatibility
            .arg("-y")  // Overwrite output file
            .arg(&self.output_path);

        // Spawn the FFmpeg process
        let mut child = command
            .spawn()
            .context("Failed to spawn FFmpeg process. Ensure FFmpeg is installed.")?;

        tracing::info!(
            event = "ffmpeg_spawned",
            "FFmpeg process spawned successfully"
        );

        // Take ownership of stdin for frame writing
        let stdin = child.take_stdin()
            .ok_or_else(|| anyhow::anyhow!("Failed to take FFmpeg stdin"))?;

        // Store stdin and process handles
        let mut stdin_lock = self.stdin.lock().await;
        *stdin_lock = Some(stdin);

        let mut process_lock = self.process.lock().await;
        *process_lock = Some(child);

        Ok(())
    }

    /// Write a single frame to the FFmpeg stdin pipe
    ///
    /// Streams raw BGRA frame data to FFmpeg for real-time encoding.
    /// This method blocks if FFmpeg cannot keep up with the frame rate.
    ///
    /// # Arguments
    /// * `frame` - Timestamped frame with BGRA data
    ///
    /// # Returns
    /// * `Ok(())` - Frame written successfully
    /// * `Err(anyhow::Error)` - Failed to write frame (encoding may have stopped)
    pub async fn write_frame_to_stdin(&mut self, frame: &TimestampedFrame) -> Result<()> {
        // Validate frame dimensions match encoder configuration
        if frame.width != self.width || frame.height != self.height {
            return Err(anyhow::anyhow!(
                "Frame dimensions {}x{} do not match encoder {}x{}",
                frame.width, frame.height, self.width, self.height
            ));
        }

        // Expected frame size: width * height * 4 bytes (BGRA)
        let expected_size = (self.width * self.height * 4) as usize;
        if frame.data.len() != expected_size {
            return Err(anyhow::anyhow!(
                "Invalid frame data size: expected {} bytes, got {}",
                expected_size, frame.data.len()
            ));
        }

        // Get mutable reference to stdin
        let mut stdin_lock = self.stdin.lock().await;
        let stdin = stdin_lock
            .as_mut()
            .ok_or_else(|| anyhow::anyhow!("FFmpeg stdin not available"))?;

        // Write frame data to stdin (blocks if pipe buffer is full)
        stdin
            .write_all(&frame.data)
            .context("Failed to write frame to FFmpeg stdin")?;

        tracing::trace!(
            event = "frame_written",
            timestamp_ms = frame.timestamp_ms,
            data_size = frame.data.len(),
            "Frame written to FFmpeg stdin"
        );

        Ok(())
    }

    /// Stop encoding and finalize the output file
    ///
    /// Flushes remaining frames, closes stdin, and waits for FFmpeg to complete.
    /// After this call, the output MP4 file should be playable.
    ///
    /// # Returns
    /// * `Ok(())` - Encoding stopped successfully, output file ready
    /// * `Err(anyhow::Error)` - Failed to finalize encoding
    pub async fn stop_encoding(&mut self) -> Result<()> {
        tracing::info!(
            event = "encoding_stop",
            output_path = %self.output_path.display(),
            "Stopping FFmpeg encoding"
        );

        // Close stdin to signal end of input
        {
            let mut stdin_lock = self.stdin.lock().await;
            if let Some(mut stdin) = stdin_lock.take() {
                // Flush any buffered data
                if let Err(e) = stdin.flush() {
                    tracing::warn!(
                        event = "stdin_flush_failed",
                        error = %e,
                        "Failed to flush FFmpeg stdin"
                    );
                }
                drop(stdin);  // Close stdin pipe
            }
        }

        let mut process_lock = self.process.lock().await;

        if let Some(mut child) = process_lock.take() {

            // Wait for FFmpeg process to complete (with timeout)
            let wait_result = tokio::time::timeout(
                std::time::Duration::from_secs(10),
                tokio::task::spawn_blocking(move || child.wait())
            ).await;

            match wait_result {
                Ok(Ok(_)) => {
                    tracing::info!(
                        event = "ffmpeg_completed",
                        "FFmpeg process completed successfully"
                    );
                }
                Ok(Err(e)) => {
                    tracing::error!(
                        event = "ffmpeg_wait_error",
                        error = %e,
                        "Error waiting for FFmpeg process"
                    );
                    return Err(anyhow::anyhow!("Failed to wait for FFmpeg: {}", e));
                }
                Err(_) => {
                    tracing::warn!(
                        event = "ffmpeg_wait_timeout",
                        "FFmpeg process did not complete within timeout, may still be encoding"
                    );
                }
            }

            // Verify output file was created
            if !self.output_path.exists() {
                return Err(anyhow::anyhow!(
                    "Output file was not created: {}",
                    self.output_path.display()
                ));
            }

            tracing::info!(
                event = "encoding_complete",
                output_path = %self.output_path.display(),
                "Encoding completed, output file ready"
            );
        } else {
            tracing::warn!(
                event = "no_active_encoding",
                "No active encoding process to stop"
            );
        }

        Ok(())
    }

    /// Check if encoding is currently active
    pub async fn is_encoding(&self) -> bool {
        let process_lock = self.process.lock().await;
        process_lock.is_some()
    }

    /// Kill the FFmpeg process immediately (for error handling)
    ///
    /// This is a forceful termination used when encoding fails.
    /// For normal stop, use `stop_encoding()` instead.
    pub async fn kill(&mut self) -> Result<()> {
        let mut process_lock = self.process.lock().await;

        if let Some(mut child) = process_lock.take() {
            tracing::warn!(
                event = "encoder_kill",
                "Killing FFmpeg process"
            );

            child.kill()
                .context("Failed to kill FFmpeg process")?;
        }

        Ok(())
    }

    /// Finalize recording with audio muxing (Story 2.4, Story 4.7)
    ///
    /// Takes video file and 1-3 PCM audio files, muxes them into final MP4.
    /// Supports system audio, microphone, and webcam audio tracks.
    ///
    /// # Arguments
    /// * `video_path` - Path to the encoded video file (from stop_encoding)
    /// * `audio_inputs` - Vector of audio input configurations (1-3 tracks)
    /// * `output_path` - Final output path with all tracks muxed
    ///
    /// # Returns
    /// * `Ok(())` - Audio muxing completed successfully
    /// * `Err(anyhow::Error)` - Muxing failed
    ///
    /// # Implementation Notes
    /// - Video file should already be encoded (call stop_encoding first)
    /// - Audio PCM files are raw 48kHz stereo s16le format
    /// - FFmpeg maps video + N audio tracks: -map 0:v -map 1:a -map 2:a ...
    /// - Each audio track encoded to AAC 192kbps
    pub async fn finalize_with_audio(
        video_path: PathBuf,
        audio_inputs: Vec<AudioInputConfig>,
        output_path: PathBuf,
    ) -> Result<()> {
        if audio_inputs.is_empty() {
            return Err(anyhow::anyhow!("At least one audio input required"));
        }

        if audio_inputs.len() > 3 {
            return Err(anyhow::anyhow!(
                "Maximum 3 audio tracks supported, got {}",
                audio_inputs.len()
            ));
        }

        tracing::info!(
            event = "audio_mux_start",
            video_path = %video_path.display(),
            audio_track_count = audio_inputs.len(),
            output_path = %output_path.display(),
            "Starting audio muxing with {} track(s)",
            audio_inputs.len()
        );

        // Verify video file exists
        if !video_path.exists() {
            return Err(anyhow::anyhow!(
                "Video file not found: {}",
                video_path.display()
            ));
        }

        // Verify all audio files exist
        for (idx, audio_input) in audio_inputs.iter().enumerate() {
            if !audio_input.pcm_path.exists() {
                return Err(anyhow::anyhow!(
                    "Audio file {} not found: {}",
                    idx,
                    audio_input.pcm_path.display()
                ));
            }
        }

        // Build FFmpeg command for muxing
        let mut command = FfmpegCommand::new();

        // Input 0: Video file (already encoded H.264)
        command.arg("-i").arg(&video_path);

        // Inputs 1-N: Audio PCM files
        for audio_input in &audio_inputs {
            command
                .arg("-f")
                .arg("s16le") // PCM signed 16-bit little-endian
                .arg("-ar")
                .arg(audio_input.sample_rate.to_string())
                .arg("-ac")
                .arg(audio_input.channels.to_string())
                .arg("-i")
                .arg(&audio_input.pcm_path);
        }

        // Map video stream from input 0
        command.arg("-map").arg("0:v");

        // Map each audio stream (inputs 1, 2, 3, ...)
        for i in 0..audio_inputs.len() {
            command.arg("-map").arg(format!("{}:a", i + 1));
        }

        // Video codec: copy (already encoded)
        command.arg("-c:v").arg("copy");

        // Audio codec: AAC for all tracks
        command.arg("-c:a").arg("aac");
        command.arg("-b:a").arg("192k");

        // Output format
        command.arg("-f").arg("mp4");
        command.arg("-y"); // Overwrite output
        command.arg(&output_path);

        tracing::debug!(
            event = "ffmpeg_mux_command",
            command = format!("{:?}", command),
            "FFmpeg muxing command built"
        );

        // Execute FFmpeg muxing
        let mut child = command
            .spawn()
            .context("Failed to spawn FFmpeg for audio muxing")?;

        // Wait for muxing to complete
        let result = child.wait().context("FFmpeg muxing process failed")?;

        if !result.success() {
            return Err(anyhow::anyhow!("FFmpeg muxing exited with error"));
        }

        // Verify output file was created
        if !output_path.exists() {
            return Err(anyhow::anyhow!(
                "Output file not created: {}",
                output_path.display()
            ));
        }

        tracing::info!(
            event = "audio_mux_complete",
            output_path = %output_path.display(),
            "Audio muxing completed successfully"
        );

        Ok(())
    }
}

/// Configuration for audio input during muxing (Story 2.4, Story 4.7)
#[derive(Debug, Clone)]
pub struct AudioInputConfig {
    /// Path to PCM audio file
    pub pcm_path: PathBuf,

    /// Audio sample rate (typically 48000 Hz)
    pub sample_rate: u32,

    /// Audio channel count (typically 2 for stereo)
    pub channels: u16,

    /// Label for this audio track (e.g., "System Audio", "Microphone", "Webcam")
    pub label: String,
}

impl Drop for FFmpegEncoder {
    fn drop(&mut self) {
        // Try to clean up FFmpeg process if still running
        if let Ok(mut process_lock) = self.process.try_lock() {
            if let Some(mut child) = process_lock.take() {
                if let Err(e) = child.kill() {
                    tracing::warn!(
                        event = "encoder_cleanup_failed",
                        error = %e,
                        "Failed to kill FFmpeg process during cleanup"
                    );
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_encoder_creation() {
        let temp_dir = std::env::temp_dir();
        let output_path = temp_dir.join("test_output.mp4");

        let encoder = FFmpegEncoder::new(output_path.clone(), 1920, 1080, 30);
        assert!(encoder.is_ok());

        let encoder = encoder.unwrap();
        assert_eq!(encoder.width, 1920);
        assert_eq!(encoder.height, 1080);
        assert_eq!(encoder.fps, 30);
        assert_eq!(encoder.output_path, output_path);
    }

    #[test]
    fn test_encoder_validates_output_directory() {
        let invalid_path = PathBuf::from("/nonexistent/directory/output.mp4");
        let result = FFmpegEncoder::new(invalid_path, 1920, 1080, 30);

        assert!(result.is_err());
        let error_msg = result.err().unwrap().to_string();
        assert!(error_msg.contains("does not exist"));
    }

    #[tokio::test]
    async fn test_encoder_start_and_stop() {
        let temp_dir = std::env::temp_dir();
        let output_path = temp_dir.join("test_start_stop.mp4");

        // Clean up any existing test file
        if output_path.exists() {
            std::fs::remove_file(&output_path).ok();
        }

        let mut encoder = FFmpegEncoder::new(output_path.clone(), 640, 480, 30)
            .expect("Failed to create encoder");

        // Start encoding
        let start_result = encoder.start_encoding().await;
        assert!(start_result.is_ok(), "Failed to start encoding: {:?}", start_result.err());

        // Verify encoding is active
        assert!(encoder.is_encoding().await);

        // Write a few test frames (solid color frames)
        for i in 0..10 {
            let frame_data = vec![128u8; 640 * 480 * 4];  // Gray frame
            let frame = TimestampedFrame {
                data: frame_data,
                timestamp_ms: i * 33,  // ~30fps timing
                width: 640,
                height: 480,
            };

            let write_result = encoder.write_frame_to_stdin(&frame).await;
            assert!(write_result.is_ok(), "Failed to write frame {}: {:?}", i, write_result.err());
        }

        // Stop encoding
        let stop_result = encoder.stop_encoding().await;
        assert!(stop_result.is_ok(), "Failed to stop encoding: {:?}", stop_result.err());

        // Verify output file exists
        assert!(output_path.exists(), "Output file was not created");

        // Verify file has content
        let metadata = std::fs::metadata(&output_path).expect("Failed to read output file metadata");
        assert!(metadata.len() > 0, "Output file is empty");

        // Clean up
        std::fs::remove_file(&output_path).ok();
    }

    #[tokio::test]
    async fn test_write_frame_validates_dimensions() {
        let temp_dir = std::env::temp_dir();
        let output_path = temp_dir.join("test_dimensions.mp4");

        let mut encoder = FFmpegEncoder::new(output_path.clone(), 1920, 1080, 30)
            .expect("Failed to create encoder");

        encoder.start_encoding().await.expect("Failed to start encoding");

        // Try to write frame with wrong dimensions
        let wrong_frame = TimestampedFrame {
            data: vec![0u8; 640 * 480 * 4],
            timestamp_ms: 0,
            width: 640,  // Wrong width
            height: 480,  // Wrong height
        };

        let result = encoder.write_frame_to_stdin(&wrong_frame).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("do not match"));

        // Clean up
        encoder.kill().await.ok();
        std::fs::remove_file(&output_path).ok();
    }

    #[tokio::test]
    async fn test_write_frame_validates_data_size() {
        let temp_dir = std::env::temp_dir();
        let output_path = temp_dir.join("test_data_size.mp4");

        let mut encoder = FFmpegEncoder::new(output_path.clone(), 640, 480, 30)
            .expect("Failed to create encoder");

        encoder.start_encoding().await.expect("Failed to start encoding");

        // Try to write frame with wrong data size
        let wrong_frame = TimestampedFrame {
            data: vec![0u8; 1000],  // Way too small
            timestamp_ms: 0,
            width: 640,
            height: 480,
        };

        let result = encoder.write_frame_to_stdin(&wrong_frame).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid frame data size"));

        // Clean up
        encoder.kill().await.ok();
        std::fs::remove_file(&output_path).ok();
    }
}
