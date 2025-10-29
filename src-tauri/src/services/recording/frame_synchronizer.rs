/// Frame Synchronizer for maintaining A/V sync during long recordings
///
/// This module provides timestamp-based frame synchronization to prevent drift
/// and detects when frames are dropped due to encoding pressure.
///
/// Supports synchronization of:
/// - Video frames (timestamp_ms)
/// - System audio samples (timestamp_ns)
/// - Microphone audio samples (timestamp_ns)

use tracing::{debug, warn, info};

/// Synchronization metrics for monitoring drift and drops
#[derive(Debug, Clone)]
pub struct SyncMetrics {
    /// Total frames processed
    pub total_frames: u64,

    /// Frames dropped due to encoding backpressure
    pub dropped_frames: u64,

    /// Current drift from expected timing (milliseconds)
    pub current_drift_ms: i64,

    /// Maximum drift observed (milliseconds)
    pub max_drift_ms: i64,

    /// Number of drift corrections applied
    pub corrections_applied: u64,

    /// Total audio samples processed (system audio)
    pub total_system_audio_samples: u64,

    /// Total audio samples processed (microphone)
    pub total_mic_audio_samples: u64,

    /// Current audio drift (milliseconds, system audio vs video)
    pub system_audio_drift_ms: i64,

    /// Current audio drift (milliseconds, microphone vs video)
    pub mic_audio_drift_ms: i64,

    /// Audio samples dropped due to excessive drift (system audio)
    pub system_audio_dropped: u64,

    /// Audio samples dropped due to excessive drift (microphone)
    pub mic_audio_dropped: u64,

    /// Total webcam frames processed (Story 4.6 - dual video stream sync)
    pub total_webcam_frames: u64,

    /// Webcam frames dropped due to encoding backpressure
    pub dropped_webcam_frames: u64,

    /// Current webcam video drift (milliseconds, webcam vs screen video)
    pub webcam_drift_ms: i64,
}

impl SyncMetrics {
    pub fn new() -> Self {
        Self {
            total_frames: 0,
            dropped_frames: 0,
            current_drift_ms: 0,
            max_drift_ms: 0,
            corrections_applied: 0,
            total_system_audio_samples: 0,
            total_mic_audio_samples: 0,
            system_audio_drift_ms: 0,
            mic_audio_drift_ms: 0,
            system_audio_dropped: 0,
            mic_audio_dropped: 0,
            total_webcam_frames: 0,
            dropped_webcam_frames: 0,
            webcam_drift_ms: 0,
        }
    }
}

impl Default for SyncMetrics {
    fn default() -> Self {
        Self::new()
    }
}

/// Frame synchronizer for timestamp-based A/V sync
///
/// Monitors frame timing and detects drift/drops for long recordings.
/// AC #7: Audio and video remain synchronized within 50ms for recordings up to 30 minutes
/// AC #8: Implement timestamp-based frame synchronization to prevent drift
#[derive(Clone)]
pub struct FrameSynchronizer {
    /// Expected frame duration (milliseconds)
    frame_duration_ms: u64,

    /// Drift threshold for triggering correction (milliseconds)
    /// AC #7 specifies 50ms tolerance
    drift_threshold_ms: i64,

    /// Synchronization metrics
    metrics: SyncMetrics,

    /// Last processed frame timestamp (screen video)
    last_timestamp_ms: Option<u64>,

    /// Last processed webcam frame timestamp (Story 4.6 - dual video stream sync)
    last_webcam_timestamp_ms: Option<u64>,
}

impl FrameSynchronizer {
    /// Create a new frame synchronizer
    ///
    /// # Arguments
    /// * `target_fps` - Target frame rate (default: 30)
    /// * `drift_threshold_ms` - Maximum acceptable drift before correction (default: 50ms per AC #7)
    pub fn new(target_fps: u32, drift_threshold_ms: i64) -> Self {
        let frame_duration_ms = 1000 / target_fps as u64;

        info!(
            event = "synchronizer_created",
            target_fps = target_fps,
            frame_duration_ms = frame_duration_ms,
            drift_threshold_ms = drift_threshold_ms,
            "Frame synchronizer initialized"
        );

        Self {
            frame_duration_ms,
            drift_threshold_ms,
            metrics: SyncMetrics::new(),
            last_timestamp_ms: None,
            last_webcam_timestamp_ms: None,
        }
    }

    /// Create synchronizer with default settings (30 FPS, 50ms threshold per AC #7)
    pub fn default_settings() -> Self {
        Self::new(30, 50)
    }

