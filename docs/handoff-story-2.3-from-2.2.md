# Handoff: Story 2.2 → Story 2.3

**From:** Story 2.2 (Full-Screen Recording with Video Capture)
**To:** Story 2.3 (Real-Time FFmpeg Encoding During Recording)
**Date:** 2025-10-28
**Handoff By:** Dev Agent (Amelia)

---

## Executive Summary

Story 2.2 has implemented **90% of real ScreenCaptureKit integration**, including the complete delegate architecture and frame capture pipeline. Six mechanical API compatibility fixes are needed for compilation, then Story 2.3 can proceed with FFmpeg encoding integration.

**Critical:** Story 2.3 should complete the ScreenCaptureKit API fixes **before** implementing FFmpeg encoding, ensuring end-to-end validation with real screen frames.

---

## What Was Completed in Story 2.2

### ✅ Architecture & Data Flow (100%)

1. **VideoStreamOutput Delegate**
   - File: `src-tauri/src/services/screen_capture/screencapturekit.rs:84-156`
   - Implements `SCStreamOutputTrait` for frame callbacks
   - Extracts BGRA pixels from `CMSampleBuffer` → `CVPixelBuffer`
   - Sends `TimestampedFrame` through bounded channel (30 frame buffer)
   - Handles backpressure per Architecture Pattern 2

2. **SCStream Configuration**
   - File: `src-tauri/src/services/screen_capture/screencapturekit.rs:426-549`
   - Initializes `SCShareableContent` to get displays
   - Creates `SCContentFilter` for full-screen capture
   - Configures 30 FPS, BGRA pixel format, cursor visibility
   - Attaches delegate and manages capture lifecycle

3. **Integration Points**
   - `cmd_start_screen_recording` calls `ScreenCapture::start_continuous_capture()`
   - Frame channel: `mpsc::Sender<TimestampedFrame>` → FFmpeg encoder (Story 2.3)
   - Bounded channel prevents memory bloat during long recordings
   - Stop mechanism: channel close triggers graceful shutdown

4. **Dependencies Added**
   ```toml
   screencapturekit = "0.3"
   core-media-rs = "0.3.5"
   core-video-rs = "0.3.5"
   ```

### ⚠️ Remaining: 6 API Compatibility Fixes

**Status:** Architecture correct, syntax needs adjustment for `screencapturekit 0.3` API

**Complete Documentation:** `docs/implementation-notes-story-2.2-screencapturekit.md`

**Issues:**
1. Pixel format constant import path
2. CMTimeFlags import path
3. `get_image_buffer()` returns `Result`, not `Option`
4. `set_minimum_frame_interval()` takes `&CMTime` reference
5. `SCStream::new()` takes 2 args, not 3
6. `CVPixelBuffer` method names verification

**Estimated Time:** 30-45 minutes (mechanical fixes, not design work)

---

## Critical Path for Story 2.3

### Phase 1: Complete Story 2.2 ScreenCaptureKit Integration (First!)

**Why First:** Story 2.3 requires **real BGRA frames** from ScreenCaptureKit to validate FFmpeg encoding. Simulated frames won't test the actual pipeline.

**Tasks:**

1. **Fix API Compatibility Issues** (Est. 30-45 min)
   - Follow `docs/implementation-notes-story-2.2-screencapturekit.md` Section "Remaining API Compatibility Issues"
   - Use `cargo check` to validate each fix
   - Reference local docs: `cargo doc --open --package core-video-rs`

2. **Verify Compilation** (Est. 5 min)
   ```bash
   cd src-tauri
   cargo build
   ```

3. **Manual Test: Real Screen Capture** (Est. 10 min)
   - Launch app: `npm run tauri dev`
   - Click "Record Screen" button
   - **Expected:** macOS orange menu bar indicator appears
   - **Expected:** Recording creates file in `~/Documents/clippy/recordings/`
   - **Expected:** Frames are non-zero (real screen content, not black)

4. **Update Story 2.2 Status** (Est. 5 min)
   - Mark ScreenCaptureKit implementation 100% complete
   - Update `docs/stories/2-2-full-screen-recording-with-video-capture.md`
   - Change Status: review → done

**Total Estimate: 1 hour**

---

### Phase 2: Implement Story 2.3 FFmpeg Encoding

Once Phase 1 is complete and real frames are flowing:

1. **FFmpeg Encoder Service**
   - File: `src-tauri/src/services/ffmpeg/encoder.rs`
   - Read frames from `frame_rx: mpsc::Receiver<TimestampedFrame>`
   - Pipe BGRA data to FFmpeg stdin
   - Convert to H.264 MP4 in real-time
   - Output: `~/Documents/clippy/recordings/recording-{uuid}.mp4`

2. **Integration Points**
   ```rust
   // In cmd_start_screen_recording:
   let (frame_tx, frame_rx) = mpsc::channel(30);

   // Start ScreenCapture (Phase 1 completed)
   let capture_handle = screen_capture.start_continuous_capture(frame_tx, None)?;

   // Start FFmpeg encoder (Phase 2 - Story 2.3)
   let encoder_handle = ffmpeg_encoder.encode_stream(frame_rx)?;
   ```

