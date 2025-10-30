//! Composition Analyzer for Segment Classification (Story 5.6)
//!
//! This module analyzes timeline segments to classify them as Simple or Complex
//! for the ADR-008 Hybrid Smart Segment Pre-Rendering architecture.
//!
//! # Classification Rules
//!
//! **Simple Segments:**
//! - Single video track at any given time
//! - Played directly via MPV (no pre-rendering needed)
//! - Examples: sequential clips on Track 1, single-track timeline playback
//!
//! **Complex Segments:**
//! - Multiple video tracks active simultaneously (multi-track video)
//! - Requires FFmpeg pre-rendering to cache with overlay filters
//! - Examples: Picture-in-Picture, video overlays, multi-track composition
//!
//! # Story 5.6 Integration
//!
//! The CompositionAnalyzer detects multi-track video segments and ensures they
//! are classified as Complex, triggering SegmentRenderer for FFmpeg composition.

use crate::models::timeline::{Clip, Track, TrackType};
use crate::services::segment_renderer::{Segment, SegmentType, VideoLayer};

/// Composition analyzer for segment classification
pub struct CompositionAnalyzer;

impl CompositionAnalyzer {
    /// Create a new composition analyzer
    pub fn new() -> Self {
        Self
    }

    /// Classify a segment as Simple or Complex
    ///
    /// # Arguments
    ///
    /// * `segment` - Segment to classify
    ///
    /// # Returns
    ///
    /// SegmentType::Simple if single-track, SegmentType::Complex if multi-track
    ///
    /// # Story 5.6 AC Coverage
    ///
    /// - AC #1, #2: Multi-track video segments classified as Complex
    pub fn classify_segment(&self, segment: &Segment) -> SegmentType {
        if segment.video_layers.len() <= 1 {
            SegmentType::Simple
        } else {
            SegmentType::Complex
        }
    }

    /// Detect if a timeline segment has multi-track video
    ///
    /// # Arguments
    ///
    /// * `tracks` - All tracks in the timeline
    /// * `start_time` - Segment start time in milliseconds
    /// * `end_time` - Segment end time in milliseconds
    ///
    /// # Returns
    ///
    /// true if multiple video tracks have clips active during this time range
    ///
    /// # Story 5.6 AC Coverage
    ///
    /// - AC #1, #2: Detects multi-track video for complex segment classification
    pub fn detect_multi_track_video(
        &self,
        tracks: &[Track],
        start_time: u64,
        end_time: u64,
    ) -> bool {
        let active_video_tracks = self.count_active_video_tracks(tracks, start_time, end_time);
        active_video_tracks > 1
    }

    /// Count active video tracks at a given time range
    ///
    /// # Arguments
    ///
    /// * `tracks` - All tracks in the timeline
    /// * `start_time` - Start time in milliseconds
    /// * `end_time` - End time in milliseconds
    ///
    /// # Returns
    ///
    /// Number of video tracks with active clips in the given time range
    fn count_active_video_tracks(&self, tracks: &[Track], start_time: u64, end_time: u64) -> usize {
        tracks
            .iter()
            .filter(|track| {
                // Only count video tracks
                track.track_type == TrackType::Video
                    && self.has_active_clip(&track.clips, start_time, end_time)
            })
            .count()
    }

    /// Check if a track has any active clip in the given time range
    ///
    /// # Arguments
    ///
    /// * `clips` - Clips on the track
    /// * `start_time` - Range start time in milliseconds
    /// * `end_time` - Range end time in milliseconds
    ///
    /// # Returns
    ///
    /// true if any clip overlaps with the time range
    fn has_active_clip(&self, clips: &[Clip], start_time: u64, end_time: u64) -> bool {
        clips.iter().any(|clip| {
            let clip_end = clip.start_time + (clip.trim_out - clip.trim_in);
            // Check for overlap: clip starts before range ends AND clip ends after range starts
            clip.start_time < end_time && clip_end > start_time
        })
    }