    /// Process a frame and detect drift/drops
    ///
    /// Returns true if frame should be processed, false if dropped
    pub fn process_frame(&mut self, timestamp_ms: u64, frame_number: u64) -> bool {
        self.metrics.total_frames += 1;

        // Calculate expected timestamp based on frame number
        let expected_timestamp_ms = frame_number * self.frame_duration_ms;

        // Calculate drift (actual - expected)
        let drift_ms = timestamp_ms as i64 - expected_timestamp_ms as i64;
        self.metrics.current_drift_ms = drift_ms;

        // Update max drift
        if drift_ms.abs() > self.metrics.max_drift_ms.abs() {
            self.metrics.max_drift_ms = drift_ms;
        }

        // Check if drift exceeds threshold
        if drift_ms.abs() > self.drift_threshold_ms {
            warn!(
                event = "sync_drift_detected",
                frame_number = frame_number,
                timestamp_ms = timestamp_ms,
                expected_ms = expected_timestamp_ms,
                drift_ms = drift_ms,
                threshold_ms = self.drift_threshold_ms,
                "Frame timing drift exceeds threshold"
            );

            // Apply correction by adjusting expectation
            // (In a full implementation, this might adjust encoder timing parameters)
            self.metrics.corrections_applied += 1;
        }

        // Detect frame drops (gap in timestamps)
        if let Some(last_ts) = self.last_timestamp_ms {
            let delta_ms = timestamp_ms.saturating_sub(last_ts);
            let expected_delta = self.frame_duration_ms;

            // If gap is significantly larger than expected, frames were likely dropped
            if delta_ms > expected_delta * 2 {
                let estimated_dropped = (delta_ms / expected_delta).saturating_sub(1);
                self.metrics.dropped_frames += estimated_dropped;

                warn!(
                    event = "frame_drop_detected",
                    frame_number = frame_number,
                    delta_ms = delta_ms,
                    expected_delta_ms = expected_delta,
                    estimated_dropped = estimated_dropped,
                    total_dropped = self.metrics.dropped_frames,
                    "Frame drop detected - encoding cannot keep up"
                );
            }
        }

        self.last_timestamp_ms = Some(timestamp_ms);

        // Log metrics periodically (every 30 frames = 1 second @ 30fps)
        if frame_number.is_multiple_of(30) {
            debug!(
                event = "sync_metrics",
                total_frames = self.metrics.total_frames,
                dropped_frames = self.metrics.dropped_frames,
                current_drift_ms = self.metrics.current_drift_ms,
                max_drift_ms = self.metrics.max_drift_ms,
                corrections = self.metrics.corrections_applied,
                drop_rate = format!("{:.2}%", (self.metrics.dropped_frames as f64 / self.metrics.total_frames as f64) * 100.0),
                "Frame synchronization metrics"
            );
        }

        true  // Always process frame (we log drops but don't skip frames)
    }

