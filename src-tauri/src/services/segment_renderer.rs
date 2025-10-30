//! Segment Renderer for Multi-Track Video Composition (Story 5.6)
//!
//! This module implements the SegmentRenderer for ADR-008 Hybrid Smart Segment Pre-Rendering.
//! It generates FFmpeg overlay filter chains for complex multi-track video segments.
//!
//! # Architecture Context
//!
//! The SegmentRenderer is part of the composition playback architecture (ADR-008):
//! - **Simple Segments:** Single-track video, played directly via MPV (no pre-rendering)
//! - **Complex Segments:** Multi-track video, requires FFmpeg pre-rendering with overlay filters
//!
//! # Key Features (Story 5.6 Acceptance Criteria)
//!
//! 1. **Z-Index Layer Ordering:** Track 1 = bottom, Track N = top (AC #1, #2)
//! 2. **Alpha Channel Support:** Opacity/transparency for semi-transparent overlays (AC #3)
//! 3. **Black Background:** Generated when no clips at bottom track level (AC #4)
//! 4. **Multi-Resolution Scaling:** Handles different video resolutions (AC #6)
//! 5. **Aspect Ratio Preservation:** Letterboxing/pillarboxing as needed (AC #7)
//! 6. **Position/Scale Transforms:** Applies clip transforms for PiP effects (AC #8)
//! 7. **Hardware Acceleration:** VideoToolbox on macOS for 60 FPS target (AC #5)
//!
//! # FFmpeg Filter Chain Example
//!
//! ```bash
//! # 3 video tracks (Track 1 = bottom, Track 3 = top)
//! ffmpeg \
//!   -i track1_clip.mp4 \  # Base layer
//!   -i track2_clip.mp4 \  # Middle layer
//!   -i track3_clip.mp4 \  # Top layer
//!   -filter_complex "\
//!     [0:v]scale=1920:1080:force_original_aspect_ratio=decrease,\
//!          pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black[v0]; \
//!     [1:v]scale=640:360:force_original_aspect_ratio=decrease[v1]; \
//!     [2:v]scale=640:360:force_original_aspect_ratio=decrease[v2]; \
//!     [v0][v1]overlay=x=100:y=100:format=auto:alpha=auto[tmp1]; \
//!     [tmp1][v2]overlay=x=W-w-100:y=100:format=auto:alpha=auto[vout] \
//!   " \
//!   -map "[vout]" output.mp4
//! ```

use crate::models::timeline::{Clip, ClipTransform};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ffmpeg_sidecar::command::FfmpegCommand;
use tracing::{debug, info, warn};

/// Canvas size for composition output
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CanvasSize {
    pub width: u32,
    pub height: u32,
}

impl Default for CanvasSize {
    fn default() -> Self {
        Self {
            width: 1920,
            height: 1080,
        }
    }
}

/// Segment type classification for ADR-008 architecture
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SegmentType {
    /// Simple segment: Single-track video, direct MPV playback
    Simple,
    /// Complex segment: Multi-track video, requires FFmpeg pre-rendering
    Complex,
}

/// Video layer for multi-track composition
#[derive(Debug, Clone, PartialEq)]
pub struct VideoLayer {
    /// Clip data (file path, trim points, etc.)
    pub clip: Clip,

    /// Track number (1-based: Track 1 = bottom layer, Track N = top layer)
    pub track_number: u32,

    /// Z-index for layer ordering (lower = bottom, higher = top)
    pub z_index: u32,
}

/// Segment to be rendered
#[derive(Debug, Clone, PartialEq)]
pub struct Segment {
    /// Video layers in z-index order (bottom to top)
    pub video_layers: Vec<VideoLayer>,

    /// Segment start time in milliseconds
    pub start_time: u64,

    /// Segment duration in milliseconds
    pub duration: u64,

    /// Canvas size for output
    pub canvas_size: CanvasSize,
}

/// Segment renderer for multi-track video composition
pub struct SegmentRenderer {
    /// Cache directory for pre-rendered segments
    cache_dir: PathBuf,

    /// Canvas size (default 1920x1080)
    canvas_size: CanvasSize,
}

