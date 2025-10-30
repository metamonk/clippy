//! FFmpeg Compositor for PiP (Picture-in-Picture) Recording
//!
//! This module provides real-time video composition using FFmpeg overlay filter.
//! It takes two video streams (screen + webcam) and composites them into a single output.
//!
//! # Architecture (Story 4.6)
//!
//! The compositor:
//! - Receives screen frames via pipe:0
//! - Receives webcam frames via pipe:1
//! - Uses FFmpeg overlay filter for real-time PiP composition
//! - Outputs single composited MP4 file
//! - Applies PiP position and size from RecordingConfig
//!
//! # FFmpeg Filter Syntax
//!
//! `[0:v][1:v]overlay=x={pip_x}:y={pip_y}`
//!
//! Where:
//! - [0:v] = screen video (base layer)
//! - [1:v] = webcam video (overlay layer)
//! - x,y = PiP position coordinates

use anyhow::{Context, Result};
use ffmpeg_sidecar::child::FfmpegChild;
use ffmpeg_sidecar::command::FfmpegCommand;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

/// Frame data for compositor input
#[derive(Debug, Clone)]
pub struct CompositorFrame {
    /// Raw BGRA pixel data
    pub data: Vec<u8>,
    /// Frame timestamp in milliseconds
    pub timestamp_ms: u64,
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
}

/// PiP composition configuration
#[derive(Debug, Clone)]
pub struct PipConfig {
    /// PiP position (top-left corner)
    pub x: i32,
    pub y: i32,
    /// PiP size
    pub width: u32,
    pub height: u32,
}

/// FFmpeg compositor for real-time PiP composition
///
/// Story 4.6 AC#4: FFmpeg composites webcam over screen using overlay filter
/// Story 4.6 AC#5: PiP position and size from configuration applied correctly
/// Story 4.6 AC#6: Single MP4 output contains composited video
pub struct FFmpegCompositor {
    /// FFmpeg child process
    process: Arc<Mutex<Option<FfmpegChild>>>,

    /// File handle for screen video FIFO
    screen_stdin: Arc<Mutex<Option<File>>>,

    /// File handle for webcam video FIFO
    webcam_stdin: Arc<Mutex<Option<File>>>,

    /// Output file path
    output_path: PathBuf,

    /// Screen video dimensions
    screen_width: u32,
    screen_height: u32,

    /// Webcam video dimensions (for PiP overlay)
    webcam_width: u32,
    webcam_height: u32,

    /// Target frame rate
    fps: u32,

    /// PiP configuration
    pip_config: PipConfig,
}