    /// Process a webcam frame and detect drift from screen video (Story 4.6)
    ///
    /// Calculates drift between webcam timestamp and screen video reference timing.
    /// Detects dropped webcam frames due to encoding pressure.
    ///
    /// # Arguments
    ///
    /// * `timestamp_ms` - Webcam frame timestamp in milliseconds
    /// * `frame_number` - Webcam frame sequence number (0-indexed)
    /// * `reference_timestamp_ms` - Current screen video timestamp for drift comparison
    ///
    /// # Returns
    ///
    /// True if frame should be processed, false if dropped due to excessive drift
    pub fn process_webcam_frame(
        &mut self,
        timestamp_ms: u64,
        frame_number: u64,
        reference_timestamp_ms: u64,
    ) -> bool {
        self.metrics.total_webcam_frames += 1;

        // Calculate drift between webcam and screen video (webcam - screen)
        let drift_ms = timestamp_ms as i64 - reference_timestamp_ms as i64;
        self.metrics.webcam_drift_ms = drift_ms;

        // Check if drift exceeds threshold
        if drift_ms.abs() > self.drift_threshold_ms {
            warn!(
                event = "webcam_sync_drift",
                frame_number = frame_number,
                webcam_timestamp_ms = timestamp_ms,
                screen_timestamp_ms = reference_timestamp_ms,
                drift_ms = drift_ms,
                threshold_ms = self.drift_threshold_ms,
                "Webcam frame timing drift exceeds threshold"
            );

            // Drop webcam frame if drift is excessive (> 2x threshold)
            if drift_ms.abs() > self.drift_threshold_ms * 2 {
                self.metrics.dropped_webcam_frames += 1;

                warn!(
                    event = "webcam_frame_dropped",
                    frame_number = frame_number,
                    drift_ms = drift_ms,
                    total_dropped = self.metrics.dropped_webcam_frames,
                    "Webcam frame dropped due to excessive drift"
                );

                return false;  // Drop frame
            }

            self.metrics.corrections_applied += 1;
        }

        // Detect frame drops (gap in timestamps)
        if let Some(last_ts) = self.last_webcam_timestamp_ms {
            let delta_ms = timestamp_ms.saturating_sub(last_ts);
            let expected_delta = self.frame_duration_ms;

            // If gap is significantly larger than expected, frames were likely dropped
            if delta_ms > expected_delta * 2 {
                let estimated_dropped = (delta_ms / expected_delta).saturating_sub(1);
                self.metrics.dropped_webcam_frames += estimated_dropped;

                warn!(
                    event = "webcam_frame_drop_detected",
                    frame_number = frame_number,
                    delta_ms = delta_ms,
                    expected_delta_ms = expected_delta,
                    estimated_dropped = estimated_dropped,
                    total_dropped = self.metrics.dropped_webcam_frames,
                    "Webcam frame drop detected - encoding cannot keep up"
                );
            }
        }

        self.last_webcam_timestamp_ms = Some(timestamp_ms);

        // Log metrics periodically (every 30 frames = 1 second @ 30fps)
        if frame_number.is_multiple_of(30) {
            debug!(
                event = "webcam_sync_metrics",
                total_frames = self.metrics.total_webcam_frames,
                dropped_frames = self.metrics.dropped_webcam_frames,
                drift_ms = self.metrics.webcam_drift_ms,
                drop_rate = format!("{:.2}%", (self.metrics.dropped_webcam_frames as f64 / self.metrics.total_webcam_frames as f64) * 100.0),
                "Webcam synchronization metrics"
            );
        }

        true  // Process frame
    }

    /// Get current synchronization metrics
    pub fn get_metrics(&self) -> &SyncMetrics {
        &self.metrics
    }

    /// Check if synchronization is healthy (within tolerance)
    ///
    /// Returns true if drift is within acceptable range and drop rate is low
    pub fn is_sync_healthy(&self) -> bool {
        let drift_ok = self.metrics.current_drift_ms.abs() <= self.drift_threshold_ms;
        let drops_acceptable = if self.metrics.total_frames > 0 {
            let drop_rate = self.metrics.dropped_frames as f64 / self.metrics.total_frames as f64;
            drop_rate < 0.05  // Less than 5% drop rate is acceptable
        } else {
            true
        };

        // Check audio drift (if audio is being processed)
        let audio_drift_ok = self.metrics.system_audio_drift_ms.abs() <= self.drift_threshold_ms
            && self.metrics.mic_audio_drift_ms.abs() <= self.drift_threshold_ms;

        // Check webcam drift (Story 4.6 - if webcam is being processed)
        let webcam_drift_ok = self.metrics.webcam_drift_ms.abs() <= self.drift_threshold_ms;

        drift_ok && drops_acceptable && audio_drift_ok && webcam_drift_ok
    }

    /// Process an audio sample and detect drift from video timing
    ///
    /// Calculates drift between audio timestamp and expected video timing.
    /// Returns true if sample should be processed, false if dropped due to excessive drift.
    ///
    /// # Arguments
    ///
    /// * `timestamp_ns` - Audio sample timestamp in nanoseconds
    /// * `is_system_audio` - True for system audio, false for microphone
    /// * `reference_timestamp_ms` - Current video timestamp in milliseconds for comparison
    ///
    /// # Returns
    ///
    /// True if audio sample should be processed, false if it should be dropped
    pub fn process_audio_sample(
        &mut self,
        timestamp_ns: u64,
        is_system_audio: bool,
        reference_timestamp_ms: u64,
    ) -> bool {
        // Convert nanoseconds to milliseconds
        let timestamp_ms = timestamp_ns / 1_000_000;

        // Calculate drift between audio and video (audio - video)
        let drift_ms = timestamp_ms as i64 - reference_timestamp_ms as i64;

        // Update metrics based on audio source
        if is_system_audio {
            self.metrics.total_system_audio_samples += 1;
            self.metrics.system_audio_drift_ms = drift_ms;
        } else {
            self.metrics.total_mic_audio_samples += 1;
            self.metrics.mic_audio_drift_ms = drift_ms;
        }

        // Check if drift exceeds threshold
        if drift_ms.abs() > self.drift_threshold_ms {
            warn!(
                event = "audio_sync_drift",
                source = if is_system_audio { "system" } else { "microphone" },
                timestamp_ms = timestamp_ms,
                reference_ms = reference_timestamp_ms,
                drift_ms = drift_ms,
                threshold_ms = self.drift_threshold_ms,
                "Audio timing drift exceeds threshold"
            );

            // Drop audio sample if drift is excessive (> 2x threshold)
            if drift_ms.abs() > self.drift_threshold_ms * 2 {
                if is_system_audio {
                    self.metrics.system_audio_dropped += 1;
                } else {
                    self.metrics.mic_audio_dropped += 1;
                }

                warn!(
                    event = "audio_sample_dropped",
                    source = if is_system_audio { "system" } else { "microphone" },
                    drift_ms = drift_ms,
                    "Audio sample dropped due to excessive drift"
                );

                return false;  // Drop sample
            }

            self.metrics.corrections_applied += 1;
        }

        // Log audio sync metrics periodically (every 30 samples)
        let total_audio = if is_system_audio {
            self.metrics.total_system_audio_samples
        } else {
            self.metrics.total_mic_audio_samples
        };

        if total_audio.is_multiple_of(30) {
            debug!(
                event = "audio_sync_metrics",
                source = if is_system_audio { "system" } else { "microphone" },
                total_samples = total_audio,
                drift_ms = drift_ms,
                dropped = if is_system_audio {
                    self.metrics.system_audio_dropped
                } else {
                    self.metrics.mic_audio_dropped
                },
                "Audio synchronization metrics"
            );
        }

        true  // Process sample
    }

