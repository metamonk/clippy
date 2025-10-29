use anyhow::{anyhow, Result};
use libmpv2::{events::Event, Mpv};
use std::sync::{Arc, Mutex};
use tracing::{debug, info};

/// MPV Player Service
///
/// Wraps libmpv for universal codec support with professional-grade playback
pub struct MpvPlayer {
    mpv: Arc<Mutex<Mpv>>,
}

impl MpvPlayer {
    /// Initialize a new MPV player instance
    pub fn new() -> Result<Self> {
        info!("[MPV] Initializing MPV player");

        // Create MPV instance (will use bundled libmpv)
        let mpv = Mpv::new().map_err(|e| anyhow!("Failed to create MPV instance: {:?}", e))?;

        // Configure MPV for headless video processing
        // Use 'null' video output for no window creation, relying on screenshot-based frame capture
        mpv.set_property("vo", "null").map_err(|e| anyhow!("Failed to set video output: {:?}", e))?;
        mpv.set_property("force-window", "no").map_err(|e| anyhow!("Failed to disable window: {:?}", e))?;

        // Enable audio output for preview playback (Story 3.10.1)
        // Audio driver auto-detected (CoreAudio on macOS, PulseAudio/ALSA on Linux, WASAPI on Windows)
        mpv.set_property("audio", "yes").map_err(|e| anyhow!("Failed to enable audio: {:?}", e))?;

        mpv.set_property("hwdec", "auto").map_err(|e| anyhow!("Failed to enable hardware decoding: {:?}", e))?;
        mpv.set_property("keep-open", "always").map_err(|e| anyhow!("Failed to set keep-open: {:?}", e))?;
        mpv.set_property("pause", "yes").map_err(|e| anyhow!("Failed to start paused: {:?}", e))?;

        // Disable on-screen display
        mpv.set_property("osd-level", "0").map_err(|e| anyhow!("Failed to disable OSD: {:?}", e))?;

        debug!("[MPV] MPV player initialized successfully (headless mode with vo=null)");

        Ok(Self {
            mpv: Arc::new(Mutex::new(mpv)),
        })
    }

    /// Load a video file and wait for FileLoaded event
    pub fn load_file(&self, file_path: &str) -> Result<()> {
        info!("[MPV] Loading file: {}", file_path);

        let mut mpv = self.mpv.lock().unwrap();

        // Issue loadfile command
        mpv.command("loadfile", &[file_path, "replace"])
            .map_err(|e| anyhow!("Failed to load file {}: {:?}", file_path, e))?;

        // Wait for FileLoaded event
        // With vo=null, VideoReconfig doesn't fire, but FileLoaded is sufficient
        let start_time = std::time::Instant::now();
        let timeout_secs = 5.0;

        loop {
            let remaining_timeout = timeout_secs - start_time.elapsed().as_secs_f64();
            if remaining_timeout <= 0.0 {
                return Err(anyhow!("Timeout waiting for file to load"));
            }

            // Wait for next event with remaining timeout
            if let Some(event_result) = mpv.wait_event(remaining_timeout) {
                match event_result {
                    Ok(Event::FileLoaded) => {
                        info!("[MPV] File loaded successfully (FileLoaded event received)");
                        return Ok(());
                    }
                    Ok(Event::EndFile(_reason)) => {
                        return Err(anyhow!("File loading failed - EndFile event received"));
                    }
                    Ok(event) => {
                        // Log other events for debugging
                        debug!("[MPV] Received event while loading: {:?}", event);
                    }
                    Err(e) => {
                        debug!("[MPV] Event polling: {:?}", e);
                    }
                }
            }
        }
    }

    /// Play the loaded video
    pub fn play(&self) -> Result<()> {
        debug!("[MPV] Starting playback");

        let mpv = self.mpv.lock().unwrap();
        mpv.set_property("pause", false)
            .map_err(|e| anyhow!("Failed to start playback: {:?}", e))?;

        Ok(())
    }

    /// Pause playback
    pub fn pause(&self) -> Result<()> {
        debug!("[MPV] Pausing playback");

        let mpv = self.mpv.lock().unwrap();
        mpv.set_property("pause", true)
            .map_err(|e| anyhow!("Failed to pause playback: {:?}", e))?;

        Ok(())
    }

    /// Seek to specific time (in seconds)
    pub fn seek(&self, time_seconds: f64) -> Result<()> {
        debug!("[MPV] Seeking to {} seconds", time_seconds);

        let mpv = self.mpv.lock().unwrap();
        mpv.command("seek", &[&time_seconds.to_string(), "absolute"])
            .map_err(|e| anyhow!("Failed to seek to {} seconds: {:?}", time_seconds, e))?;

        Ok(())
    }