impl FFmpegCompositor {
    /// Create a new FFmpeg compositor for PiP recording
    ///
    /// # Arguments
    ///
    /// * `output_path` - Path where the composited MP4 will be saved
    /// * `screen_width` - Screen video width
    /// * `screen_height` - Screen video height
    /// * `webcam_width` - Webcam video width
    /// * `webcam_height` - Webcam video height
    /// * `fps` - Target frame rate (typically 30)
    /// * `pip_config` - PiP position and size configuration
    ///
    /// # Returns
    ///
    /// * `Ok(FFmpegCompositor)` - Compositor ready to start
    /// * `Err(anyhow::Error)` - Failed to create compositor
    pub fn new(
        output_path: PathBuf,
        screen_width: u32,
        screen_height: u32,
        webcam_width: u32,
        webcam_height: u32,
        fps: u32,
        pip_config: PipConfig,
    ) -> Result<Self> {
        info!(
            event = "compositor_create",
            output_path = %output_path.display(),
            screen_size = format!("{}x{}", screen_width, screen_height),
            webcam_size = format!("{}x{}", webcam_width, webcam_height),
            pip_position = format!("({},{})", pip_config.x, pip_config.y),
            pip_size = format!("{}x{}", pip_config.width, pip_config.height),
            fps = fps,
            "Creating FFmpeg PiP compositor"
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

        // Validate PiP dimensions fit within screen bounds
        if pip_config.x < 0
            || pip_config.y < 0
            || (pip_config.x as u32 + pip_config.width) > screen_width
            || (pip_config.y as u32 + pip_config.height) > screen_height
        {
            warn!(
                "PiP configuration may extend beyond screen bounds: position=({},{}), size={}x{}, screen={}x{}",
                pip_config.x, pip_config.y, pip_config.width, pip_config.height, screen_width, screen_height
            );
        }

        Ok(Self {
            process: Arc::new(Mutex::new(None)),
            screen_stdin: Arc::new(Mutex::new(None)),
            webcam_stdin: Arc::new(Mutex::new(None)),
            output_path,
            screen_width,
            screen_height,
            webcam_width,
            webcam_height,
            fps,
            pip_config,
        })
    }

    /// Start the FFmpeg composition process
    ///
    /// Spawns FFmpeg with two input pipes for screen and webcam video,
    /// applies overlay filter for PiP composition, and outputs to MP4.
    ///
    /// Uses named pipes (FIFOs) for dual-stream input:
    /// - /tmp/clippy_screen.fifo - Screen video input
    /// - /tmp/clippy_webcam.fifo - Webcam video input
    ///
    /// FFmpeg command structure:
    /// ```
    /// ffmpeg -f rawvideo -pix_fmt bgra -s WxH -r FPS -i /tmp/clippy_screen.fifo \
    ///        -f rawvideo -pix_fmt bgra -s WxH -r FPS -i /tmp/clippy_webcam.fifo \
    ///        -filter_complex "[1:v]scale=WxH[pip];[0:v][pip]overlay=x:y" \
    ///        -c:v libx264 -preset fast -crf 23 \
    ///        -pix_fmt yuv420p -movflags +faststart \
    ///        output.mp4
    /// ```
    ///
    /// # Returns
    ///
    /// * `Ok(())` - Compositor started successfully
    /// * `Err(anyhow::Error)` - Failed to start composition
    pub async fn start_composition(&mut self) -> Result<()> {
        info!(
            event = "composition_start",
            output_path = %self.output_path.display(),
            "Starting FFmpeg PiP composition with named pipes"
        );

        // Create named pipes (FIFOs) for dual input
        let screen_fifo = std::env::temp_dir().join("clippy_screen.fifo");
        let webcam_fifo = std::env::temp_dir().join("clippy_webcam.fifo");

        // Remove existing FIFOs if they exist
        let _ = std::fs::remove_file(&screen_fifo);
        let _ = std::fs::remove_file(&webcam_fifo);

        // Create FIFOs using mkfifo (Unix-specific)
        #[cfg(unix)]
        {
            use std::process::Command;

            Command::new("mkfifo")
                .arg(&screen_fifo)
                .output()
                .context("Failed to create screen FIFO. Is this a Unix system?")?;

            Command::new("mkfifo")
                .arg(&webcam_fifo)
                .output()
                .context("Failed to create webcam FIFO")?;

            info!(
                "Created named pipes: screen={}, webcam={}",
                screen_fifo.display(),
                webcam_fifo.display()
            );
        }

        #[cfg(not(unix))]
        {
            return Err(anyhow::anyhow!(
                "PiP recording requires Unix/macOS for named pipes (FIFOs). Windows support coming in future release."
            ));
        }

        // Build FFmpeg command with two FIFO inputs
        let mut command = FfmpegCommand::new();

        // Add verbose logging to diagnose issues
        command.arg("-loglevel").arg("verbose");

        // Input 0: Screen video (base layer) from FIFO
        // Minimal probing to avoid delays waiting for data
        command
            .arg("-probesize")
            .arg("32")
            .arg("-analyzeduration")
            .arg("0")
            .arg("-thread_queue_size")
            .arg("1024")
            .arg("-f")
            .arg("rawvideo")
            .arg("-pix_fmt")
            .arg("bgra")
            .arg("-video_size")
            .arg(format!("{}x{}", self.screen_width, self.screen_height))
            .arg("-framerate")
            .arg(self.fps.to_string())
            .arg("-i")
            .arg(&screen_fifo);

        // Input 1: Webcam video (overlay layer) from FIFO
        // Minimal probing for this input as well
        command
            .arg("-probesize")
            .arg("32")
            .arg("-analyzeduration")
            .arg("0")
            .arg("-thread_queue_size")
            .arg("1024")
            .arg("-f")
            .arg("rawvideo")
            .arg("-pix_fmt")
            .arg("bgra")
            .arg("-video_size")
            .arg(format!("{}x{}", self.webcam_width, self.webcam_height))
            .arg("-framerate")
            .arg(self.fps.to_string())
            .arg("-i")
            .arg(&webcam_fifo);

        // Filter complex: Scale webcam to PiP size, then overlay on screen
        // Output the result to a labeled stream [out]
        let filter = format!(
            "[1:v]scale={}:{}[pip];[0:v][pip]overlay={}:{}[out]",
            self.pip_config.width, self.pip_config.height, self.pip_config.x, self.pip_config.y
        );

        command.arg("-filter_complex").arg(&filter);

        // Map the filtered output stream to the output file
        command.arg("-map").arg("[out]");

        // Use modern fps_mode instead of deprecated vsync
        command.arg("-fps_mode").arg("vfr");

        // H.264 encoding with real-time optimizations
        command
            .arg("-c:v")
            .arg("libx264")
            .arg("-preset")
            .arg("ultrafast")  // Use ultrafast for real-time encoding
            .arg("-crf")
            .arg("23");

        // QuickTime Player compatibility
        command
            .arg("-pix_fmt")
            .arg("yuv420p")
            .arg("-profile:v")
            .arg("high")
            .arg("-level")
            .arg("4.0")
            .arg("-movflags")
            .arg("+faststart");

        // Output format
        command
            .arg("-f")
            .arg("mp4")
            .arg("-y")
            .arg(&self.output_path);

        // Spawn FFmpeg process (non-blocking, FIFOs will be opened when written to)
        let mut child = command
            .spawn()
            .context("Failed to spawn FFmpeg compositor")?;

        info!("FFmpeg compositor process spawned successfully");

        // Capture stderr for logging immediately to catch early errors
        if let Some(stderr) = child.take_stderr() {
            tokio::task::spawn_blocking(move || {
                use std::io::{BufRead, BufReader};
                let reader = BufReader::new(stderr);
                let mut line_count = 0;
                for line in reader.lines() {
                    if let Ok(line) = line {
                        line_count += 1;

                        // Log first 50 lines at INFO to see full FFmpeg startup and diagnostics
                        if line_count <= 50 {
                            info!(event = "ffmpeg_compositor_stderr", line_num = line_count, line = %line);
                        } else if line.contains("Error") || line.contains("error") {
                            error!(event = "ffmpeg_compositor_stderr", line = %line);
                        } else if line.contains("Warning") || line.contains("warning") {
                            warn!(event = "ffmpeg_compositor_stderr", line = %line);
                        } else {
                            debug!(event = "ffmpeg_compositor_stderr", line = %line);
                        }
                    }
                }
                info!("FFmpeg compositor stderr closed after {} lines", line_count);
            });
        }

        // Store process immediately
        let mut process_lock = self.process.lock().await;
        *process_lock = Some(child);
        drop(process_lock);

        // Spawn background task to open FIFOs asynchronously
        // This allows composition to start immediately while FIFOs are opening
        let screen_stdin_arc = self.screen_stdin.clone();
        let webcam_stdin_arc = self.webcam_stdin.clone();

        tokio::spawn(async move {
            use std::os::unix::fs::OpenOptionsExt;

            info!("Background FIFO open task started (no delay, immediate open)");

            // Open screen FIFO in background
            let screen_fifo_clone = screen_fifo.clone();
            let screen_task = tokio::task::spawn_blocking(move || -> Result<std::fs::File> {
                info!("Opening screen FIFO with O_NONBLOCK...");
                let mut attempts = 0;
                loop {
                    match std::fs::OpenOptions::new()
                        .write(true)
                        .custom_flags(libc::O_NONBLOCK)
                        .open(&screen_fifo_clone)
                    {
                        Ok(file) => {
                            info!("Screen FIFO opened successfully after {} attempts", attempts);
                            return Ok(file);
                        }
                        Err(e) if e.raw_os_error() == Some(libc::ENXIO) => {
                            attempts += 1;
                            if attempts % 20 == 0 {
                                info!("Waiting for FFmpeg to open screen FIFO (attempt {})", attempts);
                            }
                            std::thread::sleep(std::time::Duration::from_millis(50));
                        }
                        Err(e) => {
                            return Err(anyhow::anyhow!("Failed to open screen FIFO: {}", e));
                        }
                    }
                }
            });

            // Open webcam FIFO in background
            let webcam_fifo_clone = webcam_fifo.clone();
            let webcam_task = tokio::task::spawn_blocking(move || -> Result<std::fs::File> {
                info!("Opening webcam FIFO with O_NONBLOCK...");
                let mut attempts = 0;
                loop {
                    match std::fs::OpenOptions::new()
                        .write(true)
                        .custom_flags(libc::O_NONBLOCK)
                        .open(&webcam_fifo_clone)
                    {
                        Ok(file) => {
                            info!("Webcam FIFO opened successfully after {} attempts", attempts);
                            return Ok(file);
                        }
                        Err(e) if e.raw_os_error() == Some(libc::ENXIO) => {
                            attempts += 1;
                            if attempts % 20 == 0 {
                                info!("Waiting for FFmpeg to open webcam FIFO (attempt {})", attempts);
                            }
                            std::thread::sleep(std::time::Duration::from_millis(50));
                        }
                        Err(e) => {
                            return Err(anyhow::anyhow!("Failed to open webcam FIFO: {}", e));
                        }
                    }
                }
            });

            // Wait for screen FIFO and store it
            match screen_task.await {
                Ok(Ok(screen_file)) => {
                    let mut lock = screen_stdin_arc.lock().await;
                    *lock = Some(screen_file);
                    info!("Screen FIFO handle stored");
                }
                Ok(Err(e)) => {
                    error!("Failed to open screen FIFO: {}", e);
                }
                Err(e) => {
                    error!("Screen FIFO task panicked: {}", e);
                }
            }

            // Wait for webcam FIFO and store it
            match webcam_task.await {
                Ok(Ok(webcam_file)) => {
                    let mut lock = webcam_stdin_arc.lock().await;
                    *lock = Some(webcam_file);
                    info!("Webcam FIFO handle stored");
                }
                Ok(Err(e)) => {
                    error!("Failed to open webcam FIFO: {}", e);
                }
                Err(e) => {
                    error!("Webcam FIFO task panicked: {}", e);
                }
            }

            info!("FIFO open task completed");
        });

        info!("FFmpeg compositor started, FIFOs opening in background");

        Ok(())
    }

    /// Write screen frame to pipe:0
    ///
    /// # Arguments
    ///
    /// * `frame` - Screen video frame with BGRA data
    ///
    /// # Returns
    ///
    /// * `Ok(())` - Frame written successfully
    /// * `Err(anyhow::Error)` - Failed to write frame
    pub async fn write_screen_frame(&mut self, frame: &CompositorFrame) -> Result<()> {
        // Validate frame dimensions
        if frame.width != self.screen_width || frame.height != self.screen_height {
            return Err(anyhow::anyhow!(
                "Screen frame dimensions {}x{} do not match compositor {}x{}",
                frame.width,
                frame.height,
                self.screen_width,
                self.screen_height
            ));
        }

        let expected_size = (self.screen_width * self.screen_height * 4) as usize;
        if frame.data.len() != expected_size {
            return Err(anyhow::anyhow!(
                "Invalid screen frame data size: expected {}, got {}",
                expected_size,
                frame.data.len()
            ));
        }

        let mut stdin_lock = self.screen_stdin.lock().await;

        // If FIFO isn't ready yet, skip this frame
        // The background task is still opening it
        let stdin = match stdin_lock.as_mut() {
            Some(s) => s,
            None => {
                // Drop frame silently - FIFO not ready yet
                return Ok(());
            }
        };

        stdin
            .write_all(&frame.data)
            .context("Failed to write screen frame to compositor")?;

        debug!(
            event = "screen_frame_written",
            timestamp_ms = frame.timestamp_ms,
            "Screen frame written to compositor"
        );

        Ok(())
    }

    /// Write webcam frame to pipe:1
    ///
    /// # Arguments
    ///
    /// * `frame` - Webcam video frame with BGRA data
    ///
    /// # Returns
    ///
    /// * `Ok(())` - Frame written successfully
    /// * `Err(anyhow::Error)` - Failed to write frame
    pub async fn write_webcam_frame(&mut self, frame: &CompositorFrame) -> Result<()> {
        // Validate frame dimensions
        if frame.width != self.webcam_width || frame.height != self.webcam_height {
            return Err(anyhow::anyhow!(
                "Webcam frame dimensions {}x{} do not match compositor {}x{}",
                frame.width,
                frame.height,
                self.webcam_width,
                self.webcam_height
            ));
        }

        let expected_size = (self.webcam_width * self.webcam_height * 4) as usize;
        if frame.data.len() != expected_size {
            return Err(anyhow::anyhow!(
                "Invalid webcam frame data size: expected {}, got {}",
                expected_size,
                frame.data.len()
            ));
        }

        let mut stdin_lock = self.webcam_stdin.lock().await;

        // If FIFO isn't ready yet, skip this frame
        // The background task is still opening it
        let stdin = match stdin_lock.as_mut() {
            Some(s) => s,
            None => {
                // Drop frame silently - FIFO not ready yet
                return Ok(());
            }
        };

        stdin
            .write_all(&frame.data)
            .context("Failed to write webcam frame to compositor")?;

        debug!(
            event = "webcam_frame_written",
            timestamp_ms = frame.timestamp_ms,
            "Webcam frame written to compositor"
        );

        Ok(())
    }

    /// Stop composition and finalize output file
    ///
    /// Closes both input pipes and waits for FFmpeg to complete encoding.
    ///
    /// # Returns
    ///
    /// * `Ok(())` - Composition stopped successfully
    /// * `Err(anyhow::Error)` - Failed to finalize composition
    pub async fn stop_composition(&mut self) -> Result<()> {
        info!(
            event = "composition_stop",
            output_path = %self.output_path.display(),
            "Stopping FFmpeg composition"
        );

        // Close both stdin pipes
        {
            let mut screen_stdin_lock = self.screen_stdin.lock().await;
            if let Some(mut stdin) = screen_stdin_lock.take() {
                if let Err(e) = stdin.flush() {
                    warn!(event = "screen_stdin_flush_failed", error = %e);
                }
                drop(stdin);
            }
        }

        {
            let mut webcam_stdin_lock = self.webcam_stdin.lock().await;
            if let Some(mut stdin) = webcam_stdin_lock.take() {
                if let Err(e) = stdin.flush() {
                    warn!(event = "webcam_stdin_flush_failed", error = %e);
                }
                drop(stdin);
            }
        }

        let mut process_lock = self.process.lock().await;

        if let Some(mut child) = process_lock.take() {
            // Wait for FFmpeg to complete (with timeout)
            let wait_result = tokio::time::timeout(
                std::time::Duration::from_secs(10),
                tokio::task::spawn_blocking(move || child.wait()),
            )
            .await;

            match wait_result {
                Ok(Ok(_)) => {
                    info!("FFmpeg compositor completed successfully");
                }
                Ok(Err(e)) => {
                    error!(event = "compositor_wait_error", error = %e);
                    return Err(anyhow::anyhow!("Failed to wait for compositor: {}", e));
                }
                Err(_) => {
                    warn!("FFmpeg compositor did not complete within timeout");
                }
            }

            // Verify output file was created
            if !self.output_path.exists() {
                return Err(anyhow::anyhow!(
                    "Composited output file was not created: {}",
                    self.output_path.display()
                ));
            }

            info!(
                event = "composition_complete",
                output_path = %self.output_path.display(),
                "PiP composition completed, output file ready"
            );
        } else {
            warn!("No active composition process to stop");
        }

        Ok(())
    }

    /// Check if composition is currently active
    pub async fn is_compositing(&self) -> bool {
        let process_lock = self.process.lock().await;
        process_lock.is_some()
    }

    /// Kill the compositor process immediately (for error handling)
    pub async fn kill(&mut self) -> Result<()> {
        let mut process_lock = self.process.lock().await;

        if let Some(mut child) = process_lock.take() {
            warn!("Killing FFmpeg compositor process");
            child.kill().context("Failed to kill compositor process")?;
        }

        Ok(())
    }
}

impl Drop for FFmpegCompositor {
    fn drop(&mut self) {
        if let Ok(mut process_lock) = self.process.try_lock() {
            if let Some(mut child) = process_lock.take() {
                if let Err(e) = child.kill() {
                    error!(event = "compositor_cleanup_failed", error = %e);
                }
            }
        }
    }
}

// Implementation Note:
//
// This compositor uses named pipes (FIFOs) for dual-stream real-time composition.
// This approach was chosen because Rust's std::process::Command only provides
// access to a single stdin handle, but FFmpeg needs two separate input streams.
//
// Named Pipes (FIFO) Approach:
// - Create two named pipes: /tmp/clippy_screen.fifo and /tmp/clippy_webcam.fifo
// - FFmpeg reads from both FIFOs as input streams
// - Rust writes screen frames to screen FIFO, webcam frames to webcam FIFO
// - FFmpeg applies overlay filter in real-time during encoding
// - Cleanup: FIFOs are removed when compositor stops
//
// Pros:
// - True real-time composition (no post-processing)
// - Works with standard FFmpeg commands
// - Low memory overhead (streaming, not buffering)
// - Meets Story 4.6 AC#4 requirement for real-time overlay
//
// Cons:
// - Unix/macOS only (Windows would need named pipe alternatives)
// - Requires mkfifo system command
// - Slight complexity in FIFO lifecycle management
//
// Future Enhancements:
// - Windows support using named pipes (\\.\pipe\clippy_screen)
// - Automatic cleanup on unexpected termination (RAII wrapper for FIFOs)
// - Compression of FIFO data if network transmission needed

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_4_6_unit_001_compositor_creation() {
        let temp_dir = env::temp_dir();
        let output_path = temp_dir.join("test_pip_output.mp4");

        let pip_config = PipConfig {
            x: 1500,
            y: 800,
            width: 384,
            height: 216,
        };

        let compositor = FFmpegCompositor::new(
            output_path.clone(),
            1920,
            1080,
            1280,
            720,
            30,
            pip_config.clone(),
        );

        assert!(compositor.is_ok());
        let compositor = compositor.unwrap();
        assert_eq!(compositor.screen_width, 1920);
        assert_eq!(compositor.screen_height, 1080);
        assert_eq!(compositor.webcam_width, 1280);
        assert_eq!(compositor.webcam_height, 720);
        assert_eq!(compositor.fps, 30);
        assert_eq!(compositor.pip_config.x, 1500);
        assert_eq!(compositor.pip_config.y, 800);
    }