    /// Analyze timeline and split into segments
    ///
    /// Divides timeline into segments where each segment has consistent track structure.
    /// Segment boundaries occur at clip start/end points where track count changes.
    ///
    /// # Arguments
    ///
    /// * `tracks` - All tracks in the timeline
    /// * `total_duration` - Total timeline duration in milliseconds
    ///
    /// # Returns
    ///
    /// Vector of segments with their video layers
    pub fn analyze_timeline(&self, tracks: &[Track], total_duration: u64) -> Vec<Segment> {
        // Collect all boundary points (clip starts and ends)
        let mut boundaries = std::collections::BTreeSet::new();
        boundaries.insert(0); // Timeline start
        boundaries.insert(total_duration); // Timeline end

        for track in tracks.iter().filter(|t| t.track_type == TrackType::Video) {
            for clip in &track.clips {
                boundaries.insert(clip.start_time);
                let clip_end = clip.start_time + (clip.trim_out - clip.trim_in);
                boundaries.insert(clip_end);
            }
        }

        // Create segments between boundaries
        let boundaries: Vec<u64> = boundaries.into_iter().collect();
        let mut segments = Vec::new();

        for i in 0..boundaries.len() - 1 {
            let start = boundaries[i];
            let end = boundaries[i + 1];
            let duration = end - start;

            // Get active video layers at this segment
            let video_layers = self.get_active_video_layers(tracks, start, end);

            if !video_layers.is_empty() || duration > 0 {
                segments.push(Segment {
                    video_layers,
                    start_time: start,
                    duration,
                    canvas_size: crate::services::segment_renderer::CanvasSize::default(),
                });
            }
        }

        segments
    }

    /// Get all active video layers at a given time range
    ///
    /// # Arguments
    ///
    /// * `tracks` - All tracks in the timeline
    /// * `start_time` - Segment start time in milliseconds
    /// * `end_time` - Segment end time in milliseconds
    ///
    /// # Returns
    ///
    /// Vector of active video layers sorted by z-index (bottom to top)
    fn get_active_video_layers(
        &self,
        tracks: &[Track],
        start_time: u64,
        end_time: u64,
    ) -> Vec<VideoLayer> {
        let mut layers = Vec::new();

        for track in tracks.iter().filter(|t| t.track_type == TrackType::Video) {
            for clip in &track.clips {
                let clip_end = clip.start_time + (clip.trim_out - clip.trim_in);

                // Check if clip overlaps with segment time range
                if clip.start_time < end_time && clip_end > start_time {
                    layers.push(VideoLayer {
                        clip: clip.clone(),
                        track_number: track.track_number,
                        z_index: track.track_number, // Track 1 = z-index 1 (bottom)
                    });
                }
            }
        }

        // Sort by z-index (bottom to top)
        layers.sort_by_key(|layer| layer.z_index);

        layers
    }

    /// Get statistics about timeline composition
    ///
    /// # Arguments
    ///
    /// * `segments` - All segments in the timeline
    ///
    /// # Returns
    ///
    /// Tuple of (simple_segment_count, complex_segment_count, total_duration)
    pub fn get_composition_stats(&self, segments: &[Segment]) -> (usize, usize, u64) {
        let simple_count = segments
            .iter()
            .filter(|s| self.classify_segment(s) == SegmentType::Simple)
            .count();

        let complex_count = segments
            .iter()
            .filter(|s| self.classify_segment(s) == SegmentType::Complex)
            .count();

        let total_duration: u64 = segments.iter().map(|s| s.duration).sum();

        (simple_count, complex_count, total_duration)
    }
}

