//! Frame comparison utilities for parity validation
//!
//! Implements pixel-by-pixel comparison of video frames with variance calculation.
//! Accounts for compression artifacts and codec differences.

use anyhow::{Context, Result};
use image::{GenericImageView, Rgba};
use std::path::Path;

/// Result of frame comparison
#[derive(Debug, Clone)]
pub struct FrameComparisonResult {
    /// Percentage of pixels that differ (0.0 = identical, 100.0 = completely different)
    pub variance_percentage: f64,
    /// Total number of pixels compared
    pub total_pixels: u64,
    /// Number of pixels that differ beyond threshold
    pub differing_pixels: u64,
    /// Whether the frames are considered matching (variance < threshold)
    pub is_match: bool,
    /// Path to visual diff image (if generated)
    pub diff_image_path: Option<String>,
}

/// Configuration for frame comparison
#[derive(Debug, Clone)]
pub struct FrameComparisonConfig {
    /// Maximum acceptable variance percentage (default: 5.0%)
    pub max_variance_percentage: f64,
    /// Pixel difference threshold (0-255, default: 10)
    /// Pixels differing by less than this are considered identical
    pub pixel_diff_threshold: u8,
    /// Whether to generate visual diff image
    pub generate_diff_image: bool,
    /// Output path for diff image
    pub diff_output_path: Option<String>,
}

impl Default for FrameComparisonConfig {
    fn default() -> Self {
        Self {
            max_variance_percentage: 5.0,
            pixel_diff_threshold: 10,
            generate_diff_image: false,
            diff_output_path: None,
        }
    }
}

/// Compare two frames and calculate variance
///
/// # Arguments
/// * `frame1_path` - Path to first frame image
/// * `frame2_path` - Path to second frame image
/// * `config` - Comparison configuration
///
/// # Returns
/// Frame comparison result with variance percentage and match status
pub fn compare_frames(
    frame1_path: &Path,
    frame2_path: &Path,
    config: &FrameComparisonConfig,
) -> Result<FrameComparisonResult> {
    // Load images
    let img1 = image::open(frame1_path)
        .with_context(|| format!("Failed to load frame1: {}", frame1_path.display()))?;
    let img2 = image::open(frame2_path)
        .with_context(|| format!("Failed to load frame2: {}", frame2_path.display()))?;

    // Ensure dimensions match
    if img1.dimensions() != img2.dimensions() {
        anyhow::bail!(
            "Frame dimensions don't match: {}x{} vs {}x{}",
            img1.width(),
            img1.height(),
            img2.width(),
            img2.height()
        );
    }

    let (width, height) = img1.dimensions();
    let total_pixels = (width * height) as u64;

    // Convert to RGBA for consistent comparison
    let img1 = img1.to_rgba8();
    let img2 = img2.to_rgba8();

    let mut differing_pixels = 0u64;
    let mut diff_image = if config.generate_diff_image {
        Some(image::RgbaImage::new(width, height))
    } else {
        None
    };

    // Compare pixels
    for y in 0..height {
        for x in 0..width {
            let pixel1 = img1.get_pixel(x, y);
            let pixel2 = img2.get_pixel(x, y);

            let diff = calculate_pixel_difference(pixel1, pixel2);

            if diff > config.pixel_diff_threshold {
                differing_pixels += 1;

                // Mark difference in diff image (red highlight)
                if let Some(ref mut diff_img) = diff_image {
                    diff_img.put_pixel(x, y, Rgba([255, 0, 0, 255]));
                }
            } else {
                // Show original pixel in diff image (grayscale for context)
                if let Some(ref mut diff_img) = diff_image {
                    let gray = (pixel1[0] as u16 + pixel1[1] as u16 + pixel1[2] as u16) / 3;
                    diff_img.put_pixel(x, y, Rgba([gray as u8, gray as u8, gray as u8, 255]));
                }
            }
        }
    }

    // Calculate variance percentage
    let variance_percentage = (differing_pixels as f64 / total_pixels as f64) * 100.0;
    let is_match = variance_percentage <= config.max_variance_percentage;

    // Save diff image if generated
    let diff_image_path = if let Some(diff_img) = diff_image {
        let output_path = config.diff_output_path.as_ref()
            .context("diff_output_path required when generate_diff_image is true")?;

        diff_img.save(output_path)
            .with_context(|| format!("Failed to save diff image to {}", output_path))?;

        Some(output_path.clone())
    } else {
        None
    };

    Ok(FrameComparisonResult {
        variance_percentage,
        total_pixels,
        differing_pixels,
        is_match,
        diff_image_path,
    })
}

/// Calculate the difference between two pixels
///
/// Uses Euclidean distance in RGB space (ignoring alpha channel)
fn calculate_pixel_difference(pixel1: &Rgba<u8>, pixel2: &Rgba<u8>) -> u8 {
    let r_diff = (pixel1[0] as i32 - pixel2[0] as i32).pow(2);
    let g_diff = (pixel1[1] as i32 - pixel2[1] as i32).pow(2);
    let b_diff = (pixel1[2] as i32 - pixel2[2] as i32).pow(2);

    let distance = ((r_diff + g_diff + b_diff) as f64).sqrt();
    distance.min(255.0) as u8
}

/// Extract a frame from a video file at a specific timestamp
///
/// # Arguments
/// * `video_path` - Path to video file
/// * `timestamp_ms` - Timestamp in milliseconds
/// * `output_path` - Path to save extracted frame
///
/// # Returns
/// Ok(()) if frame extracted successfully
pub fn extract_frame_from_video(
    video_path: &Path,
    timestamp_ms: u64,
    output_path: &Path,
) -> Result<()> {
    let timestamp_seconds = timestamp_ms as f64 / 1000.0;

    let status = std::process::Command::new("ffmpeg")
        .args(&[
            "-y", // Overwrite output
            "-ss", &format!("{:.3}", timestamp_seconds),
            "-i", video_path.to_str().unwrap(),
            "-vframes", "1",
            "-q:v", "2", // High quality
            output_path.to_str().unwrap(),
        ])
        .output()
        .context("Failed to run ffmpeg - ensure FFmpeg is installed")?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        anyhow::bail!("FFmpeg frame extraction failed: {}", stderr);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_pixel_difference() {
        // Identical pixels
        let pixel1 = Rgba([100, 100, 100, 255]);
        let pixel2 = Rgba([100, 100, 100, 255]);
        assert_eq!(calculate_pixel_difference(&pixel1, &pixel2), 0);

        // Slightly different pixels
        let pixel1 = Rgba([100, 100, 100, 255]);
        let pixel2 = Rgba([105, 105, 105, 255]);
        let diff = calculate_pixel_difference(&pixel1, &pixel2);
        assert!(diff < 15); // Small difference

        // Very different pixels
        let pixel1 = Rgba([0, 0, 0, 255]);
        let pixel2 = Rgba([255, 255, 255, 255]);
        let diff = calculate_pixel_difference(&pixel1, &pixel2);
        assert!(diff > 200); // Large difference
    }

    #[test]
    fn test_frame_comparison_config_default() {
        let config = FrameComparisonConfig::default();
        assert_eq!(config.max_variance_percentage, 5.0);
        assert_eq!(config.pixel_diff_threshold, 10);
        assert_eq!(config.generate_diff_image, false);
    }
}
