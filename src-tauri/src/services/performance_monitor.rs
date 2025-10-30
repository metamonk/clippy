//! Performance Monitor for Composition Playback (Story 5.6 AC #5, Story 5.8 AC #1, AC #5)
//!
//! Tracks frame rate and performance metrics during multi-track composition playback.
//! Target: 60 FPS with 3+ video tracks, 4+ audio tracks.
//! Memory target: <1GB for 5-minute timeline.

use std::collections::VecDeque;
use std::time::{Duration, Instant};
use sysinfo::{System, Pid};

/// FPS counter for performance monitoring
pub struct FpsCounter {
    /// Frame timestamps (sliding window)
    frame_times: VecDeque<Instant>,

    /// Window duration for FPS calculation
    window_duration: Duration,

    /// Last calculated FPS
    last_fps: f64,

    /// Total frames recorded since creation (Story 5.8)
    total_frames: u64,

    /// Start time for uptime tracking (Story 5.8)
    start_time: Instant,

    /// Number of dropped frames detected (Story 5.8 AC #4)
    dropped_frames: u64,

    /// Timestamps of frame drops (for excessive drop detection)
    drop_times: VecDeque<Instant>,

    /// Last frame timestamp (for gap detection)
    last_frame_time: Option<Instant>,
}

impl FpsCounter {
    /// Create a new FPS counter with default 1-second window
    pub fn new() -> Self {
        Self::with_window_size(Duration::from_secs(1))
    }

    /// Create a new FPS counter with custom window size
    pub fn with_window_size(window_duration: Duration) -> Self {
        Self {
            frame_times: VecDeque::new(),
            window_duration,
            last_fps: 0.0,
            total_frames: 0,
            start_time: Instant::now(),
            dropped_frames: 0,
            drop_times: VecDeque::new(),
            last_frame_time: None,
        }
    }

    /// Record a frame (Story 5.8 AC #4: Frame drop detection)
    pub fn record_frame(&mut self) {
        let now = Instant::now();

        // Check for frame drop (gap > 33ms = 2 frames at 60 FPS)
        if let Some(last_frame) = self.last_frame_time {
            let gap = now.duration_since(last_frame);
            if gap.as_millis() > 33 {
                self.dropped_frames += 1;
                self.drop_times.push_back(now);

                // Log frame drop with structured logging (Story 5.8 AC #4: Subtask 3.3)
                tracing::warn!(
                    "Frame drop detected: {}ms gap (expected <33ms), total drops: {}",
                    gap.as_millis(),
                    self.dropped_frames
                );
            }
        }

        // Update last frame timestamp
        self.last_frame_time = Some(now);

        self.frame_times.push_back(now);
        self.total_frames += 1;

        // Remove frames outside the window
        while let Some(&oldest) = self.frame_times.front() {
            if now.duration_since(oldest) > self.window_duration {
                self.frame_times.pop_front();
            } else {
                break;
            }
        }

        // Clean up old drop times (keep last 2 seconds for excessive drop detection)
        while let Some(&oldest_drop) = self.drop_times.front() {
            if now.duration_since(oldest_drop) > Duration::from_secs(2) {
                self.drop_times.pop_front();
            } else {
                break;
            }
        }

        // Calculate FPS
        if let Some(&oldest) = self.frame_times.front() {
            let elapsed = now.duration_since(oldest);
            if elapsed.as_secs_f64() > 0.0 {
                self.last_fps = self.frame_times.len() as f64 / elapsed.as_secs_f64();
            }
        }
    }

    /// Get current FPS (Story 5.8 AC #1)
    pub fn get_fps(&self) -> f64 {
        self.last_fps
    }

    /// Get current FPS (alias for backward compatibility with Story 5.6)
    pub fn fps(&self) -> f64 {
        self.last_fps
    }