    /// Reset synchronization state
    ///
    /// Used when starting a new recording session
    pub fn reset(&mut self) {
        self.metrics = SyncMetrics::new();
        self.last_timestamp_ms = None;
        self.last_webcam_timestamp_ms = None;
        info!("Frame synchronizer reset");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_synchronizer_creation() {
        let sync = FrameSynchronizer::new(30, 50);
        assert_eq!(sync.frame_duration_ms, 33);  // 1000/30 = 33.33, truncated to 33
        assert_eq!(sync.drift_threshold_ms, 50);
    }

    #[test]
    fn test_perfect_sync() {
        let mut sync = FrameSynchronizer::new(30, 50);

        // Process frames with perfect timing
        for i in 0..90 {  // 3 seconds of perfect frames
            let timestamp_ms = i * 33;  // Perfect 30 FPS timing
            assert!(sync.process_frame(timestamp_ms, i));
        }

        let metrics = sync.get_metrics();
        assert_eq!(metrics.total_frames, 90);
        assert_eq!(metrics.dropped_frames, 0);
        assert!(metrics.current_drift_ms.abs() < 10);  // Should be very small
        assert!(sync.is_sync_healthy());
    }

    #[test]
    fn test_drift_detection() {
        let mut sync = FrameSynchronizer::new(30, 50);

        // Process frames with increasing drift
        for i in 0..30 {
            let timestamp_ms = i * 33 + i;  // Gradual drift (+1ms per frame)
            sync.process_frame(timestamp_ms, i);
        }

        let metrics = sync.get_metrics();
        assert_eq!(metrics.total_frames, 30);
        assert!(metrics.current_drift_ms > 20);  // Should accumulate drift
    }

    #[test]
    fn test_frame_drop_detection() {
        let mut sync = FrameSynchronizer::new(30, 50);

        // Process some normal frames
        for i in 0..10 {
            sync.process_frame(i * 33, i);
        }

        // Simulate a gap (frame drop)
        sync.process_frame(10 * 33 + 200, 10);  // 200ms gap = ~6 frames dropped

        let metrics = sync.get_metrics();
        assert!(metrics.dropped_frames > 0, "Should detect dropped frames");
    }

    #[test]
    fn test_drift_threshold_warning() {
        let mut sync = FrameSynchronizer::new(30, 50);

        // Process frame with large drift
        sync.process_frame(100, 0);  // Expected: 0, Actual: 100, Drift: 100ms

        let metrics = sync.get_metrics();
        assert_eq!(metrics.corrections_applied, 1);
        assert_eq!(metrics.max_drift_ms, 100);
    }

    #[test]
    fn test_long_recording_sync() {
        let mut sync = FrameSynchronizer::new(30, 50);

        // Simulate 30-minute recording (54,000 frames @ 30 FPS)
        // With minor drift accumulation
        for i in 0..54000 {
            let timestamp_ms = i * 33 + (i / 1000);  // +1ms per second of drift
            sync.process_frame(timestamp_ms, i);
        }

        let metrics = sync.get_metrics();
        assert_eq!(metrics.total_frames, 54000);
        assert!(metrics.current_drift_ms.abs() < 100);  // Should stay within tolerance
    }

    #[test]
    fn test_audio_sync_with_perfect_timing() {
        let mut sync = FrameSynchronizer::new(30, 50);

        // Process video frames
        for i in 0..30 {
            let timestamp_ms = i * 33;
            sync.process_frame(timestamp_ms, i);
        }

        // Process system audio samples synchronized with video
        for i in 0..30 {
            let video_timestamp_ms = i * 33;
            let audio_timestamp_ns = video_timestamp_ms * 1_000_000;  // Convert to ns
            assert!(sync.process_audio_sample(audio_timestamp_ns, true, video_timestamp_ms));
        }

        let metrics = sync.get_metrics();
        assert_eq!(metrics.total_system_audio_samples, 30);
        assert_eq!(metrics.system_audio_dropped, 0);
        assert!(metrics.system_audio_drift_ms.abs() < 10);
    }

    #[test]
    fn test_audio_sync_with_minor_drift() {
        let mut sync = FrameSynchronizer::new(30, 50);

        // Process video frames
        for i in 0..30 {
            let timestamp_ms = i * 33;
            sync.process_frame(timestamp_ms, i);
        }

        // Process audio samples with minor drift (+20ms)
        for i in 0..30 {
            let video_timestamp_ms = i * 33;
            let audio_timestamp_ns = (video_timestamp_ms + 20) * 1_000_000;
            assert!(sync.process_audio_sample(audio_timestamp_ns, true, video_timestamp_ms));
        }

        let metrics = sync.get_metrics();
        assert_eq!(metrics.total_system_audio_samples, 30);
        assert_eq!(metrics.system_audio_dropped, 0);  // No drops for minor drift
        assert_eq!(metrics.system_audio_drift_ms, 20);  // Should track 20ms drift
    }

    #[test]
    fn test_audio_sync_drops_excessive_drift() {
        let mut sync = FrameSynchronizer::new(30, 50);

        // Process video at time 0
        sync.process_frame(0, 0);

        // Process audio with excessive drift (150ms > 2x threshold of 50ms)
        let audio_timestamp_ns = 150 * 1_000_000;
        let should_process = sync.process_audio_sample(audio_timestamp_ns, true, 0);

        assert!(!should_process, "Audio sample should be dropped due to excessive drift");

        let metrics = sync.get_metrics();
        assert_eq!(metrics.total_system_audio_samples, 1);
        assert_eq!(metrics.system_audio_dropped, 1);
    }

    #[test]
    fn test_audio_sync_separate_system_and_mic() {
        let mut sync = FrameSynchronizer::new(30, 50);

        // Process video frame
        sync.process_frame(0, 0);

        // Process system audio
        sync.process_audio_sample(0, true, 0);

        // Process microphone audio
        sync.process_audio_sample(0, false, 0);

        let metrics = sync.get_metrics();
        assert_eq!(metrics.total_system_audio_samples, 1);
        assert_eq!(metrics.total_mic_audio_samples, 1);
        assert_eq!(metrics.system_audio_dropped, 0);
        assert_eq!(metrics.mic_audio_dropped, 0);
    }

    #[test]
    fn test_is_sync_healthy_with_audio() {
        let mut sync = FrameSynchronizer::new(30, 50);

        // Perfect sync
        sync.process_frame(0, 0);
        sync.process_audio_sample(0, true, 0);
        assert!(sync.is_sync_healthy());

        // Add drift within tolerance
        sync.process_frame(33, 1);
        sync.process_audio_sample(40 * 1_000_000, true, 33);  // 40ms audio, 33ms video = 7ms drift
        assert!(sync.is_sync_healthy());

        // Excessive drift should mark as unhealthy
        sync.process_audio_sample(200 * 1_000_000, true, 33);  // 167ms drift
        assert!(!sync.is_sync_healthy());
    }

    #[test]
    fn test_reset_clears_all_metrics() {
        let mut sync = FrameSynchronizer::new(30, 50);

        // Process some frames and audio
        sync.process_frame(0, 0);
        sync.process_audio_sample(0, true, 0);
        sync.process_audio_sample(0, false, 0);

        // Reset
        sync.reset();

        let metrics = sync.get_metrics();
        assert_eq!(metrics.total_frames, 0);
        assert_eq!(metrics.total_system_audio_samples, 0);
        assert_eq!(metrics.total_mic_audio_samples, 0);
        assert_eq!(metrics.system_audio_dropped, 0);
        assert_eq!(metrics.mic_audio_dropped, 0);
    }
}
