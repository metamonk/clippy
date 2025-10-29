# Story 4.7: Independent Audio Track Management in PiP Recording

Status: in-progress

## Story

As a user,
I want system audio, microphone, and webcam audio recorded as separate tracks during PiP recording,
So that I can adjust levels independently during editing.

## Acceptance Criteria

1. PiP recording captures three independent audio tracks: system, microphone, webcam mic
2. All audio tracks synchronized with composited video
3. FFmpeg muxes all three audio tracks into single MP4
4. Resulting file playable with all audio tracks accessible
5. Timeline editor displays all three audio tracks for recorded PiP clip
6. User can mute/adjust volume on each track independently during editing

## Tasks / Subtasks

- [x] Task 1: Extend FFmpeg multi-audio muxing to support 3 audio tracks (AC: #1, #3)
  - [x] Subtask 1.1: Created `AudioInputConfig` struct with pcm_path, sample_rate, channels, label
  - [x] Subtask 1.2: Implemented `finalize_with_audio()` function supporting 1-3 audio tracks
  - [x] Subtask 1.3: FFmpeg command maps N audio inputs: -map 0:v -map 1:a -map 2:a (up to 3)
  - [ ] Subtask 1.4: Test with FFprobe to verify 3 AAC audio tracks in output MP4
  - [ ] Subtask 1.5: Write unit tests for 3-track muxing scenario

- [x] Task 2: Implement webcam audio capture configuration (AC: #1, #2)
  - [x] Subtask 2.1: Added `enable_webcam_audio` flag to RecordingConfig
  - [x] Subtask 2.2: Added `webcam_audio_capture: Option<AudioCapture>` to RecordingOrchestrator
  - [x] Subtask 2.3: Initialize webcam AudioCapture in orchestrator constructor
  - [x] Subtask 2.4: Design confirmed - use CPAL for 3rd audio device (webcam mic as selectable input)
  - [x] Subtask 2.5: No Camera service changes needed - audio handled via existing AudioCapture

- [x] Task 3: Update RecordingOrchestrator for 3-stream audio coordination (AC: #1, #2)
  - [x] Subtask 3.1: Added webcam audio channel in `start_recording()`
  - [x] Subtask 3.2: Added webcam audio channel in `start_pip_recording()`
  - [x] Subtask 3.3: Start webcam audio capture in both methods
  - [x] Subtask 3.4: Added third tokio::select branch for webcam audio in `start_recording()`
  - [ ] Subtask 3.5: Add third tokio::select branch for webcam audio in `start_pip_recording()`
  - [ ] Subtask 3.6: Update `stop_recording()` to stop webcam_audio_capture
  - [ ] Subtask 3.7: Implement PCM file writing for all 3 audio streams
  - [ ] Subtask 3.8: Call `finalize_with_audio()` with all 3 PCM files
  - [ ] Subtask 3.9: Write unit test for 3-audio-track orchestration

- [ ] Task 4: Timeline editor multi-track audio display (AC: #5)
  - [ ] Subtask 4.1: Review timeline data model for multi-audio track support
  - [ ] Subtask 4.2: Create `AudioTrack` struct in Rust (track_index, label, volume, muted)
  - [ ] Subtask 4.3: Create `AudioTrack` interface in TypeScript
  - [ ] Subtask 4.4: Add optional `audio_tracks: Option<Vec<AudioTrack>>` to Rust Clip struct
  - [ ] Subtask 4.5: Add optional `audioTracks?: AudioTrack[]` to TypeScript Clip interface
  - [ ] Subtask 4.6: Write Rust unit tests for audio track serialization
  - [ ] Subtask 4.7: Write TypeScript tests for AudioTrack type
  - [ ] Subtask 4.8: UI component updates deferred (can be added when needed)

- [ ] Task 5: Per-track volume control and mute functionality (AC: #6)
  - [ ] Subtask 5.1: Backend support provided via AudioTrack fields (volume & muted)
  - [ ] Subtask 5.2: Timeline type definitions include per-track volume/mute (part of Task 4)
  - [ ] Subtask 5.3: UI component implementation deferred (data model ready after Task 4)
  - [ ] Subtask 5.4: Future work: Add UI controls in timeline editor when needed
  - [ ] Subtask 5.5: Future work: Exporter integration for per-track audio processing

- [ ] Task 6: Integration testing and validation (AC: #1-6)
  - [ ] Subtask 6.1: Write unit test: test_4_7_unit_001 - FFmpeg 3-track muxing
  - [ ] Subtask 6.2: Write unit test: test_4_7_unit_002 - RecordingOrchestrator with 3 audio captures
  - [ ] Subtask 6.3: Write unit test: test_4_7_unit_003 - AudioTrack serialization
  - [ ] Subtask 6.4: Write unit test: test_4_7_unit_004 - Backward compatibility
  - [ ] Subtask 6.5: Run all tests and verify they pass
  - [ ] Subtask 6.6: End-to-end testing deferred to integration test suite

## Dev Notes

### Architecture Context

**From architecture.md:**
- Epic 4 Story 4.7 builds on Story 4.6's simultaneous screen + webcam recording
- Story 2.4 established 2-audio-track architecture (system + microphone)
- Novel Pattern 1 (Multi-Stream Recording) must be extended to 4 parallel streams:
  - Screen video (ScreenCaptureKit)
  - Webcam video (nokhwa)
  - System audio (ScreenCaptureKit audio APIs)
  - Microphone audio (CPAL)
  - **NEW:** Webcam audio (nokhwa + AVFoundation)

**Key Integration Points:**
- `RecordingOrchestrator` coordinates 5 streams total (2 video + 3 audio)
- `FrameSynchronizer` synchronizes all streams with <50ms tolerance
- `FFmpegCompositor` muxes 2 video streams (with overlay) + 3 audio tracks
- Timeline data model must support `Clip.audioTracks` array for multi-track clips

**Performance Considerations:**
- 3 bounded audio channels (30-sample buffer each) = ~33KB memory overhead
- PCM file storage: 5 min @ 48kHz stereo = ~115MB per track × 3 tracks = 345MB temp storage
- Disk space check from Story 2.4 (500MB minimum) is sufficient for 3-track scenario

**Dependencies:**
- **Story 4.6 (Simultaneous Screen + Webcam Recording):** MUST be completed first
  - Provides PiP composition architecture (FFmpeg overlay filter)
  - Establishes 2-video-stream orchestration
  - Provides RecordingConfig with PiP position/size settings
- **Story 2.4 (System Audio and Microphone Capture):** Completed
  - Provides 2-audio-track muxing foundation (`finalize_with_audio()`)
  - Establishes audio synchronization patterns in `FrameSynchronizer`
- **Story 3.9 (Per-Clip Volume Control):** Completed
  - Provides volume control UI patterns
  - Establishes FFmpeg volume filter integration during export
- **Epic 3 Timeline Architecture:** In progress
  - Story 3.1-3.10 establish multi-track timeline foundation
  - Clip data model must support multiple audio tracks

### Project Structure Notes

**Files to Create:**
- None (all components already exist from dependencies)

**Files to Modify:**

**Backend (Rust):**
- `src-tauri/src/services/camera/nokhwa_wrapper.rs` - Add audio capture capability
- `src-tauri/src/services/recording/orchestrator.rs` - Add 3rd audio stream coordination
- `src-tauri/src/services/recording/frame_synchronizer.rs` - Extend for webcam audio sync
- `src-tauri/src/services/ffmpeg/encoder.rs` - Support 3-audio-track muxing
- `src-tauri/src/services/ffmpeg/mod.rs` - Export updated AudioInputConfig
- `src-tauri/src/models/timeline.rs` - Add `audio_tracks` field to Clip struct

**Frontend (TypeScript):**
- `src/types/timeline.ts` - Add `audioTracks` field to Clip interface
- `src/types/media.ts` - Add `audioTrackCount` to MediaFile interface
- `src/components/timeline/TimelineClip.tsx` - Display multi-audio track indicators
- `src/components/timeline/ClipVolumeControl.tsx` - Add per-track selection dropdown
- `src/stores/timelineStore.ts` - Add `audioTrackSettings` per clip
- `src/stores/mediaLibraryStore.ts` - Parse audio track count during import

**Alignment with unified project structure:**
- Services layer: `services/camera/`, `services/recording/`, `services/ffmpeg/`
- Models layer: `models/timeline.rs`
- Component layer: `components/timeline/`
- Store layer: `stores/timelineStore.ts`, `stores/mediaLibraryStore.ts`

### Testing Strategy

**From architecture.md testing patterns:**

**Rust Unit Tests:**
- Test webcam audio capture initialization and stream handling
- Test 3-audio-track muxing in `encoder.rs` (extend Story 2.4 tests)
- Test orchestrator with 3 audio channels (extend Story 2.4 tests)
- Test frame synchronizer with 3 audio streams (extend Story 2.4 tests)
- Test Clip struct serialization with audio_tracks field

**Frontend Tests (Vitest):**
- Test TimelineClip renders 3-audio-track indicators
- Test ClipVolumeControl shows track selection dropdown
- Test timelineStore audioTrackSettings updates
- Test mediaLibraryStore parses audio track count
- Test track mute/volume controls update state correctly

**Integration Tests:**
- Record 30-second PiP video with system audio + microphone + webcam audio
- Verify FFprobe output shows 3 AAC audio tracks at 48kHz stereo
- Measure audio/video sync accuracy (<50ms tolerance) for all 3 tracks
- Test all track combinations (enable/disable each independently)

**E2E Tests (Playwright):**
- Full workflow: Start PiP recording → Enable all audio sources → Stop → Import to timeline → Display 3 tracks → Mute/adjust volume per track → Export with track-specific settings
- Validate exported MP4 has correct track volumes applied

### References

- [Source: docs/PRD.md#FR004] - Simultaneous screen and webcam recording with independent audio tracks
- [Source: docs/architecture.md#Novel Pattern Designs] - Multi-stream recording orchestration (Pattern 1)
- [Source: docs/epics.md#Story 4.7] - Complete acceptance criteria
- [Source: docs/architecture.md#Technology Stack Details] - nokhwa 0.10.9 with input-avfoundation
- [Source: docs/tech-spec-epic-2.md] - Audio capture architecture from Epic 2
- [Source: docs/stories/2-4-system-audio-and-microphone-capture.md] - 2-audio-track implementation reference
- [Source: docs/stories/3-9-per-clip-volume-control.md] - Volume control UI patterns (when available)
- [Source: docs/stories/4-6-simultaneous-screen-webcam-recording.md] - PiP recording foundation (when available)

## Dev Agent Record

### Context Reference

- docs/stories/4-7-independent-audio-track-management-in-pip-recording.context.xml

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Implementation History

**Session 1 (2025-10-29): Discovery & Initial Implementation**

**Discovery Phase:**
- Verified story claims by checking actual code implementation
- Found ALL tasks marked complete [x] but ZERO code actually implemented
- Story file status: "ready-for-review" (incorrect)
- Sprint status: "backlog" (correct - story not started)
- Conclusion: Story 4.7 was falsely marked complete, needed full implementation from scratch

**Implementation Phase (40% Complete):**

✅ **Task 1: FFmpeg Multi-Audio Muxing (COMPLETE)**
- Created `AudioInputConfig` struct with fields: pcm_path, sample_rate, channels, label
- Implemented `finalize_with_audio()` static method on FFmpegEncoder
- Supports 1-3 audio tracks with dynamic FFmpeg mapping: -map 0:v -map 1:a -map 2:a ...
- Each audio track encoded to AAC 192kbps
- Exported AudioInputConfig from ffmpeg module
- Location: src-tauri/src/services/ffmpeg/encoder.rs:324-459

✅ **Task 2: Webcam Audio Configuration (COMPLETE)**
- Added `enable_webcam_audio: bool` to RecordingConfig struct
- Added field to RecordingConfig::default()
- Added `webcam_audio_capture: Option<AudioCapture>` to RecordingOrchestrator struct
- Initialize webcam AudioCapture when enabled in constructor
- Location: src-tauri/src/services/recording/orchestrator.rs:48-185

✅ **Task 3: RecordingOrchestrator 3-Stream Audio (75% COMPLETE)**
- ✅ Added webcam audio channel in `start_recording()` (line 241-246)
- ✅ Added webcam audio capture startup in `start_recording()` (line 267-274)
- ✅ Added third tokio::select branch for webcam audio in `start_recording()` (line 370-396)
- ✅ Added webcam audio channel in `start_pip_recording()` (line 521-526)
- ✅ Added webcam audio capture startup in `start_pip_recording()` (line 553-561)
- ⚠️ **TODO:** Add third tokio::select branch in `start_pip_recording()` (similar to line 370-396)
- ⚠️ **TODO:** Update `stop_recording()` to stop webcam_audio_capture
- ⚠️ **TODO:** Implement PCM file writing for audio samples (currently just synchronized, not saved)
- ⚠️ **TODO:** Call `finalize_with_audio()` after encoding completes with all PCM files

❌ **Task 4: Timeline Data Models (NOT STARTED)**
- Need to create AudioTrack struct in Rust (src-tauri/src/models/timeline.rs)
- Need to create AudioTrack interface in TypeScript (src/types/timeline.ts)
- Need to add `audio_tracks: Option<Vec<AudioTrack>>` to Clip struct
- Need to add `audioTracks?: AudioTrack[]` to Clip interface

❌ **Task 5: Per-Track Volume Control (BLOCKED BY TASK 4)**
- Backend will be ready once Task 4 data models are created
- AudioTrack will have volume & muted fields

❌ **Task 6: Unit Tests (NOT STARTED)**
- No tests written yet
- Need 4 unit tests as specified in story

**Code Compilation Status:**
- ✅ Rust code compiles successfully
- ⚠️ 2 warnings about unused variables (webcam_audio_rx in pip_recording - expected, will be used when select branch added)
- ❌ 1 unrelated error in screencapturekit.rs (emit_all → emit method name)

**Design Decisions:**
- Nokhwa library does NOT support audio capture (video-only)
- Using CPAL/AudioCapture for all 3 audio sources (system via SCKit, microphone via CPAL, webcam mic via CPAL as 3rd device)
- Audio muxing strategy: Write to temporary PCM files, post-process mux with video
- Backward compatibility: audioTracks will be optional field on Clip

### File List

**Modified (This Session):**
- src-tauri/src/services/ffmpeg/encoder.rs (Added finalize_with_audio + AudioInputConfig)
- src-tauri/src/services/ffmpeg/mod.rs (Exported AudioInputConfig)
- src-tauri/src/services/recording/orchestrator.rs (Added webcam audio support)

**Not Yet Modified (Need Work):**
- src-tauri/src/models/timeline.rs (Need to add AudioTrack struct)
- src/types/timeline.ts (Need to add AudioTrack interface)

### Next Steps

To complete Story 4.7, the following work remains:

1. **Complete Task 3 (RecordingOrchestrator):**
   - Add third tokio::select branch in start_pip_recording()
   - Update stop_recording() to stop webcam_audio_capture
   - Implement PCM file writing for all 3 audio streams
   - Call finalize_with_audio() with all 3 PCM paths

2. **Complete Task 4 (Timeline Data Models):**
   - Create AudioTrack struct/interface
   - Add audio_tracks field to Clip
   - Write serialization tests

3. **Complete Task 6 (Unit Tests):**
   - test_4_7_unit_001: FFmpeg 3-track muxing
   - test_4_7_unit_002: RecordingOrchestrator setup
   - test_4_7_unit_003: AudioTrack serialization
   - test_4_7_unit_004: Backward compatibility

4. **Validation:**
   - Run cargo test to verify all tests pass
   - Fix emit_all compilation error in screencapturekit.rs
   - Test actual recording with 3 audio sources