3. **Validation**
   - Record 30 seconds of real screen content
   - Verify MP4 output plays in VLC/QuickTime
   - Verify file size reasonable (~5-10 MB for 30s at 1080p)
   - Verify frame rate = 30 FPS
   - Verify no dropped frames (check FFmpeg logs)

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Story 2.2: ScreenCaptureKit → Bounded Channel                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [SCStream]                                                      │
│       │                                                          │
│       ├──> VideoStreamOutput::did_output_sample_buffer()        │
│       │         │                                                │
│       │         ├──> Extract CMSampleBuffer → CVPixelBuffer     │
│       │         ├──> Convert to BGRA bytes                      │
│       │         ├──> Create TimestampedFrame                    │
│       │         └──> frame_tx.send(frame) ──────────────┐       │
│       │                                                  │       │
│       │                              [Bounded Channel]  │       │
│       │                              (30 frame buffer)  │       │
│       │                                                  │       │
│       └─────────────────────────────────────────────────┼───────┤
│                                                          │       │
└──────────────────────────────────────────────────────────┼───────┘
                                                           │
                                                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Story 2.3: Real-Time FFmpeg Encoding                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│       ┌──────────────── frame_rx.recv() <────────────┘          │
│       │                                                          │
│       ▼                                                          │
│  [FFmpeg Process]                                                │
│       │                                                          │
│       ├──> stdin: BGRA frame data                               │
│       ├──> -f rawvideo -pix_fmt bgra                            │
│       ├──> -s {width}x{height}                                  │
│       ├──> -r 30                                                 │
│       │                                                          │
│       └──> stdout: H.264 MP4 stream                             │
│                │                                                 │
│                └──> Write to file:                              │
│                     ~/Documents/clippy/recordings/{uuid}.mp4    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files to Focus On (Story 2.3)

### Phase 1 (Complete Story 2.2):
- `src-tauri/src/services/screen_capture/screencapturekit.rs` (API fixes)
- `docs/implementation-notes-story-2.2-screencapturekit.md` (reference)

### Phase 2 (Story 2.3 Implementation):
- `src-tauri/src/services/ffmpeg/encoder.rs` (new - create FFmpeg encoder)
- `src-tauri/src/commands/recording.rs` (modify - integrate encoder with capture)
- `docs/stories/2-3-real-time-ffmpeg-encoding-during-recording.md` (story file)

---

## Risk Mitigation

### Risk: Story 2.3 Starts Without Story 2.2 Completion

**Impact:**
- FFmpeg receives simulated frames (all zeros)
- Can't validate real screen → encoding pipeline
- May miss pixel format incompatibilities
- Wastes time testing with fake data

**Mitigation:**
- **MUST complete Phase 1 first** (1 hour investment)
- Verify real frames flowing with manual test
- Only then proceed to FFmpeg integration

### Risk: API Fixes Take Longer Than Expected

**Mitigation:**
- Detailed documentation provided in `implementation-notes-story-2.2-screencapturekit.md`
- Each fix is mechanical (not architectural)
- Fallback: Consult `scap` library example (working reference)
- Worst case: 2-3 hours vs. 1 hour estimate

---

## Testing Strategy

### Phase 1 Testing (Story 2.2 Complete):
```bash
# Compile check
cargo build

# Unit tests (existing)
cargo test --package clippy --lib services::screen_capture

# Manual integration test
npm run tauri dev
# → Click "Record Screen"
# → Verify orange menu bar dot (macOS)
# → Stop recording after 5 seconds
# → Check file exists: ~/Documents/clippy/recordings/
# → File should be ~1-2 GB raw BGRA (5s × 30fps × 1920×1080×4)
```

### Phase 2 Testing (Story 2.3):
```bash
# Same as Phase 1, but:
# → File should be ~2-5 MB encoded MP4 (5s at 1080p)
# → Open in VLC: should show real screen content
# → Verify 30 FPS: ffprobe recording-{uuid}.mp4
```

---

## Success Criteria

### Phase 1 Complete When:
- ✅ `cargo build` succeeds with no errors
- ✅ Manual test shows real screen capture (not black frames)
- ✅ macOS system indicator (orange dot) appears during recording
- ✅ Story 2.2 marked "done"

### Phase 2 (Story 2.3) Complete When:
- ✅ Recording creates MP4 file (not raw .raw file)
- ✅ MP4 plays real screen content in VLC
- ✅ File size reasonable for duration
- ✅ 30 FPS maintained
- ✅ All Story 2.3 ACs satisfied

---

## Questions? Blockers?

**Implementation Questions:**
- Reference: `docs/implementation-notes-story-2.2-screencapturekit.md`
- Working example: https://github.com/CapSoftware/scap/blob/main/src/capturer/engine/mac/mod.rs

**API Questions:**
- Local docs: `cargo doc --open --package screencapturekit`
- Crate source: `~/.cargo/registry/src/.../screencapturekit-0.3.6/`

**Architecture Questions:**
- Review: `docs/architecture.md` → Pattern 2 (Real-Time Encoding)
- Review: Senior Dev Review in Story 2.2 file (line 244+)

---

## Next Agent: Start Here

**Immediate Action:**

1. Read `docs/implementation-notes-story-2.2-screencapturekit.md` (5 min)
2. Run `cargo check` to see current errors (1 min)
3. Fix 6 API issues following documentation (30-45 min)
4. Run manual test to verify real capture (10 min)
5. **THEN** begin Story 2.3 FFmpeg integration

**Don't Skip Phase 1!** Story 2.3 depends on real frames for validation.

---

**Handoff Complete.** Good luck with Story 2.3! 🚀
