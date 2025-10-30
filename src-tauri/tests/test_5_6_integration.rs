//! Integration tests for Story 5.6: Multi-Track Video Compositing
//!
//! These tests validate the end-to-end functionality of multi-track video composition,
//! including filter graph generation, cache management, and FFmpeg command building.

use clippy_lib::models::timeline::{Clip, ClipTransform};
use clippy_lib::services::composition_analyzer::CompositionAnalyzer;
use clippy_lib::services::segment_renderer::{
    CanvasSize, Segment, SegmentRenderer, SegmentType, VideoLayer,
};
use std::path::PathBuf;
use tempfile::TempDir;

/// Test helper: Create a test clip
fn create_test_clip(id: &str, file_path: &str, duration_ms: u64) -> Clip {
    Clip {
        id: id.to_string(),
        file_path: file_path.to_string(),
        start_time: 0,
        duration: duration_ms,
        trim_in: 0,
        trim_out: duration_ms,
        fade_in: None,
        fade_out: None,
        volume: None,
        muted: None,
        audio_tracks: None,
        transform: None,
    }
}

/// Test helper: Create a test layer
fn create_test_layer(clip: Clip, track_number: u32, z_index: u32) -> VideoLayer {
    VideoLayer {
        clip,
        track_number,
        z_index,
    }
}

#[test]
fn test_integration_two_track_pip_composition() {
    // AC #1, #2, #8: Test 2-track PiP composition (bottom + overlay)
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let renderer = SegmentRenderer::new(temp_dir.path().to_path_buf());

    // Create base layer (1080p video)
    let base_clip = create_test_clip("clip1", "/test/video1.mp4", 10000);
    let base_layer = create_test_layer(base_clip, 1, 0);

    // Create PiP overlay (with transform for positioning)
    let mut pip_clip = create_test_clip("clip2", "/test/video2.mp4", 10000);
    pip_clip.transform = Some(ClipTransform {
        x: 1200.0,   // Top-right corner
        y: 50.0,     // Small margin from top
        width: 640.0, // Smaller overlay
        height: 360.0,
        opacity: 1.0,
    });
    let pip_layer = create_test_layer(pip_clip, 2, 1);

    let segment = Segment {
        video_layers: vec![base_layer, pip_layer],
        start_time: 0,
        duration: 10000,
        canvas_size: CanvasSize {
            width: 1920,
            height: 1080,
        },
    };

    // Test filter graph generation
    let filter_graph = renderer
        .generate_filter_graph(&segment)
        .expect("Filter graph generation failed");

    // Verify filter contains scale operations for both layers
    assert!(
        filter_graph.contains("[0:v]scale="),
        "Filter should scale base layer"
    );
    assert!(
        filter_graph.contains("[1:v]scale=640:360"),
        "Filter should scale overlay to transform dimensions"
    );

    // Verify overlay positioning
    assert!(
        filter_graph.contains("overlay=x=1200:y=50"),
        "Filter should position overlay at transform coordinates"
    );

    // Test FFmpeg command building
    let output_path = temp_dir.path().join("test_output.mp4");
    let args = renderer
        .build_ffmpeg_command(&segment, &output_path)
        .expect("Failed to build FFmpeg command");

    // Verify inputs are included
    assert!(args.contains(&"-i".to_string()), "Should have -i flag");
    assert!(
        args.contains(&"/test/video1.mp4".to_string()),
        "Should have base video input"
    );
    assert!(
        args.contains(&"/test/video2.mp4".to_string()),
        "Should have overlay video input"
    );

    // Verify filter_complex is included
    assert!(
        args.contains(&"-filter_complex".to_string()),
        "Should have filter_complex"
    );

    // Verify hardware acceleration is enabled on macOS
    #[cfg(target_os = "macos")]
    {
        assert!(
            args.contains(&"-c:v".to_string())
                && args.contains(&"h264_videotoolbox".to_string()),
            "Should use VideoToolbox on macOS"
        );
    }

    // Verify output path
    assert!(
        args.contains(&output_path.to_string_lossy().to_string()),
        "Should have output path"
    );
}

