# Composition Parity Validation Test Suite

## Overview

This test suite validates that timeline composition playback produces output that matches export output, ensuring users see accurate previews that match the final exported video.

**Story:** 5.7 - Composition Export Parity Validation
**Architecture:** ADR-008 Hybrid Smart Segment Pre-Rendering

## Test Approach

1. **Export Timeline** → Generate MP4 via `VideoExporter`
2. **Extract Frames** → Extract frames from export at specific timestamps
3. **Capture Playback** → Capture frames during playback via `CompositionRenderer`
4. **Compare Frames** → Pixel-by-pixel comparison with variance threshold
5. **Compare Audio** → Waveform comparison with sample-level accuracy

## Test Infrastructure

### Frame Comparison (`test_utils/frame_comparison.rs`)

- **Pixel-by-pixel diff calculation** using Euclidean distance in RGB space
- **Variance percentage** calculation (% of pixels that differ)
- **Visual diff generation** for debugging (highlights differences in red)
- **Configurable thresholds**:
  - Max variance: 5% (accounts for compression artifacts)
  - Pixel diff threshold: 10 (on 0-255 scale)

### Audio Comparison (`test_utils/audio_comparison.rs`)

- **Waveform extraction** from MP4 to WAV (16-bit PCM, 48kHz)
- **Sample-by-sample comparison** with amplitude difference calculation
- **RMS error** calculation across all samples
- **Configurable thresholds**:
  - Max variance: 1% (accounts for floating-point precision)
  - Sample diff threshold: 100 (on i16 scale)

### Timeline Fixtures (`test_utils/timeline_fixtures.rs`)

- **Single-track timeline** builder (3 consecutive clips)
- **Multi-track timeline** builder (2 video + 2 audio tracks)
- **Timeline with gaps** builder (clips with spacing)
- **JSON serialization** for test data persistence

## Running Tests

```bash
# Run all composition parity tests
cargo test --test composition_parity_tests

# Run specific test
cargo test --test composition_parity_tests test_frame_comparison_infrastructure

# Run with verbose output
cargo test --test composition_parity_tests -- --nocapture

# Run ignored tests (STUB tests waiting for CompositionRenderer)
cargo test --test composition_parity_tests -- --ignored
```

## Test Coverage

### Implemented Tests (6 passing)