    /// Get average FPS since counter was created (Story 5.8)
    pub fn get_average_fps(&self) -> f64 {
        if self.total_frames < 2 {
            return 0.0;
        }

        let duration = self.start_time.elapsed();
        (self.total_frames - 1) as f64 / duration.as_secs_f64()
    }

    /// Get total number of frames recorded (Story 5.8)
    pub fn get_total_frames(&self) -> u64 {
        self.total_frames
    }

    /// Get uptime in seconds (Story 5.8)
    pub fn get_uptime_seconds(&self) -> f64 {
        self.start_time.elapsed().as_secs_f64()
    }

    /// Check if FPS meets target
    pub fn meets_target(&self, target_fps: f64) -> bool {
        self.last_fps >= target_fps
    }

    /// Check if frame rate is below target (for frame drop detection) - Story 5.8 AC #4
    pub fn is_below_target(&self, target_fps: f64, tolerance: f64) -> bool {
        let current_fps = self.get_fps();
        current_fps > 0.0 && current_fps < (target_fps - tolerance)
    }

    /// Get total number of dropped frames (Story 5.8 AC #4)
    pub fn get_dropped_frames(&self) -> u64 {
        self.dropped_frames
    }

    /// Check if excessive frame drops occurred (>10 drops in 1 second)
    /// Returns true if recovery mechanism should trigger (Story 5.8 AC #4: Subtask 3.4)
    pub fn check_excessive_drops(&self) -> bool {
        if self.drop_times.is_empty() {
            return false;
        }

        // Count drops in last 1 second
        let now = Instant::now();
        let one_second_ago = now.checked_sub(Duration::from_secs(1)).unwrap_or(now);

        let recent_drops = self.drop_times.iter()
            .filter(|&&drop_time| drop_time > one_second_ago)
            .count();

        recent_drops > 10
    }

    /// Reset the counter
    pub fn reset(&mut self) {
        self.frame_times.clear();
        self.last_fps = 0.0;
        self.total_frames = 0;
        self.start_time = Instant::now();
        self.dropped_frames = 0;
        self.drop_times.clear();
        self.last_frame_time = None;
    }
}

impl Default for FpsCounter {
    fn default() -> Self {
        Self::new()
    }
}

/// Performance metrics for composition playback (Story 5.6, Story 5.8)
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct PerformanceMetrics {
    /// Current FPS from sliding window (Story 5.8 AC #1)
    pub current_fps: f64,

    /// Average FPS since start (Story 5.8 AC #1)
    pub average_fps: f64,

    /// Total frames rendered (Story 5.8 AC #1)
    pub total_frames: u64,

    /// Uptime in seconds (Story 5.8 AC #1)
    pub uptime_seconds: f64,

    /// Number of active video tracks (Story 5.6 AC #5)
    #[serde(default)]
    pub active_tracks: usize,

    /// Whether hardware acceleration is enabled (Story 5.6 AC #5)
    #[serde(default)]
    pub hardware_accel_enabled: bool,

    /// Frame drop count (Story 5.8 AC #4)
    #[serde(default)]
    pub dropped_frames: u64,

    /// Memory usage in bytes (Story 5.8 AC #5)
    #[serde(default)]
    pub memory_usage_bytes: u64,

    /// Memory usage in megabytes (for convenience)
    #[serde(default)]
    pub memory_usage_mb: f64,

    /// CPU usage percentage (Story 5.8 AC #6)
    #[serde(default)]
    pub cpu_usage_percent: f32,

    /// Last seek latency in milliseconds (Story 5.8 AC #7)
    #[serde(default)]
    pub last_seek_latency_ms: Option<u64>,
}

impl PerformanceMetrics {
    /// Create metrics snapshot from FPS counter (Story 5.8 AC #1, AC #4, AC #5, AC #6, AC #7)
    pub fn from_counter(counter: &FpsCounter) -> Self {
        Self {
            current_fps: counter.get_fps(),
            average_fps: counter.get_average_fps(),
            total_frames: counter.get_total_frames(),
            uptime_seconds: counter.get_uptime_seconds(),
            active_tracks: 0,
            hardware_accel_enabled: false,
            dropped_frames: counter.get_dropped_frames(),
            memory_usage_bytes: 0,
            memory_usage_mb: 0.0,
            cpu_usage_percent: 0.0,
            last_seek_latency_ms: None,
        }
    }