#[test]
fn test_integration_three_track_composition_different_resolutions() {
    // AC #6, #7: Test 3-track composition with different resolutions
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let renderer = SegmentRenderer::new(temp_dir.path().to_path_buf());

    // Track 1: 1080p base
    let clip1 = create_test_clip("clip1", "/test/1080p_video.mp4", 5000);
    let layer1 = create_test_layer(clip1, 1, 0);

    // Track 2: 720p overlay (will be scaled down)
    let clip2 = create_test_clip("clip2", "/test/720p_video.mp4", 5000);
    let layer2 = create_test_layer(clip2, 2, 1);

    // Track 3: 4K overlay (will be scaled down significantly)
    let clip3 = create_test_clip("clip3", "/test/4k_video.mp4", 5000);
    let layer3 = create_test_layer(clip3, 3, 2);

    let segment = Segment {
        video_layers: vec![layer1, layer2, layer3],
        start_time: 0,
        duration: 5000,
        canvas_size: CanvasSize {
            width: 1920,
            height: 1080,
        },
    };

    let filter_graph = renderer
        .generate_filter_graph(&segment)
        .expect("Filter graph generation failed");

    // Verify all three layers are scaled
    assert!(
        filter_graph.contains("[0:v]scale="),
        "Layer 1 should be scaled"
    );
    assert!(
        filter_graph.contains("[1:v]scale="),
        "Layer 2 should be scaled"
    );
    assert!(
        filter_graph.contains("[2:v]scale="),
        "Layer 3 should be scaled"
    );

    // Verify aspect ratio preservation
    assert!(
        filter_graph.contains("force_original_aspect_ratio=decrease"),
        "Should preserve aspect ratio"
    );

    // Verify overlay chain is correct (v0 + v1 = tmp1, tmp1 + v2 = vout)
    assert!(
        filter_graph.contains("[v0][v1]overlay"),
        "Should overlay v1 onto v0"
    );
    assert!(
        filter_graph.contains("[tmp1][v2]overlay"),
        "Should overlay v2 onto tmp1"
    );
    assert!(filter_graph.contains("[vout]"), "Should output to vout");
}

#[test]
fn test_integration_opacity_blending_alpha_channel() {
    // AC #3: Test opacity blending and alpha channel compositing
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let renderer = SegmentRenderer::new(temp_dir.path().to_path_buf());

    let base_clip = create_test_clip("clip1", "/test/base.mp4", 5000);
    let base_layer = create_test_layer(base_clip, 1, 0);

    // Create semi-transparent overlay
    let mut overlay_clip = create_test_clip("clip2", "/test/overlay.mp4", 5000);
    overlay_clip.transform = Some(ClipTransform {
        x: 100.0,
        y: 100.0,
        width: 800.0,
        height: 600.0,
        opacity: 0.7, // 70% opacity
    });
    let overlay_layer = create_test_layer(overlay_clip, 2, 1);

    let segment = Segment {
        video_layers: vec![base_layer, overlay_layer],
        start_time: 0,
        duration: 5000,
        canvas_size: CanvasSize::default(),
    };

    let filter_graph = renderer
        .generate_filter_graph(&segment)
        .expect("Filter graph generation failed");

    // Verify alpha parameter is included
    assert!(
        filter_graph.contains("alpha=0.7"),
        "Should include alpha=0.7 for 70% opacity"
    );
    assert!(
        filter_graph.contains("format=auto"),
        "Should include format=auto for alpha support"
    );
}

#[test]
fn test_integration_cache_key_generation_and_invalidation() {
    // Test cache key generation and invalidation on segment changes
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let renderer = SegmentRenderer::new(temp_dir.path().to_path_buf());

    // Create initial segment
    let clip1 = create_test_clip("clip1", "/test/video.mp4", 10000);
    let layer1 = create_test_layer(clip1.clone(), 1, 0);
    let segment1 = Segment {
        video_layers: vec![layer1],
        start_time: 0,
        duration: 10000,
        canvas_size: CanvasSize::default(),
    };

    // Create modified segment (different file path)
    let clip2 = create_test_clip("clip1", "/test/video_different.mp4", 10000);
    let layer2 = create_test_layer(clip2, 1, 0);
    let segment2 = Segment {
        video_layers: vec![layer2],
        start_time: 0,
        duration: 10000,
        canvas_size: CanvasSize::default(),
    };

    // Create segment with transform added
    let mut clip3 = clip1.clone();
    clip3.transform = Some(ClipTransform {
        x: 50.0,
        y: 50.0,
        width: 640.0,
        height: 360.0,
        opacity: 1.0,
    });
    let layer3 = create_test_layer(clip3, 1, 0);
    let segment3 = Segment {
        video_layers: vec![layer3],
        start_time: 0,
        duration: 10000,
        canvas_size: CanvasSize::default(),
    };

    // Generate cache keys
    let key1 = renderer
        .generate_cache_key(&segment1)
        .expect("Failed to generate key1");
    let key2 = renderer
        .generate_cache_key(&segment2)
        .expect("Failed to generate key2");
    let key3 = renderer
        .generate_cache_key(&segment3)
        .expect("Failed to generate key3");

    // Verify cache keys are different when content changes
    assert_ne!(key1, key2, "Different file paths should produce different cache keys");
    assert_ne!(key1, key3, "Adding transform should produce different cache key");
    assert_ne!(key2, key3, "Different segments should have different keys");

    // Verify cache key format (SHA-256 produces 64 hex characters)
    assert_eq!(key1.len(), 64, "Cache key should be 64 characters (SHA-256)");
    assert_eq!(key2.len(), 64, "Cache key should be 64 characters (SHA-256)");
    assert_eq!(key3.len(), 64, "Cache key should be 64 characters (SHA-256)");

    // Verify deterministic cache keys (same segment produces same key)
    let key1_repeat = renderer
        .generate_cache_key(&segment1)
        .expect("Failed to generate key1 repeat");
    assert_eq!(
        key1, key1_repeat,
        "Same segment should produce same cache key"
    );
}