impl SegmentRenderer {
    /// Create a new segment renderer
    ///
    /// # Arguments
    ///
    /// * `cache_dir` - Directory for storing pre-rendered segment cache files
    pub fn new(cache_dir: PathBuf) -> Self {
        Self {
            cache_dir,
            canvas_size: CanvasSize::default(),
        }
    }

    /// Set custom canvas size for composition
    pub fn with_canvas_size(mut self, width: u32, height: u32) -> Self {
        self.canvas_size = CanvasSize { width, height };
        self
    }

    /// Generate FFmpeg filter graph for multi-track video composition
    ///
    /// # Arguments
    ///
    /// * `segment` - Segment containing video layers in z-index order
    ///
    /// # Returns
    ///
    /// FFmpeg filter_complex string for overlaying videos with scaling and positioning
    ///
    /// # Story 5.6 AC Coverage
    ///
    /// - AC #1, #2: Z-index layer ordering (Track 1 bottom, Track N top)
    /// - AC #3: Alpha channel support with format=auto:alpha=auto
    /// - AC #4: Black background via pad filter when no bottom clip
    /// - AC #6, #7: Multi-resolution scaling with aspect ratio preservation
    /// - AC #8: Position/scale transforms from clip.transform
    pub fn generate_filter_graph(&self, segment: &Segment) -> Result<String> {
        let layers = &segment.video_layers;

        if layers.is_empty() {
            // AC #4: Black background when no clips
            return Ok(self.generate_black_background());
        }

        if layers.len() == 1 {
            // Single layer: Just scale to canvas size with aspect ratio preservation
            return Ok(self.generate_single_layer_filter(
                0,
                &layers[0],
                segment.canvas_size,
            ));
        }

        // Multi-layer composition
        let mut filter_parts = Vec::new();

        // Step 1: Scale all input videos with aspect ratio preservation
        // AC #6, #7: Multi-resolution scaling + aspect ratio preservation
        for (i, layer) in layers.iter().enumerate() {
            let scale_filter = self.generate_scale_filter(i, layer, segment.canvas_size)?;
            filter_parts.push(scale_filter);
        }

        // Step 2: Generate overlay filter chain (bottom to top)
        // AC #1, #2: Z-index layer ordering
        // AC #3: Alpha channel support via format=auto:alpha=auto
        let overlay_chain = self.generate_overlay_chain(layers, segment.canvas_size)?;
        filter_parts.push(overlay_chain);

        Ok(filter_parts.join("; "))
    }

    /// Generate black background filter (AC #4)
    fn generate_black_background(&self) -> String {
        format!(
            "color=black:s={}x{}:d=10[vout]",
            self.canvas_size.width, self.canvas_size.height
        )
    }

    /// Generate filter for single video layer (no overlay needed)
    fn generate_single_layer_filter(
        &self,
        input_index: usize,
        layer: &VideoLayer,
        canvas: CanvasSize,
    ) -> String {
        // If transform is specified, use it; otherwise scale to canvas with aspect ratio preservation
        if let Some(ref transform) = layer.clip.transform {
            format!(
                "[{}:v]scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:black[vout]",
                input_index,
                transform.width as u32,
                transform.height as u32,
                canvas.width,
                canvas.height
            )
        } else {
            format!(
                "[{}:v]scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:black[vout]",
                input_index, canvas.width, canvas.height, canvas.width, canvas.height
            )
        }
    }

    /// Generate scale filter for a video layer (AC #6, #7)
    ///
    /// Scales video to target size while preserving aspect ratio.
    /// Adds padding (letterboxing/pillarboxing) if aspect ratios don't match.
    fn generate_scale_filter(
        &self,
        input_index: usize,
        layer: &VideoLayer,
        canvas: CanvasSize,
    ) -> Result<String> {
        let label = format!("v{}", input_index);

        // Determine target dimensions
        let (target_w, target_h) = if let Some(ref transform) = layer.clip.transform {
            // AC #8: Use transform dimensions for PiP effects
            (transform.width as u32, transform.height as u32)
        } else if input_index == 0 {
            // First layer (bottom): Scale to full canvas
            (canvas.width, canvas.height)
        } else {
            // Upper layers: Default PiP size (1/4 of canvas)
            (canvas.width / 2, canvas.height / 2)
        };

        // Generate scale filter with aspect ratio preservation
        // force_original_aspect_ratio=decrease ensures video fits within target dimensions
        let filter = if input_index == 0 {
            // Bottom layer: Scale to canvas with padding (letterbox/pillarbox)
            format!(
                "[{}:v]scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:black[{}]",
                input_index, target_w, target_h, canvas.width, canvas.height, label
            )
        } else {
            // Upper layers: Scale without padding (transparent overlay)
            format!(
                "[{}:v]scale={}:{}:force_original_aspect_ratio=decrease[{}]",
                input_index, target_w, target_h, label
            )
        };

        Ok(filter)
    }