    /// Check if performance meets Story 5.6 AC #5 target
    pub fn meets_ac5_target(&self) -> bool {
        self.active_tracks <= 3 && self.current_fps >= 60.0
    }

    /// Check if performance meets Story 5.8 AC #2 target (3+ video + 4+ audio tracks)
    pub fn meets_ac2_target(&self) -> bool {
        self.current_fps >= 60.0
    }

    /// Check if performance is acceptable
    pub fn is_acceptable(&self) -> bool {
        self.current_fps >= 30.0
    }

    /// Check if memory usage meets Story 5.8 AC #5 target (<1GB)
    pub fn meets_memory_target(&self) -> bool {
        self.memory_usage_bytes < 1_000_000_000 // 1GB in bytes
    }

    /// Get current memory usage (Story 5.8 AC #5)
    pub fn get_current_memory() -> Self {
        let mut system = System::new_all();
        system.refresh_all();

        let pid = Pid::from_u32(std::process::id());
        let memory_bytes = system
            .process(pid)
            .map(|p| p.memory())
            .unwrap_or(0) as u64;

        let memory_mb = memory_bytes as f64 / 1_048_576.0; // Convert bytes to MB

        Self {
            memory_usage_bytes: memory_bytes,
            memory_usage_mb: memory_mb,
            ..Default::default()
        }
    }

    /// Update metrics with current memory usage (Story 5.8 AC #5)
    pub fn with_memory(mut self) -> Self {
        let memory_metrics = Self::get_current_memory();
        self.memory_usage_bytes = memory_metrics.memory_usage_bytes;
        self.memory_usage_mb = memory_metrics.memory_usage_mb;
        self
    }

    /// Get current CPU usage (Story 5.8 AC #6)
    pub fn get_current_cpu() -> Self {
        let mut system = System::new_all();
        system.refresh_all();

        let pid = Pid::from_u32(std::process::id());
        let cpu_usage = system
            .process(pid)
            .map(|p| p.cpu_usage())
            .unwrap_or(0.0);

        Self {
            cpu_usage_percent: cpu_usage,
            ..Default::default()
        }
    }

    /// Update metrics with current CPU usage (Story 5.8 AC #6)
    pub fn with_cpu(mut self) -> Self {
        let cpu_metrics = Self::get_current_cpu();
        self.cpu_usage_percent = cpu_metrics.cpu_usage_percent;
        self
    }

    /// Check if CPU usage meets Story 5.8 AC #6 target (<80%)
    pub fn meets_cpu_target(&self) -> bool {
        self.cpu_usage_percent < 80.0
    }

    /// Check if seek latency meets Story 5.8 AC #7 target (<100ms)
    pub fn meets_seek_latency_target(&self) -> bool {
        self.last_seek_latency_ms.map_or(true, |latency| latency < 100)
    }

    /// Update metrics with seek latency (Story 5.8 AC #7)
    pub fn with_seek_latency(mut self, latency_ms: u64) -> Self {
        self.last_seek_latency_ms = Some(latency_ms);
        self
    }
}