    /// Get current playback time (in seconds)
    pub fn get_time(&self) -> Result<f64> {
        let mpv = self.mpv.lock().unwrap();
        let time: f64 = mpv.get_property("time-pos")
            .map_err(|e| anyhow!("Failed to get current time position: {:?}", e))?;

        // Diagnostic logging for TD-004: Video playback early stop investigation
        // Compare time-pos vs time-remaining vs playtime-remaining to identify discrepancies
        let time_remaining = mpv.get_property::<f64>("time-remaining").ok();
        let playtime_remaining = mpv.get_property::<f64>("playtime-remaining").ok();
        let duration = mpv.get_property::<f64>("duration").ok();

        debug!(
            "[MPV] Playback position - time-pos: {:.3}s, time-remaining: {:?}, playtime-remaining: {:?}, duration: {:?}",
            time, time_remaining, playtime_remaining, duration
        );

        Ok(time)
    }

    /// Get video duration (in seconds)
    pub fn get_duration(&self) -> Result<f64> {
        let mpv = self.mpv.lock().unwrap();
        let duration: f64 = mpv.get_property("duration")
            .map_err(|e| anyhow!("Failed to get video duration: {:?}", e))?;

        // Diagnostic logging for TD-004: Compare duration vs length properties
        // Some codecs may report different values for duration vs length (container metadata)
        let length = mpv.get_property::<f64>("length").ok();

        debug!(
            "[MPV] Duration properties - duration: {:.3}s, length: {:?}",
            duration, length
        );

        Ok(duration)
    }

    /// Stop playback and unload file
    pub fn stop(&self) -> Result<()> {
        info!("[MPV] Stopping playback");

        let mpv = self.mpv.lock().unwrap();
        mpv.command("stop", &[])
            .map_err(|e| anyhow!("Failed to stop playback: {:?}", e))?;

        debug!("[MPV] Playback stopped");
        Ok(())
    }

    /// Check if video is currently playing
    pub fn is_playing(&self) -> Result<bool> {
        let mpv = self.mpv.lock().unwrap();
        let paused: bool = mpv.get_property("pause")
            .map_err(|e| anyhow!("Failed to get pause state: {:?}", e))?;

        Ok(!paused)
    }

    /// Get video width
    /// Note: load_file() waits for VideoReconfig event, ensuring dimensions are available
    pub fn get_width(&self) -> Result<i64> {
        let mpv = self.mpv.lock().unwrap();
        mpv.get_property::<i64>("width")
            .or_else(|_| mpv.get_property::<i64>("dwidth"))
            .map_err(|e| anyhow!("Failed to get video width: {:?}", e))
    }

    /// Get video height
    /// Note: load_file() waits for VideoReconfig event, ensuring dimensions are available
    pub fn get_height(&self) -> Result<i64> {
        let mpv = self.mpv.lock().unwrap();
        mpv.get_property::<i64>("height")
            .or_else(|_| mpv.get_property::<i64>("dheight"))
            .map_err(|e| anyhow!("Failed to get video height: {:?}", e))
    }

    /// Capture current frame as JPEG and return base64-encoded data
    pub fn capture_frame(&self) -> Result<Vec<u8>> {
        use std::fs;

        let mpv = self.mpv.lock().unwrap();

        // Create temp directory for screenshots
        let temp_dir = std::env::temp_dir();
        let screenshot_path = temp_dir.join(format!("mpv_frame_{}.jpg", std::process::id()));

        debug!("[MPV] Capturing frame to: {:?}", screenshot_path);

        // Take screenshot (video-only, no subtitles/OSD)
        mpv.command("screenshot-to-file", &[screenshot_path.to_str().unwrap(), "video"])
            .map_err(|e| anyhow!("Failed to capture screenshot: {:?}", e))?;

        // Read the screenshot file
        let image_data = fs::read(&screenshot_path)
            .map_err(|e| anyhow!("Failed to read screenshot file: {:?}", e))?;

        // Clean up temp file
        let _ = fs::remove_file(&screenshot_path);

        Ok(image_data)
    }

