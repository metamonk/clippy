//! Audio waveform comparison utilities for parity validation
//!
//! Implements amplitude comparison of audio waveforms at sample intervals.
//! Accounts for floating-point precision differences in audio mixing.

use anyhow::{Context, Result};
use hound::{WavReader, WavSpec};
use std::path::Path;

/// Result of audio waveform comparison
#[derive(Debug, Clone)]
pub struct AudioComparisonResult {
    /// Percentage of samples that differ beyond threshold
    pub variance_percentage: f64,
    /// Total number of samples compared
    pub total_samples: u64,
    /// Number of samples that differ beyond threshold
    pub differing_samples: u64,
    /// Whether the waveforms are considered matching (variance < threshold)
    pub is_match: bool,
    /// Maximum amplitude difference observed
    pub max_amplitude_diff: i16,
    /// Root mean square error across all samples
    pub rms_error: f64,
}

/// Configuration for audio comparison
#[derive(Debug, Clone)]
pub struct AudioComparisonConfig {
    /// Maximum acceptable variance percentage (default: 1.0%)
    pub max_variance_percentage: f64,
    /// Sample difference threshold (default: 100 for 16-bit audio)
    /// Samples differing by less than this are considered identical
    pub sample_diff_threshold: i16,
    /// Sample comparison interval (default: 1 = compare every sample)
    /// Use higher values (e.g., 100) for faster comparison
    pub sample_interval: usize,
}

impl Default for AudioComparisonConfig {
    fn default() -> Self {
        Self {
            max_variance_percentage: 1.0,
            sample_diff_threshold: 100,
            sample_interval: 1,
        }
    }
}

/// Compare two audio waveforms and calculate variance
///
/// # Arguments
/// * `audio1_path` - Path to first audio WAV file
/// * `audio2_path` - Path to second audio WAV file
/// * `config` - Comparison configuration
///
/// # Returns
/// Audio comparison result with variance percentage and match status
pub fn compare_audio_waveforms(
    audio1_path: &Path,
    audio2_path: &Path,
    config: &AudioComparisonConfig,
) -> Result<AudioComparisonResult> {
    // Open WAV files
    let mut reader1 = WavReader::open(audio1_path)
        .with_context(|| format!("Failed to open audio1: {}", audio1_path.display()))?;
    let mut reader2 = WavReader::open(audio2_path)
        .with_context(|| format!("Failed to open audio2: {}", audio2_path.display()))?;

    let spec1 = reader1.spec();
    let spec2 = reader2.spec();

    // Validate audio specs match
    validate_audio_specs(&spec1, &spec2)?;

    // Read samples (assuming 16-bit PCM)
    let samples1: Vec<i16> = reader1
        .samples::<i16>()
        .collect::<Result<Vec<i16>, _>>()
        .context("Failed to read samples from audio1")?;

    let samples2: Vec<i16> = reader2
        .samples::<i16>()
        .collect::<Result<Vec<i16>, _>>()
        .context("Failed to read samples from audio2")?;

    // Ensure sample counts match
    if samples1.len() != samples2.len() {
        anyhow::bail!(
            "Audio sample counts don't match: {} vs {}",
            samples1.len(),
            samples2.len()
        );
    }

    let mut differing_samples = 0u64;
    let mut max_amplitude_diff = 0i16;
    let mut sum_squared_error = 0f64;
    let mut compared_samples = 0u64;

    // Compare samples at specified interval
    for i in (0..samples1.len()).step_by(config.sample_interval) {
        let sample1 = samples1[i];
        let sample2 = samples2[i];

        let diff = (sample1 - sample2).abs();
        max_amplitude_diff = max_amplitude_diff.max(diff);
        sum_squared_error += (diff as f64).powi(2);

        if diff > config.sample_diff_threshold {
            differing_samples += 1;
        }

        compared_samples += 1;
    }

    // Calculate variance and RMS error
    let variance_percentage = (differing_samples as f64 / compared_samples as f64) * 100.0;
    let rms_error = (sum_squared_error / compared_samples as f64).sqrt();
    let is_match = variance_percentage <= config.max_variance_percentage;

    Ok(AudioComparisonResult {
        variance_percentage,
        total_samples: compared_samples,
        differing_samples,
        is_match,
        max_amplitude_diff,
        rms_error,
    })
}

/// Validate that audio specs match between two files
fn validate_audio_specs(spec1: &WavSpec, spec2: &WavSpec) -> Result<()> {
    if spec1.channels != spec2.channels {
        anyhow::bail!(
            "Audio channel counts don't match: {} vs {}",
            spec1.channels,
            spec2.channels
        );
    }

    if spec1.sample_rate != spec2.sample_rate {
        anyhow::bail!(
            "Audio sample rates don't match: {} vs {}",
            spec1.sample_rate,
            spec2.sample_rate
        );
    }

    if spec1.bits_per_sample != spec2.bits_per_sample {
        anyhow::bail!(
            "Audio bit depths don't match: {} vs {}",
            spec1.bits_per_sample,
            spec2.bits_per_sample
        );
    }

    Ok(())
}

/// Extract audio from a video file to WAV format
///
/// # Arguments
/// * `video_path` - Path to video file
/// * `output_path` - Path to save extracted audio WAV
///
/// # Returns
/// Ok(()) if audio extracted successfully
pub fn extract_audio_from_video(video_path: &Path, output_path: &Path) -> Result<()> {
    let status = std::process::Command::new("ffmpeg")
        .args(&[
            "-y", // Overwrite output
            "-i",
            video_path.to_str().unwrap(),
            "-vn", // No video
            "-acodec",
            "pcm_s16le", // 16-bit PCM
            "-ar",
            "48000", // 48kHz sample rate
            "-ac",
            "2", // Stereo
            output_path.to_str().unwrap(),
        ])
        .output()
        .context("Failed to run ffmpeg - ensure FFmpeg is installed")?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        anyhow::bail!("FFmpeg audio extraction failed: {}", stderr);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_comparison_config_default() {
        let config = AudioComparisonConfig::default();
        assert_eq!(config.max_variance_percentage, 1.0);
        assert_eq!(config.sample_diff_threshold, 100);
        assert_eq!(config.sample_interval, 1);
    }

    #[test]
    fn test_validate_audio_specs() {
        let spec1 = WavSpec {
            channels: 2,
            sample_rate: 48000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let spec2 = WavSpec {
            channels: 2,
            sample_rate: 48000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        assert!(validate_audio_specs(&spec1, &spec2).is_ok());

        // Different channel count
        let spec3 = WavSpec {
            channels: 1,
            ..spec2
        };
        assert!(validate_audio_specs(&spec1, &spec3).is_err());

        // Different sample rate
        let spec4 = WavSpec {
            sample_rate: 44100,
            ..spec2
        };
        assert!(validate_audio_specs(&spec1, &spec4).is_err());
    }
}