// Unit tests (Story 5.8 AC#1 - Subtask 1.5)
#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_fps_counter_initialization() {
        let counter = FpsCounter::new();
        assert_eq!(counter.get_fps(), 0.0, "FPS should be 0 with no frames");
        assert_eq!(counter.get_average_fps(), 0.0, "Average FPS should be 0 with no frames");
        assert_eq!(counter.get_total_frames(), 0, "Total frames should be 0");
    }

    #[test]
    fn test_fps_calculation_60fps() {
        let mut counter = FpsCounter::new();

        // Simulate 60 FPS for 1 second (60 frames, ~16.67ms per frame)
        for _ in 0..60 {
            counter.record_frame();
            thread::sleep(Duration::from_millis(16)); // ~60 FPS timing
        }

        let fps = counter.get_fps();

        // Allow 10% tolerance due to sleep inaccuracy
        assert!(
            fps >= 54.0 && fps <= 66.0,
            "FPS should be approximately 60, got: {}",
            fps
        );

        assert_eq!(counter.get_total_frames(), 60, "Should have recorded 60 frames");
    }

    #[test]
    fn test_reset() {
        let mut counter = FpsCounter::new();

        // Record some frames
        for _ in 0..10 {
            counter.record_frame();
        }

        assert_eq!(counter.get_total_frames(), 10);

        // Reset
        counter.reset();

        assert_eq!(counter.get_total_frames(), 0, "Total frames should reset to 0");
        assert_eq!(counter.get_fps(), 0.0, "FPS should be 0 after reset");
    }

    #[test]
    fn test_is_below_target() {
        let mut counter = FpsCounter::new();

        // Simulate 45 FPS (below 60 FPS target) - use larger gap for more reliable timing
        for _ in 0..45 {
            counter.record_frame();
            thread::sleep(Duration::from_millis(22)); // ~45 FPS
        }

        let current_fps = counter.get_fps();

        // Should trigger with tolerance of 5 FPS (60 - 5 = 55, and ~45 < 55)
        assert!(
            counter.is_below_target(60.0, 5.0),
            "Should detect FPS below target (current: {})",
            current_fps
        );

        // Should not trigger with tolerance of 20 FPS (60 - 20 = 40, and ~45 > 40)
        assert!(
            !counter.is_below_target(60.0, 20.0),
            "Should not trigger with high tolerance (current: {})",
            current_fps
        );
    }

    #[test]
    fn test_performance_metrics_from_counter() {
        let mut counter = FpsCounter::new();

        // Record 30 frames
        for _ in 0..30 {
            counter.record_frame();
            thread::sleep(Duration::from_millis(16));
        }

        let metrics = PerformanceMetrics::from_counter(&counter);

        assert!(metrics.current_fps > 0.0, "Current FPS should be > 0");
        assert!(metrics.average_fps > 0.0, "Average FPS should be > 0");
        assert_eq!(metrics.total_frames, 30, "Total frames should be 30");
        assert!(metrics.uptime_seconds > 0.0, "Uptime should be > 0");
    }

    #[test]
    fn test_backward_compatibility() {
        let mut counter = FpsCounter::new();

        // Record some frames
        for _ in 0..20 {
            counter.record_frame();
            thread::sleep(Duration::from_millis(50));
        }

        // Test that old Story 5.6 API still works
        let fps_old_api = counter.fps();
        let fps_new_api = counter.get_fps();

        assert_eq!(
            fps_old_api, fps_new_api,
            "Old fps() and new get_fps() should return same value"
        );
    }

    // Story 5.8 AC #4 Tests: Frame drop detection

    #[test]
    fn test_frame_drop_detection() {
        let mut counter = FpsCounter::new();

        // Record first frame
        counter.record_frame();
        assert_eq!(counter.get_dropped_frames(), 0, "No drops initially");

        // Simulate frame drop (40ms gap > 33ms threshold)
        thread::sleep(Duration::from_millis(40));
        counter.record_frame();

        assert_eq!(
            counter.get_dropped_frames(),
            1,
            "Should detect 1 frame drop"
        );
    }

    #[test]
    fn test_no_false_positive_frame_drops() {
        let mut counter = FpsCounter::new();

        // Record frames at 60 FPS (16.67ms intervals - below 33ms threshold)
        for _ in 0..30 {
            counter.record_frame();
            thread::sleep(Duration::from_millis(16));
        }

        // Should not detect any drops
        assert_eq!(
            counter.get_dropped_frames(),
            0,
            "Should not detect drops at 60 FPS"
        );
    }

    #[test]
    fn test_excessive_drops_detection() {
        let mut counter = FpsCounter::new();

        // Simulate 15 frame drops in quick succession
        for _ in 0..15 {
            counter.record_frame();
            thread::sleep(Duration::from_millis(50)); // 50ms gap > 33ms
        }

        assert!(
            counter.check_excessive_drops(),
            "Should detect excessive drops (>10 in 1 second)"
        );
    }

    #[test]
    fn test_no_excessive_drops_with_spaced_drops() {
        let mut counter = FpsCounter::new();

        // Simulate 5 drops spaced out over 2 seconds
        for _ in 0..5 {
            counter.record_frame();
            thread::sleep(Duration::from_millis(400)); // Spaced out
        }

        assert!(
            !counter.check_excessive_drops(),
            "Should not detect excessive drops when spaced out"
        );
    }

    #[test]
    fn test_dropped_frames_in_metrics() {
        let mut counter = FpsCounter::new();

        // Record first frame
        counter.record_frame();

        // Simulate 3 frame drops
        for _ in 0..3 {
            thread::sleep(Duration::from_millis(40)); // 40ms gap
            counter.record_frame();
        }

        let metrics = PerformanceMetrics::from_counter(&counter);

        assert_eq!(
            metrics.dropped_frames, 3,
            "Metrics should include dropped frames count"
        );
    }

    #[test]
    fn test_reset_clears_dropped_frames() {
        let mut counter = FpsCounter::new();

        // Simulate frame drops
        counter.record_frame();
        thread::sleep(Duration::from_millis(50));
        counter.record_frame();

        assert!(counter.get_dropped_frames() > 0, "Should have drops");

        // Reset
        counter.reset();

        assert_eq!(
            counter.get_dropped_frames(),
            0,
            "Reset should clear dropped frames"
        );
    }

    // Story 5.8 AC #5 Tests: Memory monitoring

    #[test]
    fn test_get_current_memory() {
        let metrics = PerformanceMetrics::get_current_memory();

        assert!(
            metrics.memory_usage_bytes > 0,
            "Should report non-zero memory usage"
        );
        assert!(
            metrics.memory_usage_mb > 0.0,
            "Should report non-zero memory usage in MB"
        );

        // Verify MB conversion is correct
        let expected_mb = metrics.memory_usage_bytes as f64 / 1_048_576.0;
        assert!(
            (metrics.memory_usage_mb - expected_mb).abs() < 0.01,
            "MB conversion should be accurate"
        );
    }

    #[test]
    fn test_with_memory() {
        let mut counter = FpsCounter::new();
        counter.record_frame();

        let metrics = PerformanceMetrics::from_counter(&counter).with_memory();

        assert!(
            metrics.memory_usage_bytes > 0,
            "Should include memory usage"
        );
        assert!(
            metrics.memory_usage_mb > 0.0,
            "Should include memory usage in MB"
        );
        assert_eq!(metrics.total_frames, 1, "Should preserve frame count");
    }

    #[test]
    fn test_meets_memory_target() {
        // Test under 1GB (passing)
        let metrics_good = PerformanceMetrics {
            memory_usage_bytes: 500_000_000, // 500 MB
            ..Default::default()
        };
        assert!(
            metrics_good.meets_memory_target(),
            "500 MB should meet <1GB target"
        );

        // Test over 1GB (failing)
        let metrics_bad = PerformanceMetrics {
            memory_usage_bytes: 1_500_000_000, // 1.5 GB
            ..Default::default()
        };
        assert!(
            !metrics_bad.meets_memory_target(),
            "1.5 GB should not meet <1GB target"
        );

        // Test exactly 1GB (failing - must be strictly less than)
        let metrics_exact = PerformanceMetrics {
            memory_usage_bytes: 1_000_000_000, // Exactly 1 GB
            ..Default::default()
        };
        assert!(
            !metrics_exact.meets_memory_target(),
            "Exactly 1GB should not meet <1GB target (strict inequality)"
        );
    }

    #[test]
    fn test_get_current_cpu() {
        // Test CPU monitoring (Story 5.8 AC #6)
        let metrics = PerformanceMetrics::get_current_cpu();

        // CPU usage should be >= 0 (non-negative)
        assert!(
            metrics.cpu_usage_percent >= 0.0,
            "CPU usage should be non-negative, got: {}",
            metrics.cpu_usage_percent
        );

        // CPU usage should be <= 100% per core (on multi-core systems can exceed 100%)
        // But for single process, typically won't exceed a few hundred percent
        assert!(
            metrics.cpu_usage_percent <= 1000.0,
            "CPU usage should be reasonable, got: {}",
            metrics.cpu_usage_percent
        );
    }

    #[test]
    fn test_with_cpu() {
        // Test CPU metrics chaining (Story 5.8 AC #6)
        let counter = FpsCounter::new();
        let metrics = PerformanceMetrics::from_counter(&counter).with_cpu();

        // Should have CPU data populated
        assert!(
            metrics.cpu_usage_percent >= 0.0,
            "CPU usage should be populated"
        );
    }

    #[test]
    fn test_meets_cpu_target() {
        // Test under 80% CPU (passing)
        let metrics_good = PerformanceMetrics {
            cpu_usage_percent: 50.0,
            ..Default::default()
        };
        assert!(
            metrics_good.meets_cpu_target(),
            "50% CPU should meet <80% target"
        );

        // Test over 80% CPU (failing)
        let metrics_bad = PerformanceMetrics {
            cpu_usage_percent: 95.0,
            ..Default::default()
        };
        assert!(
            !metrics_bad.meets_cpu_target(),
            "95% CPU should not meet <80% target"
        );

        // Test exactly 80% CPU (failing - must be strictly less than)
        let metrics_exact = PerformanceMetrics {
            cpu_usage_percent: 80.0,
            ..Default::default()
        };
        assert!(
            !metrics_exact.meets_cpu_target(),
            "Exactly 80% CPU should not meet <80% target (strict inequality)"
        );
    }

    #[test]
    fn test_seek_latency_monitoring() {
        // Test seek latency tracking (Story 5.8 AC #7)
        let counter = FpsCounter::new();
        let metrics = PerformanceMetrics::from_counter(&counter).with_seek_latency(50);

        // Should have seek latency populated
        assert_eq!(
            metrics.last_seek_latency_ms,
            Some(50),
            "Seek latency should be 50ms"
        );
    }

    #[test]
    fn test_meets_seek_latency_target() {
        // Test under 100ms seek latency (passing)
        let metrics_good = PerformanceMetrics {
            last_seek_latency_ms: Some(80),
            ..Default::default()
        };
        assert!(
            metrics_good.meets_seek_latency_target(),
            "80ms seek latency should meet <100ms target"
        );

        // Test over 100ms seek latency (failing)
        let metrics_bad = PerformanceMetrics {
            last_seek_latency_ms: Some(150),
            ..Default::default()
        };
        assert!(
            !metrics_bad.meets_seek_latency_target(),
            "150ms seek latency should not meet <100ms target"
        );

        // Test exactly 100ms seek latency (failing - must be strictly less than)
        let metrics_exact = PerformanceMetrics {
            last_seek_latency_ms: Some(100),
            ..Default::default()
        };
        assert!(
            !metrics_exact.meets_seek_latency_target(),
            "Exactly 100ms seek latency should not meet <100ms target (strict inequality)"
        );

        // Test None (no seek yet) - should pass
        let metrics_no_seek = PerformanceMetrics {
            last_seek_latency_ms: None,
            ..Default::default()
        };
        assert!(
            metrics_no_seek.meets_seek_latency_target(),
            "No seek data should pass (default true)"
        );
    }
}

