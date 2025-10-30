//! FFmpeg Audio Mixer for Multi-Track Composition Playback
//!
//! This module provides FFmpeg filter graph generation for multi-track audio mixing.
//! It builds `amix` filter graphs with per-clip volume, mute, and fade settings.
//!
//! # Architecture (Story 5.5)
//!
//! The audio mixer:
//! - Receives list of overlapping audio clips at current playhead
//! - Builds FFmpeg filter graph with per-clip effects (volume, fade)
//! - Uses `amix` filter to mix multiple audio streams into single output
//! - Supports 2-8 simultaneous audio tracks
//! - Applies clipping prevention via amix auto-normalization
//!
//! # FFmpeg Filter Syntax Example
//!
//! For 2 audio clips with volume and fade:
//! ```text
//! [0:a]volume=1.0,afade=t=in:st=0:d=1[a1];
//! [1:a]volume=0.5,afade=t=out:st=9:d=1[a2];
//! [a1][a2]amix=inputs=2:duration=longest[aout]
//! ```

use anyhow::Result;
use serde::{Deserialize, Serialize};

/// Audio clip metadata for mixing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioClipMixInfo {
    /// Clip ID for logging
    pub clip_id: String,

    /// File path to audio source
    pub file_path: String,

    /// Input index in FFmpeg command (0-based)
    pub input_index: usize,

    /// Clip start time on timeline (milliseconds)
    pub start_time_ms: u64,

    /// Clip duration (milliseconds)
    pub duration_ms: u64,

    /// Volume level (0.0 to 2.0, where 1.0 = 100%)
    /// Story 3.9: Clippy volume 0-200% → FFmpeg 0.0-2.0
    pub volume: f64,

    /// Whether clip is muted (excluded from mix if true)
    pub muted: bool,

    /// Fade-in duration (milliseconds, 0 = no fade)
    pub fade_in_ms: u64,

    /// Fade-out duration (milliseconds, 0 = no fade)
    pub fade_out_ms: u64,
}

/// Build FFmpeg audio filter graph for multi-track mixing
///
/// # Arguments
///
/// * `clips` - List of audio clips to mix (must be non-empty)
/// * `segment_start_ms` - Start time of the segment being rendered (for timestamp alignment)
///
/// # Returns
///
/// * `Ok(String)` - FFmpeg `-filter_complex` argument string
/// * `Err(anyhow::Error)` - Invalid input or unsupported configuration
///
/// # Story 5.5 Acceptance Criteria
///
/// - AC#2: Audio streams from overlapping clips mixed in real-time
/// - AC#3: Per-clip volume settings applied during mixing
/// - AC#4: Muted clips excluded from mix
/// - AC#5: Audio synchronization maintained across tracks (< 10ms variance)
/// - AC#6: Supports 2-8 simultaneous audio tracks
/// - AC#8: No audio distortion or clipping with multiple loud tracks
/// - AC#9: Fade-in/fade-out effects applied correctly in mix
///
/// # Examples
///
/// ```
/// use clippy::services::ffmpeg::audio_mixer::{AudioClipMixInfo, build_audio_mix_filter};
///
/// let clips = vec![
///     AudioClipMixInfo {
///         clip_id: "narration".to_string(),
///         file_path: "/path/to/narration.mp3".to_string(),
///         input_index: 0,
///         start_time_ms: 1000,
///         duration_ms: 5000,
///         volume: 1.0,  // 100%
///         muted: false,
///         fade_in_ms: 500,
///         fade_out_ms: 500,
///     },
///     AudioClipMixInfo {
///         clip_id: "music".to_string(),
///         file_path: "/path/to/music.mp3".to_string(),
///         input_index: 1,
///         start_time_ms: 2000,
///         duration_ms: 6000,
///         volume: 0.5,  // 50%
///         muted: false,
///         fade_in_ms: 1000,
///         fade_out_ms: 1000,
///     },
/// ];
///
/// let filter = build_audio_mix_filter(&clips, 1000)?;
/// // Result: "[0:a]volume=1.0,afade=t=in:st=0:d=0.500,afade=t=out:st=4.500:d=0.500[a0];[1:a]adelay=1000|1000,volume=0.5,afade=t=in:st=0:d=1.000,afade=t=out:st=5.000:d=1.000[a1];[a0][a1]amix=inputs=2:duration=longest:dropout_transition=0[aout]"
/// ```
pub fn build_audio_mix_filter(
    clips: &[AudioClipMixInfo],
    segment_start_ms: u64,
) -> Result<String> {
    // AC#4: Filter out muted clips
    let active_clips: Vec<&AudioClipMixInfo> = clips.iter().filter(|c| !c.muted).collect();

    // Validation: Must have at least 1 non-muted clip
    if active_clips.is_empty() {
        anyhow::bail!("No active audio clips to mix (all clips are muted)");
    }

    // AC#6: Support 2-8 simultaneous audio tracks
    // Single clip optimization: No mixing needed, just apply effects
    if active_clips.len() == 1 {
        return build_single_clip_filter(active_clips[0], segment_start_ms);
    }

    // Validate max track count
    if active_clips.len() > 8 {
        anyhow::bail!(
            "Too many audio tracks: {} (maximum 8 supported)",
            active_clips.len()
        );
    }

    // Build filter graph for each clip
    let mut filter_parts = Vec::new();

    for (idx, clip) in active_clips.iter().enumerate() {
        let mut clip_filters = Vec::new();

        // AC#5: Audio synchronization - calculate delay relative to segment start
        let delay_ms = clip.start_time_ms.saturating_sub(segment_start_ms);
        if delay_ms > 0 {
            // adelay for stereo: delay both channels
            clip_filters.push(format!("adelay={}|{}", delay_ms, delay_ms));
        }

        // AC#3: Apply per-clip volume
        clip_filters.push(format!("volume={:.2}", clip.volume));

        // AC#9: Apply fade-in if specified
        if clip.fade_in_ms > 0 {
            let fade_in_sec = clip.fade_in_ms as f64 / 1000.0;
            clip_filters.push(format!("afade=t=in:st=0:d={:.3}", fade_in_sec));
        }

        // AC#9: Apply fade-out if specified
        if clip.fade_out_ms > 0 {
            let fade_out_sec = clip.fade_out_ms as f64 / 1000.0;
            let clip_duration_sec = clip.duration_ms as f64 / 1000.0;
            let fade_out_start = clip_duration_sec - fade_out_sec;

            if fade_out_start >= 0.0 {
                clip_filters.push(format!("afade=t=out:st={:.3}:d={:.3}", fade_out_start, fade_out_sec));
            }
        }

        // Build filter chain for this clip
        let filter_chain = clip_filters.join(",");
        let output_label = format!("a{}", idx);

        filter_parts.push(format!(
            "[{}:a]{}[{}]",
            clip.input_index, filter_chain, output_label
        ));
    }

    // Build amix filter to combine all processed audio streams
    // AC#2: Mix all audio streams
    // AC#8: amix auto-normalization prevents clipping
    let input_labels: Vec<String> = (0..active_clips.len()).map(|i| format!("[a{}]", i)).collect();
    let amix_inputs = input_labels.join("");
    let amix_filter = format!(
        "{}amix=inputs={}:duration=longest:dropout_transition=0[aout]",
        amix_inputs,
        active_clips.len()
    );

    filter_parts.push(amix_filter);

    // Join all filter parts with semicolons
    Ok(filter_parts.join(";"))
}

