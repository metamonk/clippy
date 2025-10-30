#[cfg(test)]
mod tests {
    use super::super::performance_monitor::{FpsCounter, PerformanceMetrics};
    use std::thread;
    use std::time::Duration;

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
    fn test_fps_calculation_30fps() {
        let mut counter = FpsCounter::new();

        // Simulate 30 FPS for 0.5 seconds (15 frames, ~33ms per frame)
        for _ in 0..15 {
            counter.record_frame();
            thread::sleep(Duration::from_millis(33)); // ~30 FPS timing
        }

        let fps = counter.get_fps();

        // Allow 10% tolerance
        assert!(
            fps >= 27.0 && fps <= 33.0,
            "FPS should be approximately 30, got: {}",
            fps
        );
    }

    #[test]
    fn test_sliding_window() {
        let mut counter = FpsCounter::with_window_size(Duration::from_millis(100));

        // Record frames over 200ms (more than window size)
        for _ in 0..20 {
            counter.record_frame();
            thread::sleep(Duration::from_millis(10));
        }

        // Window should only keep frames from last 100ms
        assert_eq!(counter.get_total_frames(), 20, "Total frames should be 20");

        // Current FPS should be based on recent frames only (not all 20)
        let fps = counter.get_fps();
        assert!(fps > 0.0, "FPS should be calculated from window");
    }

    #[test]
    fn test_average_fps() {
        let mut counter = FpsCounter::new();

        // Simulate varying frame rates
        // First 30 frames at 60 FPS
        for _ in 0..30 {
            counter.record_frame();
            thread::sleep(Duration::from_millis(16));
        }

        // Next 30 frames at 30 FPS
        for _ in 0..30 {
            counter.record_frame();
            thread::sleep(Duration::from_millis(33));
        }

        let average_fps = counter.get_average_fps();

        // Average should be around 40 FPS (60+30)/2
        assert!(
            average_fps >= 35.0 && average_fps <= 50.0,
            "Average FPS should be around 40, got: {}",
            average_fps
        );
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

        // Simulate 50 FPS (below 60 FPS target)
        for _ in 0..50 {
            counter.record_frame();
            thread::sleep(Duration::from_millis(20)); // 50 FPS
        }

        // Should trigger with tolerance of 5 FPS (60 - 5 = 55, and 50 < 55)
        assert!(
            counter.is_below_target(60.0, 5.0),
            "Should detect FPS below target"
        );

        // Should not trigger with tolerance of 15 FPS (60 - 15 = 45, and 50 > 45)
        assert!(
            !counter.is_below_target(60.0, 15.0),
            "Should not trigger with high tolerance"
        );
    }

    #[test]
    fn test_performance_metrics_snapshot() {
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
    fn test_performance_metrics_targets() {
        let mut metrics = PerformanceMetrics {
            current_fps: 65.0,
            average_fps: 60.0,
            total_frames: 1000,
            uptime_seconds: 16.0,
            active_tracks: 3,
            hardware_accel_enabled: true,
            dropped_frames: 0,
        };

        // Should meet both Story 5.6 AC#5 and Story 5.8 AC#2 targets
        assert!(metrics.meets_ac5_target(), "Should meet AC5 target (60 FPS, <=3 tracks)");
        assert!(metrics.meets_ac2_target(), "Should meet AC2 target (60 FPS)");
        assert!(metrics.is_acceptable(), "Should be acceptable (>=30 FPS)");

        // Test degraded performance
        metrics.current_fps = 25.0;
        assert!(!metrics.meets_ac5_target(), "Should not meet AC5 target at 25 FPS");
        assert!(!metrics.meets_ac2_target(), "Should not meet AC2 target at 25 FPS");
        assert!(!metrics.is_acceptable(), "Should not be acceptable at 25 FPS");
    }

    #[test]
    fn test_uptime_tracking() {
        let mut counter = FpsCounter::new();

        // Record frames for 500ms
        for _ in 0..30 {
            counter.record_frame();
            thread::sleep(Duration::from_millis(16));
        }

        let uptime = counter.get_uptime_seconds();

        // Should be around 0.5 seconds (allow tolerance)
        assert!(
            uptime >= 0.4 && uptime <= 0.6,
            "Uptime should be around 0.5s, got: {}s",
            uptime
        );
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
}