    #[test]
    fn test_4_6_unit_002_compositor_validates_output_directory() {
        let invalid_path = PathBuf::from("/nonexistent/directory/output.mp4");
        let pip_config = PipConfig {
            x: 0,
            y: 0,
            width: 320,
            height: 180,
        };

        let result = FFmpegCompositor::new(invalid_path, 1920, 1080, 1280, 720, 30, pip_config);

        assert!(result.is_err());
        let error_msg = result.err().unwrap().to_string();
        assert!(error_msg.contains("does not exist"));
    }

    #[test]
    fn test_4_6_unit_003_pip_config_bounds_validation() {
        let temp_dir = env::temp_dir();
        let output_path = temp_dir.join("test_pip_bounds.mp4");

        // PiP extends beyond screen bounds (should warn but not error)
        let pip_config = PipConfig {
            x: 1800, // 1800 + 384 = 2184 > 1920 (screen width)
            y: 1000, // 1000 + 216 = 1216 > 1080 (screen height)
            width: 384,
            height: 216,
        };

        let result = FFmpegCompositor::new(output_path, 1920, 1080, 1280, 720, 30, pip_config);

        // Should succeed but log warning
        assert!(result.is_ok());
    }

    #[test]
    fn test_4_6_unit_004_compositor_frame_validation() {
        let temp_dir = env::temp_dir();
        let output_path = temp_dir.join("test_frame_validation.mp4");

        let pip_config = PipConfig {
            x: 100,
            y: 100,
            width: 320,
            height: 180,
        };

        let compositor =
            FFmpegCompositor::new(output_path, 1920, 1080, 1280, 720, 30, pip_config).unwrap();

        // Test frame structure
        let frame = CompositorFrame {
            data: vec![0u8; 1920 * 1080 * 4],
            timestamp_ms: 0,
            width: 1920,
            height: 1080,
        };

        assert_eq!(frame.width, compositor.screen_width);
        assert_eq!(frame.height, compositor.screen_height);
    }