/// Build FFmpeg audio filter for single clip (optimization, no mixing needed)
///
/// AC#7: Single audio track optimization - pass through with effects, skip mixing overhead
fn build_single_clip_filter(
    clip: &AudioClipMixInfo,
    segment_start_ms: u64,
) -> Result<String> {
    let mut filters = Vec::new();

    // Calculate delay relative to segment start
    let delay_ms = clip.start_time_ms.saturating_sub(segment_start_ms);
    if delay_ms > 0 {
        filters.push(format!("adelay={}|{}", delay_ms, delay_ms));
    }

    // Apply volume
    filters.push(format!("volume={:.2}", clip.volume));

    // Apply fade-in if specified
    if clip.fade_in_ms > 0 {
        let fade_in_sec = clip.fade_in_ms as f64 / 1000.0;
        filters.push(format!("afade=t=in:st=0:d={:.3}", fade_in_sec));
    }

    // Apply fade-out if specified
    if clip.fade_out_ms > 0 {
        let fade_out_sec = clip.fade_out_ms as f64 / 1000.0;
        let clip_duration_sec = clip.duration_ms as f64 / 1000.0;
        let fade_out_start = clip_duration_sec - fade_out_sec;

        if fade_out_start >= 0.0 {
            filters.push(format!("afade=t=out:st={:.3}:d={:.3}", fade_out_start, fade_out_sec));
        }
    }

    // Single clip: [0:a]filter1,filter2,...[aout]
    let filter_chain = filters.join(",");
    Ok(format!("[{}:a]{}[aout]", clip.input_index, filter_chain))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_clip_with_volume() {
        let clips = vec![AudioClipMixInfo {
            clip_id: "test".to_string(),
            file_path: "/test.mp3".to_string(),
            input_index: 0,
            start_time_ms: 1000,
            duration_ms: 5000,
            volume: 0.8,
            muted: false,
            fade_in_ms: 0,
            fade_out_ms: 0,
        }];

        let filter = build_audio_mix_filter(&clips, 1000).unwrap();

        // Single clip optimization - no amix
        assert!(filter.contains("[0:a]"));
        assert!(filter.contains("volume=0.80"));
        assert!(filter.contains("[aout]"));
        assert!(!filter.contains("amix"));
    }

    #[test]
    fn test_two_clips_with_mixing() {
        let clips = vec![
            AudioClipMixInfo {
                clip_id: "clip1".to_string(),
                file_path: "/clip1.mp3".to_string(),
                input_index: 0,
                start_time_ms: 1000,
                duration_ms: 5000,
                volume: 1.0,
                muted: false,
                fade_in_ms: 0,
                fade_out_ms: 0,
            },
            AudioClipMixInfo {
                clip_id: "clip2".to_string(),
                file_path: "/clip2.mp3".to_string(),
                input_index: 1,
                start_time_ms: 2000,
                duration_ms: 4000,
                volume: 0.5,
                muted: false,
                fade_in_ms: 0,
                fade_out_ms: 0,
            },
        ];

        let filter = build_audio_mix_filter(&clips, 1000).unwrap();

        // Should have amix with 2 inputs
        assert!(filter.contains("amix=inputs=2"));
        assert!(filter.contains("[0:a]"));
        assert!(filter.contains("[1:a]"));
        assert!(filter.contains("volume=1.00"));
        assert!(filter.contains("volume=0.50"));
        assert!(filter.contains("adelay=1000|1000")); // clip2 delayed by 1s
    }

    #[test]
    fn test_muted_clips_excluded() {
        let clips = vec![
            AudioClipMixInfo {
                clip_id: "active".to_string(),
                file_path: "/active.mp3".to_string(),
                input_index: 0,
                start_time_ms: 1000,
                duration_ms: 5000,
                volume: 1.0,
                muted: false,
                fade_in_ms: 0,
                fade_out_ms: 0,
            },
            AudioClipMixInfo {
                clip_id: "muted".to_string(),
                file_path: "/muted.mp3".to_string(),
                input_index: 1,
                start_time_ms: 1000,
                duration_ms: 5000,
                volume: 1.0,
                muted: true,  // AC#4: Muted clip should be excluded
                fade_in_ms: 0,
                fade_out_ms: 0,
            },
        ];

        let filter = build_audio_mix_filter(&clips, 1000).unwrap();

        // Only active clip should be in filter (single clip optimization)
        assert!(filter.contains("[0:a]"));
        assert!(!filter.contains("[1:a]"));
        assert!(!filter.contains("amix")); // Single clip, no mixing
    }

    #[test]
    fn test_fade_in_and_out() {
        let clips = vec![AudioClipMixInfo {
            clip_id: "faded".to_string(),
            file_path: "/faded.mp3".to_string(),
            input_index: 0,
            start_time_ms: 1000,
            duration_ms: 5000,
            volume: 1.0,
            muted: false,
            fade_in_ms: 500,   // AC#9: 500ms fade-in
            fade_out_ms: 1000, // AC#9: 1000ms fade-out
        }];

        let filter = build_audio_mix_filter(&clips, 1000).unwrap();

        assert!(filter.contains("afade=t=in:st=0:d=0.500"));
        assert!(filter.contains("afade=t=out:st=4.000:d=1.000")); // 5s - 1s = 4s start
    }

    #[test]
    fn test_max_tracks_validation() {
        // Create 9 clips (exceeds AC#6 limit of 8)
        let clips: Vec<AudioClipMixInfo> = (0..9)
            .map(|i| AudioClipMixInfo {
                clip_id: format!("clip{}", i),
                file_path: format!("/clip{}.mp3", i),
                input_index: i,
                start_time_ms: 1000,
                duration_ms: 5000,
                volume: 1.0,
                muted: false,
                fade_in_ms: 0,
                fade_out_ms: 0,
            })
            .collect();

        let result = build_audio_mix_filter(&clips, 1000);

        // Should fail validation
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Too many audio tracks"));
    }

    #[test]
    fn test_all_muted_clips_error() {
        let clips = vec![
            AudioClipMixInfo {
                clip_id: "muted1".to_string(),
                file_path: "/muted1.mp3".to_string(),
                input_index: 0,
                start_time_ms: 1000,
                duration_ms: 5000,
                volume: 1.0,
                muted: true,
                fade_in_ms: 0,
                fade_out_ms: 0,
            },
            AudioClipMixInfo {
                clip_id: "muted2".to_string(),
                file_path: "/muted2.mp3".to_string(),
                input_index: 1,
                start_time_ms: 1000,
                duration_ms: 5000,
                volume: 1.0,
                muted: true,
                fade_in_ms: 0,
                fade_out_ms: 0,
            },
        ];

        let result = build_audio_mix_filter(&clips, 1000);

        // Should fail - no active clips
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("all clips are muted"));
    }
}