#[test]
fn test_integration_composition_analyzer_segment_classification() {
    // Test CompositionAnalyzer classification of simple vs complex segments
    let analyzer = CompositionAnalyzer::new();

    // Create simple segment (single layer)
    let clip = create_test_clip("clip1", "/test/video.mp4", 10000);
    let layer = create_test_layer(clip, 1, 0);
    let simple_segment = Segment {
        video_layers: vec![layer],
        start_time: 0,
        duration: 10000,
        canvas_size: CanvasSize::default(),
    };

    // Create complex segment (multi-layer)
    let clip1 = create_test_clip("clip1", "/test/video1.mp4", 10000);
    let clip2 = create_test_clip("clip2", "/test/video2.mp4", 10000);
    let layer1 = create_test_layer(clip1, 1, 0);
    let layer2 = create_test_layer(clip2, 2, 1);
    let complex_segment = Segment {
        video_layers: vec![layer1, layer2],
        start_time: 0,
        duration: 10000,
        canvas_size: CanvasSize::default(),
    };

    // Verify classification
    assert_eq!(
        analyzer.classify_segment(&simple_segment),
        SegmentType::Simple,
        "Single-layer segment should be classified as Simple"
    );
    assert_eq!(
        analyzer.classify_segment(&complex_segment),
        SegmentType::Complex,
        "Multi-layer segment should be classified as Complex"
    );
}

#[test]
fn test_integration_black_background_for_gaps() {
    // AC #4: Test black background rendering for gaps
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let renderer = SegmentRenderer::new(temp_dir.path().to_path_buf());

    // Create empty segment (no video layers = gap)
    let gap_segment = Segment {
        video_layers: vec![],
        start_time: 0,
        duration: 1000,
        canvas_size: CanvasSize {
            width: 1920,
            height: 1080,
        },
    };

    let filter_graph = renderer
        .generate_filter_graph(&gap_segment)
        .expect("Filter graph generation failed");

    // Verify black background is generated
    assert!(
        filter_graph.contains("color=black"),
        "Should generate black background for gap"
    );
    assert!(
        filter_graph.contains("1920x1080"),
        "Black background should match canvas size"
    );
}

#[test]
fn test_integration_trim_parameter_support() {
    // Test trim parameter handling in FFmpeg command
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let renderer = SegmentRenderer::new(temp_dir.path().to_path_buf());

    // Create clip with trim points
    let mut clip = create_test_clip("clip1", "/test/video.mp4", 30000);
    clip.trim_in = 5000; // Start at 5 seconds
    clip.trim_out = 20000; // End at 20 seconds (15 second duration)

    let layer = create_test_layer(clip, 1, 0);
    let segment = Segment {
        video_layers: vec![layer],
        start_time: 0,
        duration: 15000,
        canvas_size: CanvasSize::default(),
    };

    let output_path = temp_dir.path().join("trimmed_output.mp4");
    let args = renderer
        .build_ffmpeg_command(&segment, &output_path)
        .expect("Failed to build FFmpeg command");

    // Verify trim parameters are in the command
    // -ss should be present for trim_in
    let ss_index = args.iter().position(|arg| arg == "-ss");
    assert!(ss_index.is_some(), "Should have -ss flag for trim_in");

    // Value should be 5.000 (5 seconds in decimal format)
    if let Some(idx) = ss_index {
        let ss_value = &args[idx + 1];
        assert_eq!(ss_value, "5.000", "Trim start should be 5.000 seconds");
    }

    // -t should be present for trim duration
    let t_index = args.iter().position(|arg| arg == "-t");
    assert!(t_index.is_some(), "Should have -t flag for trim duration");

    if let Some(idx) = t_index {
        let t_value = &args[idx + 1];
        assert_eq!(
            t_value, "15.000",
            "Trim duration should be 15.000 seconds (trim_out - trim_in)"
        );
    }
}