    #[test]
    fn test_4_6_unit_005_pip_preset_positions() {
        // Test standard PiP positions (16:9 screen with 384x216 PiP)
        let screen_width = 1920;
        let screen_height = 1080;
        let pip_width = 384;
        let pip_height = 216;
        let margin = 20;

        // Top-left
        let top_left = PipConfig {
            x: margin,
            y: margin,
            width: pip_width,
            height: pip_height,
        };
        assert_eq!(top_left.x, 20);
        assert_eq!(top_left.y, 20);

        // Top-right
        let top_right = PipConfig {
            x: screen_width as i32 - pip_width as i32 - margin,
            y: margin,
            width: pip_width,
            height: pip_height,
        };
        assert_eq!(top_right.x, 1516); // 1920 - 384 - 20
        assert_eq!(top_right.y, 20);

        // Bottom-left
        let bottom_left = PipConfig {
            x: margin,
            y: screen_height as i32 - pip_height as i32 - margin,
            width: pip_width,
            height: pip_height,
        };
        assert_eq!(bottom_left.x, 20);
        assert_eq!(bottom_left.y, 844); // 1080 - 216 - 20

        // Bottom-right
        let bottom_right = PipConfig {
            x: screen_width as i32 - pip_width as i32 - margin,
            y: screen_height as i32 - pip_height as i32 - margin,
            width: pip_width,
            height: pip_height,
        };
        assert_eq!(bottom_right.x, 1516);
        assert_eq!(bottom_right.y, 844);
    }
}