    /// Generate overlay filter chain for multi-layer composition (AC #1, #2, #3, #8)
    ///
    /// Creates overlay chain from bottom to top:
    /// [v0][v1]overlay[tmp1]; [tmp1][v2]overlay[tmp2]; [tmp2][v3]overlay[vout]
    fn generate_overlay_chain(
        &self,
        layers: &[VideoLayer],
        canvas: CanvasSize,
    ) -> Result<String> {
        let mut chain_parts = Vec::new();
        let mut current_label = "v0".to_string(); // Start with bottom layer

        // Build overlay chain from bottom to top (AC #1, #2)
        for i in 1..layers.len() {
            let layer = &layers[i];
            let overlay_label = format!("v{}", i);
            let output_label = if i == layers.len() - 1 {
                "vout".to_string() // Final output
            } else {
                format!("tmp{}", i) // Intermediate result
            };

            // Calculate overlay position (AC #8)
            let (x, y) = if let Some(ref transform) = layer.clip.transform {
                // Use explicit transform position
                (transform.x as i32, transform.y as i32)
            } else {
                // Default PiP positioning (top-right corner with 20px margin)
                let margin = 20;
                let layer_width = canvas.width / 2;
                (
                    (canvas.width - layer_width - margin) as i32,
                    margin as i32,
                )
            };

            // Generate overlay filter with alpha channel support (AC #3)
            // format=auto:alpha=auto enables transparency for semi-transparent overlays
            let alpha_param = if let Some(ref transform) = layer.clip.transform {
                if transform.opacity < 1.0 {
                    format!(":alpha={}", transform.opacity)
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            let overlay_filter = format!(
                "[{}][{}]overlay=x={}:y={}:format=auto{}[{}]",
                current_label, overlay_label, x, y, alpha_param, output_label
            );

            chain_parts.push(overlay_filter);
            current_label = output_label;
        }

        Ok(chain_parts.join("; "))
    }

    /// Build complete FFmpeg command for rendering a segment
    ///
    /// # Arguments
    ///
    /// * `segment` - Segment to render
    /// * `output_path` - Path where rendered segment will be saved
    ///
    /// # Returns
    ///
    /// FFmpeg command arguments for pre-rendering the segment
    ///
    /// # Performance Optimizations (AC #5)
    ///
    /// - Hardware acceleration: VideoToolbox encoder on macOS (h264_videotoolbox)
    /// - Preset: ultrafast for real-time encoding
    /// - CRF: 23 (good quality, fast encode)
    /// - Target: 60 FPS with 3 simultaneous video tracks
    pub fn build_ffmpeg_command(
        &self,
        segment: &Segment,
        output_path: &Path,
    ) -> Result<Vec<String>> {
        let mut args = Vec::new();

        // Add input files for each video layer
        for layer in &segment.video_layers {
            args.push("-i".to_string());
            args.push(layer.clip.file_path.clone());

            // Add trim parameters if clip has trim points
            if layer.clip.trim_in > 0 {
                args.push("-ss".to_string());
                args.push(format!("{:.3}", layer.clip.trim_in as f64 / 1000.0));
            }

            let trim_duration = layer.clip.trim_out - layer.clip.trim_in;
            if trim_duration < layer.clip.duration {
                args.push("-t".to_string());
                args.push(format!("{:.3}", trim_duration as f64 / 1000.0));
            }
        }

        // Generate filter graph
        let filter_graph = self.generate_filter_graph(segment)?;
        args.push("-filter_complex".to_string());
        args.push(filter_graph);
        args.push("-map".to_string());
        args.push("[vout]".to_string());

        // AC #5: Hardware acceleration (macOS)
        #[cfg(target_os = "macos")]
        {
            args.push("-c:v".to_string());
            args.push("h264_videotoolbox".to_string());
            debug!("Using VideoToolbox hardware acceleration for segment rendering");
        }

        // Fallback to software encoding on other platforms
        #[cfg(not(target_os = "macos"))]
        {
            args.push("-c:v".to_string());
            args.push("libx264".to_string());
            args.push("-preset".to_string());
            args.push("ultrafast".to_string());
        }

        // Limit thread count to prevent CPU saturation (AC #6: CPU <80%)
        args.push("-threads".to_string());
        args.push("4".to_string());

        // Encoding settings for real-time performance
        args.push("-crf".to_string());
        args.push("23".to_string());

        // QuickTime/MPV compatibility
        args.push("-pix_fmt".to_string());
        args.push("yuv420p".to_string());
        args.push("-profile:v".to_string());
        args.push("high".to_string());
        args.push("-movflags".to_string());
        args.push("+faststart".to_string());

        // Output
        args.push("-f".to_string());
        args.push("mp4".to_string());
        args.push("-y".to_string());
        args.push(output_path.to_string_lossy().to_string());

        Ok(args)
    }

    /// Render a segment to cache (pre-rendering for complex segments)
    ///
    /// # Arguments
    ///
    /// * `segment` - Segment to render
    ///
    /// # Returns
    ///
    /// Path to the cached segment file
    pub fn render_segment(&self, segment: &Segment) -> Result<PathBuf> {
        // Generate cache key from segment content hash
        let cache_key = self.generate_cache_key(segment)?;
        let output_path = self.cache_dir.join(format!("{}.mp4", cache_key));

        // Check if cached file already exists
        if output_path.exists() {
            info!("Segment cache hit: {}", output_path.display());
            return Ok(output_path);
        }

        info!("Rendering complex segment to cache: {}", output_path.display());

        // Build FFmpeg command
        let args = self.build_ffmpeg_command(segment, &output_path)?;

        debug!("FFmpeg args: {:?}", args);

        // Execute FFmpeg to render the segment
        let mut command = FfmpegCommand::new();
        command.args(&args);

        let mut child = command
            .spawn()
            .context("Failed to spawn FFmpeg for segment rendering")?;

        // Wait for rendering to complete
        let result = child
            .wait()
            .context("FFmpeg segment rendering process failed")?;

        if !result.success() {
            warn!(
                "FFmpeg segment rendering exited with error for cache key: {}",
                cache_key
            );
            return Err(anyhow::anyhow!("FFmpeg segment rendering failed"));
        }

        // Verify output file was created
        if !output_path.exists() {
            return Err(anyhow::anyhow!(
                "Segment cache file not created: {}",
                output_path.display()
            ));
        }

        info!(
            "Segment rendered successfully: {} ({} bytes)",
            output_path.display(),
            output_path.metadata()?.len()
        );

        Ok(output_path)
    }

    /// Generate cache key for a segment
    ///
    /// Cache key includes:
    /// - Track structure (number of layers, track numbers)
    /// - Clip file paths
    /// - Clip trim points
    /// - Transform data (position, scale, opacity)
    ///
    /// When any of these change, cache invalidates and segment re-renders.
    pub fn generate_cache_key(&self, segment: &Segment) -> Result<String> {
        use sha2::{Digest, Sha256};

        let mut hasher = Sha256::new();

        // Hash track structure
        hasher.update(segment.video_layers.len().to_string().as_bytes());

        for layer in &segment.video_layers {
            // Hash clip data
            hasher.update(layer.clip.file_path.as_bytes());
            hasher.update(layer.clip.trim_in.to_string().as_bytes());
            hasher.update(layer.clip.trim_out.to_string().as_bytes());
            hasher.update(layer.track_number.to_string().as_bytes());

            // Hash transform if present
            if let Some(ref transform) = layer.clip.transform {
                hasher.update(transform.x.to_string().as_bytes());
                hasher.update(transform.y.to_string().as_bytes());
                hasher.update(transform.width.to_string().as_bytes());
                hasher.update(transform.height.to_string().as_bytes());
                hasher.update(transform.opacity.to_string().as_bytes());
            }
        }

        let result = hasher.finalize();
        Ok(format!("{:x}", result))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test helper: Create a test clip
    fn create_test_clip(file_path: &str, duration_ms: u64) -> Clip {
        Clip {
            id: "test-clip".to_string(),
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
    fn test_black_background_generation() {
        // AC #4: Black background when no clips
        let renderer = SegmentRenderer::new(PathBuf::from("/tmp/cache"));
        let segment = Segment {
            video_layers: vec![],
            start_time: 0,
            duration: 1000,
            canvas_size: CanvasSize {
                width: 1920,
                height: 1080,
            },
        };

        let filter = renderer.generate_filter_graph(&segment).unwrap();
        assert!(filter.contains("color=black"));
        assert!(filter.contains("1920x1080"));
    }

    #[test]
    fn test_single_layer_filter() {
        // Single layer should scale to canvas with aspect ratio preservation
        let renderer = SegmentRenderer::new(PathBuf::from("/tmp/cache"));
        let clip = create_test_clip("/path/to/video.mp4", 10000);
        let layer = create_test_layer(clip, 1, 0);

        let segment = Segment {
            video_layers: vec![layer],
            start_time: 0,
            duration: 1000,
            canvas_size: CanvasSize {
                width: 1920,
                height: 1080,
            },
        };

        let filter = renderer.generate_filter_graph(&segment).unwrap();
        assert!(filter.contains("scale=1920:1080"));
        assert!(filter.contains("force_original_aspect_ratio=decrease"));
        assert!(filter.contains("pad=1920:1080"));
    }

    #[test]
    fn test_two_layer_overlay() {
        // AC #1, #2: Two layers should create overlay filter chain
        let renderer = SegmentRenderer::new(PathBuf::from("/tmp/cache"));
        let clip1 = create_test_clip("/path/to/video1.mp4", 10000);
        let clip2 = create_test_clip("/path/to/video2.mp4", 10000);
        let layer1 = create_test_layer(clip1, 1, 0); // Bottom
        let layer2 = create_test_layer(clip2, 2, 1); // Top

        let segment = Segment {
            video_layers: vec![layer1, layer2],
            start_time: 0,
            duration: 1000,
            canvas_size: CanvasSize {
                width: 1920,
                height: 1080,
            },
        };

        let filter = renderer.generate_filter_graph(&segment).unwrap();
        // Should have scale filters for both layers
        assert!(filter.contains("[0:v]scale="));
        assert!(filter.contains("[1:v]scale="));
        // Should have overlay filter
        assert!(filter.contains("overlay="));
        assert!(filter.contains("[vout]"));
    }

    #[test]
    fn test_three_layer_overlay_chain() {
        // AC #1, #2: Three layers should create chained overlay filters
        let renderer = SegmentRenderer::new(PathBuf::from("/tmp/cache"));
        let clip1 = create_test_clip("/path/to/video1.mp4", 10000);
        let clip2 = create_test_clip("/path/to/video2.mp4", 10000);
        let clip3 = create_test_clip("/path/to/video3.mp4", 10000);
        let layer1 = create_test_layer(clip1, 1, 0); // Bottom
        let layer2 = create_test_layer(clip2, 2, 1); // Middle
        let layer3 = create_test_layer(clip3, 3, 2); // Top

        let segment = Segment {
            video_layers: vec![layer1, layer2, layer3],
            start_time: 0,
            duration: 1000,
            canvas_size: CanvasSize {
                width: 1920,
                height: 1080,
            },
        };

        let filter = renderer.generate_filter_graph(&segment).unwrap();
        // Should have 3 scale filters
        assert!(filter.contains("[0:v]scale="));
        assert!(filter.contains("[1:v]scale="));
        assert!(filter.contains("[2:v]scale="));
        // Should have 2 overlay filters (v0+v1=tmp1, tmp1+v2=vout)
        assert!(filter.contains("[v0][v1]overlay"));
        assert!(filter.contains("[tmp1][v2]overlay"));
    }

    #[test]
    fn test_alpha_channel_support() {
        // AC #3: Alpha channel support for semi-transparent overlays
        let renderer = SegmentRenderer::new(PathBuf::from("/tmp/cache"));
        let clip1 = create_test_clip("/path/to/video1.mp4", 10000);
        let mut clip2 = create_test_clip("/path/to/video2.mp4", 10000);
        clip2.transform = Some(ClipTransform {
            x: 100.0,
            y: 100.0,
            width: 640.0,
            height: 360.0,
            opacity: 0.5, // Semi-transparent
        });

        let layer1 = create_test_layer(clip1, 1, 0);
        let layer2 = create_test_layer(clip2, 2, 1);

        let segment = Segment {
            video_layers: vec![layer1, layer2],
            start_time: 0,
            duration: 1000,
            canvas_size: CanvasSize {
                width: 1920,
                height: 1080,
            },
        };

        let filter = renderer.generate_filter_graph(&segment).unwrap();
        // Should include alpha parameter for opacity
        assert!(filter.contains("alpha=0.5"));
        assert!(filter.contains("format=auto"));
    }

    #[test]
    fn test_transform_positioning() {
        // AC #8: Position/scale transforms for PiP effects
        let renderer = SegmentRenderer::new(PathBuf::from("/tmp/cache"));
        let clip1 = create_test_clip("/path/to/video1.mp4", 10000);
        let mut clip2 = create_test_clip("/path/to/video2.mp4", 10000);
        clip2.transform = Some(ClipTransform {
            x: 200.0,
            y: 150.0,
            width: 800.0,
            height: 600.0,
            opacity: 1.0,
        });

        let layer1 = create_test_layer(clip1, 1, 0);
        let layer2 = create_test_layer(clip2, 2, 1);

        let segment = Segment {
            video_layers: vec![layer1, layer2],
            start_time: 0,
            duration: 1000,
            canvas_size: CanvasSize {
                width: 1920,
                height: 1080,
            },
        };

        let filter = renderer.generate_filter_graph(&segment).unwrap();
        // Should use transform dimensions for scaling
        assert!(filter.contains("scale=800:600"));
        // Should use transform position for overlay
        assert!(filter.contains("overlay=x=200:y=150"));
    }

    #[test]
    fn test_cache_key_generation() {
        let renderer = SegmentRenderer::new(PathBuf::from("/tmp/cache"));
        let clip1 = create_test_clip("/path/to/video1.mp4", 10000);
        let layer1 = create_test_layer(clip1, 1, 0);

        let segment = Segment {
            video_layers: vec![layer1],
            start_time: 0,
            duration: 1000,
            canvas_size: CanvasSize {
                width: 1920,
                height: 1080,
            },
        };

        let key1 = renderer.generate_cache_key(&segment).unwrap();
        let key2 = renderer.generate_cache_key(&segment).unwrap();

        // Same segment should generate same cache key
        assert_eq!(key1, key2);
        assert_eq!(key1.len(), 64); // SHA-256 produces 64 hex chars
    }

    #[test]
    fn test_cache_invalidation_on_transform_change() {
        let renderer = SegmentRenderer::new(PathBuf::from("/tmp/cache"));
        let mut clip1 = create_test_clip("/path/to/video1.mp4", 10000);
        let layer1 = create_test_layer(clip1.clone(), 1, 0);

        let segment1 = Segment {
            video_layers: vec![layer1],
            start_time: 0,
            duration: 1000,
            canvas_size: CanvasSize {
                width: 1920,
                height: 1080,
            },
        };

        // Add transform
        clip1.transform = Some(ClipTransform {
            x: 100.0,
            y: 100.0,
            width: 640.0,
            height: 360.0,
            opacity: 1.0,
        });
        let layer2 = create_test_layer(clip1, 1, 0);
        let segment2 = Segment {
            video_layers: vec![layer2],
            start_time: 0,
            duration: 1000,
            canvas_size: CanvasSize {
                width: 1920,
                height: 1080,
            },
        };

        let key1 = renderer.generate_cache_key(&segment1).unwrap();
        let key2 = renderer.generate_cache_key(&segment2).unwrap();

        // Different transforms should generate different cache keys
        assert_ne!(key1, key2);
    }
}