    /// Set volume for current playback (Story 3.9.1/3.10.1)
    ///
    /// # Arguments
    /// * `volume` - Volume in Clippy scale (0-200), where 100 is normal
    /// * `muted` - If true, volume is set to 0 regardless of volume parameter
    ///
    /// # Note
    /// MPV uses 0-100 scale, conversion: mpv_volume = min(100, clippy_volume / 2)
    pub fn set_volume(&self, volume: f32, muted: bool) -> Result<()> {
        let mpv = self.mpv.lock().unwrap();

        let mpv_volume = if muted {
            0.0_f64
        } else {
            // Convert from Clippy's 0-200 scale to MPV's 0-100 scale
            // Clippy 100% = MPV 50% (normal)
            // Clippy 200% = MPV 100% (max)
            ((volume as f64) / 2.0).min(100.0).max(0.0)
        };

        debug!("[MPV] Setting volume: {} (clippy: {}, muted: {})", mpv_volume, volume, muted);

        mpv.set_property("volume", mpv_volume)
            .map_err(|e| anyhow!("Failed to set volume: {:?}", e))?;

        Ok(())
    }

    /// Apply fade-in and fade-out audio filters (Story 3.10.1)
    ///
    /// # Arguments
    /// * `fade_in_ms` - Fade-in duration in milliseconds from clip start
    /// * `fade_out_ms` - Fade-out duration in milliseconds before clip end
    /// * `clip_duration_ms` - Total clip duration in milliseconds
    ///
    /// # Implementation Note
    /// Uses MPV's afade audio filter with dynamic timing:
    /// - Fade-in: `afade=t=in:st=0:d={fade_in_sec}`
    /// - Fade-out: `afade=t=out:st={start_time}:d={fade_out_sec}`
    /// Filters are applied in chain: volume → fade-in → fade-out
    pub fn apply_fade_filters(&self, fade_in_ms: u64, fade_out_ms: u64, clip_duration_ms: u64) -> Result<()> {
        let mpv = self.mpv.lock().unwrap();

        // Convert milliseconds to seconds for MPV
        let fade_in_sec = (fade_in_ms as f64) / 1000.0;
        let fade_out_sec = (fade_out_ms as f64) / 1000.0;
        let clip_duration_sec = (clip_duration_ms as f64) / 1000.0;

        // Calculate fade-out start time (clip end - fade duration)
        let fade_out_start = (clip_duration_sec - fade_out_sec).max(0.0);

        // Build audio filter chain
        let mut filters = Vec::new();

        // Add fade-in filter if duration > 0
        if fade_in_ms > 0 {
            filters.push(format!("afade=t=in:st=0:d={}", fade_in_sec));
        }

        // Add fade-out filter if duration > 0
        if fade_out_ms > 0 {
            filters.push(format!("afade=t=out:st={}:d={}", fade_out_start, fade_out_sec));
        }

        // Apply filters (comma-separated chain)
        let filter_string = if !filters.is_empty() {
            filters.join(",")
        } else {
            // Clear filters if no fades specified
            String::from("")
        };

        debug!("[MPV] Applying audio filters: {}", if filter_string.is_empty() { "none" } else { &filter_string });

        mpv.set_property("af", filter_string.as_str())
            .map_err(|e| anyhow!("Failed to apply audio filters: {:?}", e))?;

        Ok(())
    }

    /// Clear all audio filters (Story 3.10.1)
    pub fn clear_audio_filters(&self) -> Result<()> {
        let mpv = self.mpv.lock().unwrap();

        debug!("[MPV] Clearing audio filters");

        mpv.set_property("af", "")
            .map_err(|e| anyhow!("Failed to clear audio filters: {:?}", e))?;

        Ok(())
    }
}

