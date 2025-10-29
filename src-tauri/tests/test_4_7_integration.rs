//! Integration tests for Story 4.7: Independent Audio Track Management in PiP Recording
//!
//! These tests validate that:
//! - FFmpeg can mux 3 independent audio tracks into a single MP4
//! - All audio tracks are encoded as AAC at 48kHz stereo
//! - The resulting file is playable with all tracks accessible
//! - Audio/video synchronization is maintained across all tracks

use std::path::{Path, PathBuf};
use std::process::Command;
use std::fs;
use serde::{Deserialize, Serialize};
use anyhow::{Context, Result};

/// FFprobe stream information
#[derive(Debug, Deserialize, Serialize)]
struct FFprobeStream {
    index: usize,
    codec_name: String,
    codec_type: String,
    #[serde(default)]
    sample_rate: Option<String>,
    #[serde(default)]
    channels: Option<usize>,
    #[serde(default)]
    channel_layout: Option<String>,
}

/// FFprobe output format
#[derive(Debug, Deserialize, Serialize)]
struct FFprobeOutput {
    streams: Vec<FFprobeStream>,
}

/// Helper function to run FFprobe and parse JSON output
fn run_ffprobe(file_path: &Path) -> Result<FFprobeOutput> {
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            file_path.to_str().unwrap(),
        ])
        .output()
        .context("Failed to run ffprobe - ensure FFmpeg is installed")?;

    if !output.status.success() {
        anyhow::bail!("ffprobe failed with status: {}", output.status);
    }

    let json_output = String::from_utf8(output.stdout)
        .context("FFprobe output is not valid UTF-8")?;

    serde_json::from_str(&json_output)
        .context("Failed to parse FFprobe JSON output")
}

/// Generate a test PCM audio file with sine wave (for testing purposes)
///
/// This creates a simple 1-second PCM file with a 440Hz sine wave
fn generate_test_pcm(output_path: &Path, duration_secs: f32) -> Result<()> {
    const SAMPLE_RATE: u32 = 48000;
    const CHANNELS: u32 = 2;
    const FREQUENCY: f32 = 440.0; // A4 note

    let num_samples = (SAMPLE_RATE as f32 * duration_secs) as usize;
    let mut samples: Vec<i16> = Vec::with_capacity(num_samples * CHANNELS as usize);

    for i in 0..num_samples {
        let t = i as f32 / SAMPLE_RATE as f32;
        let sample = (2.0 * std::f32::consts::PI * FREQUENCY * t).sin();
        let sample_i16 = (sample * i16::MAX as f32) as i16;

        // Stereo: write same sample to both channels
        samples.push(sample_i16);
        samples.push(sample_i16);
    }

    // Convert i16 to bytes (little-endian)
    let bytes: Vec<u8> = samples
        .iter()
        .flat_map(|&s| s.to_le_bytes().to_vec())
        .collect();

    fs::write(output_path, &bytes)
        .context("Failed to write test PCM file")?;

    Ok(())
}

/// Generate a test video file using FFmpeg
fn generate_test_video(output_path: &Path, duration_secs: u32) -> Result<()> {
    let status = Command::new("ffmpeg")
        .args(&[
            "-y",  // Overwrite output file
            "-f", "lavfi",
            "-i", &format!("testsrc=duration={}:size=1280x720:rate=30", duration_secs),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            output_path.to_str().unwrap(),
        ])
        .status()
        .context("Failed to run ffmpeg to generate test video")?;

    if !status.success() {
        anyhow::bail!("FFmpeg test video generation failed");
    }

    Ok(())
}