impl Default for CompositionAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::timeline::Clip;
    use crate::services::segment_renderer::CanvasSize;

    /// Test helper: Create a test clip
    fn create_test_clip(
        id: &str,
        file_path: &str,
        start_time: u64,
        duration: u64,
    ) -> Clip {
        Clip {
            id: id.to_string(),
            file_path: file_path.to_string(),
            start_time,
            duration,
            trim_in: 0,
            trim_out: duration,
            fade_in: None,
            fade_out: None,
            volume: None,
            muted: None,
            audio_tracks: None,
            transform: None,
        }
    }

    /// Test helper: Create a test track
    fn create_test_track(track_number: u32, clips: Vec<Clip>) -> Track {
        Track {
            id: format!("track-{}", track_number),
            track_number,
            clips,
            track_type: TrackType::Video,
        }
    }

    #[test]
    fn test_classify_simple_segment() {
        let analyzer = CompositionAnalyzer::new();
        let clip = create_test_clip("clip1", "/path/to/video.mp4", 0, 5000);
        let layer = VideoLayer {
            clip,
            track_number: 1,
            z_index: 1,
        };

        let segment = Segment {
            video_layers: vec![layer],
            start_time: 0,
            duration: 5000,
            canvas_size: CanvasSize::default(),
        };

        assert_eq!(analyzer.classify_segment(&segment), SegmentType::Simple);
    }

    #[test]
    fn test_classify_complex_segment() {
        let analyzer = CompositionAnalyzer::new();
        let clip1 = create_test_clip("clip1", "/path/to/video1.mp4", 0, 5000);
        let clip2 = create_test_clip("clip2", "/path/to/video2.mp4", 0, 5000);
        let layer1 = VideoLayer {
            clip: clip1,
            track_number: 1,
            z_index: 1,
        };
        let layer2 = VideoLayer {
            clip: clip2,
            track_number: 2,
            z_index: 2,
        };

        let segment = Segment {
            video_layers: vec![layer1, layer2],
            start_time: 0,
            duration: 5000,
            canvas_size: CanvasSize::default(),
        };

        assert_eq!(analyzer.classify_segment(&segment), SegmentType::Complex);
    }

    #[test]
    fn test_detect_single_track_video() {
        let analyzer = CompositionAnalyzer::new();
        let clip1 = create_test_clip("clip1", "/path/to/video1.mp4", 0, 5000);
        let track1 = create_test_track(1, vec![clip1]);

        let is_multi_track = analyzer.detect_multi_track_video(&[track1], 0, 5000);
        assert!(!is_multi_track); // Single track = not multi-track
    }

    #[test]
    fn test_detect_multi_track_video() {
        let analyzer = CompositionAnalyzer::new();
        let clip1 = create_test_clip("clip1", "/path/to/video1.mp4", 0, 5000);
        let clip2 = create_test_clip("clip2", "/path/to/video2.mp4", 0, 5000);
        let track1 = create_test_track(1, vec![clip1]);
        let track2 = create_test_track(2, vec![clip2]);

        let is_multi_track = analyzer.detect_multi_track_video(&[track1, track2], 0, 5000);
        assert!(is_multi_track); // Two tracks = multi-track
    }

    #[test]
    fn test_detect_multi_track_partial_overlap() {
        let analyzer = CompositionAnalyzer::new();
        let clip1 = create_test_clip("clip1", "/path/to/video1.mp4", 0, 5000);
        let clip2 = create_test_clip("clip2", "/path/to/video2.mp4", 3000, 5000); // Starts at 3s
        let track1 = create_test_track(1, vec![clip1]);
        let track2 = create_test_track(2, vec![clip2]);

        // Time range 0-2999ms: Only track 1 active
        let is_multi_track_before = analyzer.detect_multi_track_video(&[track1.clone(), track2.clone()], 0, 2999);
        assert!(!is_multi_track_before);

        // Time range 3000-5000ms: Both tracks active
        let is_multi_track_during = analyzer.detect_multi_track_video(&[track1, track2], 3000, 5000);
        assert!(is_multi_track_during);
    }

    #[test]
    fn test_analyze_timeline_single_clip() {
        let analyzer = CompositionAnalyzer::new();
        let clip1 = create_test_clip("clip1", "/path/to/video1.mp4", 0, 5000);
        let track1 = create_test_track(1, vec![clip1]);

        let segments = analyzer.analyze_timeline(&[track1], 5000);

        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].start_time, 0);
        assert_eq!(segments[0].duration, 5000);
        assert_eq!(segments[0].video_layers.len(), 1);
        assert_eq!(
            analyzer.classify_segment(&segments[0]),
            SegmentType::Simple
        );
    }

    #[test]
    fn test_analyze_timeline_two_sequential_clips() {
        let analyzer = CompositionAnalyzer::new();
        let clip1 = create_test_clip("clip1", "/path/to/video1.mp4", 0, 3000);
        let clip2 = create_test_clip("clip2", "/path/to/video2.mp4", 3000, 3000);
        let track1 = create_test_track(1, vec![clip1, clip2]);

        let segments = analyzer.analyze_timeline(&[track1], 6000);

        // Should create 2 segments (one per clip)
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].start_time, 0);
        assert_eq!(segments[0].duration, 3000);
        assert_eq!(segments[1].start_time, 3000);
        assert_eq!(segments[1].duration, 3000);
    }

    #[test]
    fn test_analyze_timeline_multi_track_overlap() {
        let analyzer = CompositionAnalyzer::new();
        let clip1 = create_test_clip("clip1", "/path/to/video1.mp4", 0, 5000);
        let clip2 = create_test_clip("clip2", "/path/to/video2.mp4", 2000, 3000); // 2s-5s
        let track1 = create_test_track(1, vec![clip1]);
        let track2 = create_test_track(2, vec![clip2]);

        let segments = analyzer.analyze_timeline(&[track1, track2], 5000);

        // Should create 3 segments:
        // 1. 0-2000ms: Track 1 only (Simple)
        // 2. 2000-5000ms: Track 1 + Track 2 (Complex)
        // 3. 5000ms: End boundary (may or may not exist depending on implementation)
        assert!(segments.len() >= 2);

        // First segment: Simple (single track)
        assert_eq!(segments[0].start_time, 0);
        assert_eq!(segments[0].video_layers.len(), 1);
        assert_eq!(
            analyzer.classify_segment(&segments[0]),
            SegmentType::Simple
        );

        // Second segment: Complex (multi-track)
        assert_eq!(segments[1].start_time, 2000);
        assert_eq!(segments[1].video_layers.len(), 2);
        assert_eq!(
            analyzer.classify_segment(&segments[1]),
            SegmentType::Complex
        );
    }

    #[test]
    fn test_get_composition_stats() {
        let analyzer = CompositionAnalyzer::new();
        let clip1 = create_test_clip("clip1", "/path/to/video1.mp4", 0, 5000);
        let clip2 = create_test_clip("clip2", "/path/to/video2.mp4", 2000, 3000);
        let track1 = create_test_track(1, vec![clip1]);
        let track2 = create_test_track(2, vec![clip2]);

        let segments = analyzer.analyze_timeline(&[track1, track2], 5000);
        let (simple_count, complex_count, total_duration) =
            analyzer.get_composition_stats(&segments);

        assert!(simple_count >= 1); // At least one simple segment
        assert!(complex_count >= 1); // At least one complex segment
        assert_eq!(total_duration, 5000); // Total timeline duration
    }

    #[test]
    fn test_layer_z_index_ordering() {
        let analyzer = CompositionAnalyzer::new();
        let clip1 = create_test_clip("clip1", "/path/to/video1.mp4", 0, 5000);
        let clip2 = create_test_clip("clip2", "/path/to/video2.mp4", 0, 5000);
        let clip3 = create_test_clip("clip3", "/path/to/video3.mp4", 0, 5000);

        // Create tracks in non-sequential order to test sorting
        let track2 = create_test_track(2, vec![clip2]);
        let track1 = create_test_track(1, vec![clip1]);
        let track3 = create_test_track(3, vec![clip3]);

        let segments = analyzer.analyze_timeline(&[track2, track1, track3], 5000);

        assert_eq!(segments.len(), 1);
        let segment = &segments[0];

        // Layers should be sorted by z-index (Track 1, 2, 3)
        assert_eq!(segment.video_layers.len(), 3);
        assert_eq!(segment.video_layers[0].track_number, 1); // Bottom
        assert_eq!(segment.video_layers[1].track_number, 2); // Middle
        assert_eq!(segment.video_layers[2].track_number, 3); // Top
    }
}