impl Default for MpvPlayer {
    fn default() -> Self {
        Self::new().expect("Failed to create default MPV player")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test dimension retrieval for multiple video codecs
    #[test]
    fn test_dimension_retrieval_all_codecs() {
        // Test files from handoff document
        let test_files = vec![
            ("/Users/zeno/Downloads/test_h264.mp4", "H.264"),
            ("/Users/zeno/Downloads/test_hevc.mp4", "HEVC"),
            ("/Users/zeno/Downloads/test_prores.mov", "ProRes"),
            ("/Users/zeno/Downloads/test_vp9.webm", "VP9"),
        ];

        for (file_path, codec_name) in test_files {
            println!("\n=== Testing {} codec: {} ===", codec_name, file_path);

            // Check if file exists
            if !std::path::Path::new(file_path).exists() {
                println!("⚠️  Skipping {} - file not found", codec_name);
                continue;
            }

            // Create MPV player
            let player = match MpvPlayer::new() {
                Ok(p) => p,
                Err(e) => {
                    panic!("Failed to create MPV player: {}", e);
                }
            };

            // Load file
            let load_result = player.load_file(file_path);
            assert!(
                load_result.is_ok(),
                "{} - Failed to load file: {:?}",
                codec_name,
                load_result.err()
            );
            println!("✅ {} - File loaded successfully", codec_name);

            // Get dimensions (should work immediately after load_file)
            let width_result = player.get_width();
            let height_result = player.get_height();

            assert!(
                width_result.is_ok(),
                "{} - Failed to get width: {:?}",
                codec_name,
                width_result.err()
            );
            assert!(
                height_result.is_ok(),
                "{} - Failed to get height: {:?}",
                codec_name,
                height_result.err()
            );

            let width = width_result.unwrap();
            let height = height_result.unwrap();

            println!("✅ {} - Dimensions: {}x{}", codec_name, width, height);

            // Verify dimensions are reasonable
            assert!(width > 0, "{} - Invalid width: {}", codec_name, width);
            assert!(height > 0, "{} - Invalid height: {}", codec_name, height);
            assert!(
                width <= 7680 && height <= 4320,
                "{} - Dimensions too large: {}x{} (max 8K)",
                codec_name,
                width,
                height
            );

            // Stop playback
            let _ = player.stop();
            println!("✅ {} - Test completed successfully", codec_name);
        }

        println!("\n=== All codec tests passed! ===");
    }

    /// Test that dimensions remain consistent across multiple calls
    #[test]
    fn test_dimension_consistency() {
        let test_file = "/Users/zeno/Downloads/test_h264.mp4";

        if !std::path::Path::new(test_file).exists() {
            println!("⚠️  Skipping consistency test - file not found");
            return;
        }

        let player = MpvPlayer::new().expect("Failed to create MPV player");
        player.load_file(test_file).expect("Failed to load file");

        // Get dimensions multiple times
        let width1 = player.get_width().expect("Failed to get width (1)");
        let height1 = player.get_height().expect("Failed to get height (1)");

        let width2 = player.get_width().expect("Failed to get width (2)");
        let height2 = player.get_height().expect("Failed to get height (2)");

        let width3 = player.get_width().expect("Failed to get width (3)");
        let height3 = player.get_height().expect("Failed to get height (3)");

        assert_eq!(width1, width2, "Width inconsistent between calls 1 and 2");
        assert_eq!(width2, width3, "Width inconsistent between calls 2 and 3");
        assert_eq!(height1, height2, "Height inconsistent between calls 1 and 2");
        assert_eq!(height2, height3, "Height inconsistent between calls 2 and 3");

        println!("✅ Dimensions consistent: {}x{}", width1, height1);
    }

    /// Test playback reaches true end (TD-004 diagnostic test)
    /// This test verifies that video playback reaches 100% of duration
    #[test]
    fn test_playback_reaches_end() {
        use std::thread;
        use std::time::Duration as StdDuration;

        let test_files = vec![
            ("/Users/zeno/Downloads/test_h264.mp4", "H.264"),
            ("/Users/zeno/Downloads/test_hevc.mp4", "HEVC"),
            ("/Users/zeno/Downloads/test_prores.mov", "ProRes"),
            ("/Users/zeno/Downloads/test_vp9.webm", "VP9"),
        ];

        for (file_path, codec_name) in test_files {
            println!("\n=== Testing end-of-playback for {} ===", codec_name);

            if !std::path::Path::new(file_path).exists() {
                println!("⚠️  Skipping {} - file not found", codec_name);
                continue;
            }

            let player = MpvPlayer::new().expect("Failed to create MPV player");
            player.load_file(file_path).expect("Failed to load file");

            let duration = player.get_duration().expect("Failed to get duration");
            println!("📹 Duration: {:.3}s", duration);

            // Seek to 1 second before end
            let seek_target = (duration - 1.0).max(0.0);
            player.seek(seek_target).expect("Failed to seek");
            println!("⏩ Seeked to {:.3}s (1s before end)", seek_target);

            // Start playback
            player.play().expect("Failed to start playback");
            println!("▶️  Playback started");

            // Monitor playback for 2 seconds (should be enough to reach the end)
            let start_time = std::time::Instant::now();
            let mut max_time_reached: f64 = 0.0;

            while start_time.elapsed().as_secs_f64() < 2.0 {
                if let Ok(current_time) = player.get_time() {
                    max_time_reached = max_time_reached.max(current_time);
                }
                thread::sleep(StdDuration::from_millis(50));
            }

            player.pause().expect("Failed to pause");

            println!("🏁 Max time reached: {:.3}s", max_time_reached);
            println!("📊 Completion: {:.1}%", (max_time_reached / duration) * 100.0);

            // Check if we reached at least 98% of duration (allowing small tolerance)
            let completion_ratio = max_time_reached / duration;
            assert!(
                completion_ratio >= 0.98,
                "{} - Playback stopped early at {:.1}% ({:.3}s / {:.3}s)",
                codec_name,
                completion_ratio * 100.0,
                max_time_reached,
                duration
            );

            println!("✅ {} - Playback reached end successfully", codec_name);
        }
    }
}