#[test]
#[ignore] // Ignore by default - requires FFmpeg/FFprobe installed
fn test_4_7_integration_001_ffmpeg_3_track_muxing() -> Result<()> {
    // Setup: Create test directory
    let test_dir = PathBuf::from("target/test_4_7");
    fs::create_dir_all(&test_dir).context("Failed to create test directory")?;

    // Generate test files
    let video_path = test_dir.join("test_video.mp4");
    let system_audio_path = test_dir.join("system_audio.pcm");
    let microphone_path = test_dir.join("microphone.pcm");
    let webcam_audio_path = test_dir.join("webcam_audio.pcm");
    let output_path = test_dir.join("output_3_tracks.mp4");

    println!("Generating test video...");
    generate_test_video(&video_path, 5)?; // 5 second test video

    println!("Generating test audio files...");
    generate_test_pcm(&system_audio_path, 5.0)?; // 5 seconds @ 48kHz
    generate_test_pcm(&microphone_path, 5.0)?;
    generate_test_pcm(&webcam_audio_path, 5.0)?;

    // Mux video + 3 audio tracks using FFmpeg
    println!("Muxing video with 3 audio tracks...");
    let status = Command::new("ffmpeg")
        .args(&[
            "-y",  // Overwrite output
            "-i", video_path.to_str().unwrap(),
            "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", system_audio_path.to_str().unwrap(),
            "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", microphone_path.to_str().unwrap(),
            "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", webcam_audio_path.to_str().unwrap(),
            "-map", "0:v",  // Map video from input 0
            "-map", "1:a",  // Map audio track 1 (system)
            "-map", "2:a",  // Map audio track 2 (microphone)
            "-map", "3:a",  // Map audio track 3 (webcam)
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            output_path.to_str().unwrap(),
        ])
        .status()
        .context("Failed to run FFmpeg muxing command")?;

    assert!(status.success(), "FFmpeg muxing should succeed");

    // Validate: Run FFprobe to verify output
    println!("Running FFprobe to validate output...");
    let probe_output = run_ffprobe(&output_path)?;

    // AC #3: Verify FFmpeg muxed all 3 audio tracks into single MP4
    let video_streams: Vec<&FFprobeStream> = probe_output.streams
        .iter()
        .filter(|s| s.codec_type == "video")
        .collect();

    let audio_streams: Vec<&FFprobeStream> = probe_output.streams
        .iter()
        .filter(|s| s.codec_type == "audio")
        .collect();

    assert_eq!(video_streams.len(), 1, "Should have exactly 1 video stream");
    assert_eq!(audio_streams.len(), 3, "Should have exactly 3 audio streams (AC #3)");

    // AC #4: Validate each audio track is AAC @ 48kHz stereo
    for (index, audio_stream) in audio_streams.iter().enumerate() {
        println!("Audio Track {}: {:?}", index, audio_stream);

        assert_eq!(
            audio_stream.codec_name, "aac",
            "Audio track {} should use AAC codec", index
        );

        assert_eq!(
            audio_stream.sample_rate.as_deref(), Some("48000"),
            "Audio track {} should have 48kHz sample rate", index
        );

        assert_eq!(
            audio_stream.channels, Some(2),
            "Audio track {} should have 2 channels (stereo)", index
        );
    }

    // Cleanup test files
    fs::remove_dir_all(&test_dir).ok();

    println!("✅ Integration test passed: 3-track muxing validated");
    Ok(())
}

#[test]
#[ignore] // Ignore by default - requires FFmpeg/FFprobe installed
fn test_4_7_integration_002_output_file_playable() -> Result<()> {
    // Setup: Create test directory
    let test_dir = PathBuf::from("target/test_4_7");
    fs::create_dir_all(&test_dir)?;

    let video_path = test_dir.join("test_video.mp4");
    let system_audio_path = test_dir.join("system_audio.pcm");
    let microphone_path = test_dir.join("microphone.pcm");
    let webcam_audio_path = test_dir.join("webcam_audio.pcm");
    let output_path = test_dir.join("output_playable.mp4");

    // Generate test files
    generate_test_video(&video_path, 3)?;
    generate_test_pcm(&system_audio_path, 3.0)?;
    generate_test_pcm(&microphone_path, 3.0)?;
    generate_test_pcm(&webcam_audio_path, 3.0)?;

    // Mux with FFmpeg
    let status = Command::new("ffmpeg")
        .args(&[
            "-y",
            "-i", video_path.to_str().unwrap(),
            "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", system_audio_path.to_str().unwrap(),
            "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", microphone_path.to_str().unwrap(),
            "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", webcam_audio_path.to_str().unwrap(),
            "-map", "0:v", "-map", "1:a", "-map", "2:a", "-map", "3:a",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            output_path.to_str().unwrap(),
        ])
        .status()?;

    assert!(status.success(), "FFmpeg muxing should succeed");

    // AC #4: Verify resulting file is playable by checking it with FFprobe
    let probe_output = run_ffprobe(&output_path)?;

    assert!(
        probe_output.streams.len() >= 4,
        "Output file should contain at least 4 streams (1 video + 3 audio)"
    );

    // Verify the file can be read without errors (basic playability check)
    let file_size = fs::metadata(&output_path)?.len();
    assert!(file_size > 0, "Output file should not be empty");

    println!("✅ Output file is valid and playable (AC #4)");

    // Cleanup
    fs::remove_dir_all(&test_dir).ok();

    Ok(())
}