1. **test_fixtures_exist** - Validates test video files exist
2. **test_frame_comparison_infrastructure** - Tests frame diff logic (AC #3, #6)
3. **test_audio_comparison_infrastructure** - Tests audio waveform comparison (AC #4)
4. **test_timeline_fixture_creation** - Tests timeline builders (AC #5, Subtask 4.1-4.3)
5. **test_timing_validation_infrastructure** - Tests timing capture (AC #7)
6. **test_known_parity_gaps_documented** - Validates documentation (AC #8)

### STUB Tests (5 ignored - waiting for CompositionRenderer)

1. **test_single_track_timeline_parity** - Single-track end-to-end validation (AC #1, #2, #5)
2. **test_multi_track_timeline_parity** - Multi-track validation (AC #5)
3. **test_timeline_with_gaps_parity** - Gap handling validation (AC #5)
4. **test_audio_mixing_parity** - Audio mixing validation (AC #4)
5. **test_timing_accuracy** - Timing accuracy within 33ms (AC #7)

## Acceptance Criteria Status

| AC | Requirement | Status | Notes |
|----|-------------|--------|-------|
| #1 | Test suite exports timeline to MP4 | ✅ Infrastructure ready | `VideoExporter` integration pending |
| #2 | Test suite captures playback frames | ✅ Infrastructure ready | `CompositionRenderer` integration pending |
| #3 | Frame comparison detects differences | ✅ Implemented | Pixel diff with visual debugging |
| #4 | Audio waveform comparison validates mixing | ✅ Implemented | Sample-level comparison, RMS error |
| #5 | Test runs on 3 timelines | ✅ Fixtures created | Single-track, multi-track, gaps |
| #6 | Differences < 5% pixel variance | ✅ Implemented | Configurable threshold, accounts for compression |
| #7 | Timing accuracy within 33ms | ✅ Infrastructure ready | Timestamp capture validated |
| #8 | Documentation: known parity gaps | ✅ Documented | See "Known Parity Gaps" below |

## Test Fixtures

### Video Files

Located in `tests/fixtures/`:

- **test_video_1.mp4** - 5s, 1280x720, 30fps, H.264, AAC (440Hz sine wave)
- **test_video_2.mp4** - 5s, 1280x720, 30fps, H.264, AAC (880Hz sine wave)
- **test_video_3.mp4** - 5s, 1280x720, 30fps, H.264, AAC (220Hz sine wave)

Generated via FFmpeg `testsrc` filter with different audio frequencies for distinguishability.

### Timeline JSON Files

Generated during tests in `tests/outputs/`:

- **single_track_timeline.json** - 3 clips, 15s total
- **multi_track_timeline.json** - 2 video + 2 audio tracks
- **timeline_with_gaps.json** - 3 clips with 2s gaps

## Test Outputs

All test outputs are generated in `tests/outputs/`:

```
outputs/
├── frames/              # Extracted frames from video files
├── diffs/               # Visual diff images (red highlights)
├── *.wav                # Extracted audio waveforms
├── *.mp4                # Exported timeline videos
└── *.json               # Timeline fixture files
```

**Note:** Test outputs are gitignored and regenerated on each test run.

## Known Parity Gaps

These are **expected differences** between playback and export, documented per AC #8:

### 1. Compression Artifacts

- **Cause:** Export uses H.264 CRF 23, playback cache uses ultrafast preset
- **Impact:** Minor pixel differences in high-motion scenes
- **Acceptable:** <5% variance threshold accounts for this

### 2. Codec Differences

- **Cause:** Color space conversion differences (yuv420p vs yuvj420p)
- **Impact:** Color values may differ by 1-2 levels
- **Mitigation:** Normalize color space in comparison

### 3. Audio Mixing Precision

- **Cause:** Floating-point math differences between FFmpeg and MPV
- **Impact:** Audio samples may differ by ±1 sample value
- **Acceptable:** <1% waveform variance

### 4. Seek Precision

- **Cause:** MPV seeks to nearest keyframe, export timestamps are exact
- **Impact:** Up to 33ms timing variance (2 frames at 30fps)
- **Expected:** Documented in ADR-008

## Integration with CompositionRenderer

Once `CompositionRenderer` is implemented (Stories 5.2-5.6), the STUB tests will be updated to:

1. Create `CompositionRenderer` instance
2. Load timeline into renderer
3. Seek to specific timestamps
4. Capture frames using renderer's frame capture API
5. Compare captured frames with export frames
6. Validate variance is within acceptable thresholds

Example integration:

```rust
use clippy_lib::services::composition_renderer::CompositionRenderer;

#[test]
fn test_single_track_timeline_parity() -> Result<()> {
    let timeline = create_single_track_timeline(...);

    // Export timeline
    let mut exporter = VideoExporter::new();
    exporter.export_timeline(&timeline, &config)?;

    // Capture playback frames
    let mut renderer = CompositionRenderer::new();
    renderer.load_timeline(&timeline)?;

    let playback_frame1 = renderer.capture_frame_at(0)?;
    let playback_frame2 = renderer.capture_frame_at(5000)?;

    // Extract export frames
    let export_frame1 = extract_frame_from_video(&export_path, 0, ...)?;
    let export_frame2 = extract_frame_from_video(&export_path, 5000, ...)?;

    // Compare with <5% variance
    let result1 = compare_frames(&export_frame1, &playback_frame1, &config)?;
    assert!(result1.is_match, "Frame 1 variance: {:.2}%", result1.variance_percentage);

    Ok(())
}
```

## Troubleshooting

### Test Video Fixtures Not Found

Regenerate fixtures:

```bash
cd src-tauri/tests/fixtures
ffmpeg -y -f lavfi -i testsrc=duration=5:size=1280x720:rate=30 \
       -f lavfi -i sine=frequency=440:duration=5 \
       -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p \
       -c:a aac -b:a 128k test_video_1.mp4
```

### Frame Comparison Fails with High Variance

- Check if videos are identical (same source file)
- Verify timestamps are correct (milliseconds)
- Inspect visual diff image in `tests/outputs/diffs/`
- Adjust `pixel_diff_threshold` if needed

### Audio Comparison Fails

- Verify audio was extracted correctly (check WAV file)
- Ensure sample rates match (48kHz)
- Check `sample_interval` in config (default: 1 = every sample)
- Use higher threshold for low-bitrate audio

### FFmpeg Command Fails

Ensure FFmpeg is installed and in PATH:

```bash
ffmpeg -version
```

## CI/CD Integration

Tests run automatically via `cargo test`:

```yaml
# .github/workflows/test.yml
- name: Run composition parity tests
  run: cargo test --test composition_parity_tests
```

**Note:** STUB tests are ignored by default. Enable with `--ignored` flag once CompositionRenderer is available.

## Future Enhancements

1. **Perceptual hashing** - Use SSIM/PSNR for more robust frame comparison
2. **Benchmark suite** - Track parity variance trends over time
3. **Multi-resolution tests** - Test at 720p, 1080p, 4K
4. **Codec variation tests** - Test H.264, H.265, VP9
5. **Audio format tests** - Test AAC, Opus, MP3
6. **Edge case timelines** - Very short clips (<1s), very long (>1hr), mixed frame rates

## References

- [Story 5.7 Documentation](../../../docs/stories/5-7-composition-export-parity-validation.md)
- [ADR-008: Composition Playback Architecture](../../../docs/architecture.md#adr-008)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [Image Crate Documentation](https://docs.rs/image/)
- [Hound Crate Documentation](https://docs.rs/hound/)
