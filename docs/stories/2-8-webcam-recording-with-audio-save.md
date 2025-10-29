# Story 2.8: Webcam Recording with Audio & Save

Status: ready-for-dev

## Story

As a user,
I want to record webcam video with microphone audio and save it,
So that I can create standalone webcam recordings.

## Acceptance Criteria

1. Webcam recording captures both video and microphone audio
2. FFmpeg encodes webcam stream to MP4 in real-time (same pattern as Story 2.3)
3. Recording controls work same as screen recording (start/stop/pause)
4. Completed webcam recording auto-imports to media library (same as Story 2.6)
5. Can preview webcam recording in video player (Epic 1 MPV player)
6. Recording quality acceptable (smooth 30 FPS, synchronized audio)

## Tasks / Subtasks

- [ ] Implement webcam + microphone recording (AC: #1)
  - [ ] Integrate webcam video capture from Story 2.7 with audio capture from Story 2.4
  - [ ] Configure nokhwa to capture video frames from selected camera
  - [ ] Configure cpal/CoreAudio to capture microphone audio
  - [ ] Ensure camera and microphone permissions are requested/checked (leveraging Story 2.7 patterns)

- [ ] Real-time FFmpeg encoding for webcam stream (AC: #2)
  - [ ] Reuse FFmpeg encoding pattern from Story 2.3 (real-time encoding via stdin)
  - [ ] Configure bounded channel (30 frame buffer) for webcam frames
  - [ ] Create separate bounded channel for microphone audio samples
  - [ ] Set up FFmpeg command for webcam resolution (1080p or native), H.264 codec, AAC audio
  - [ ] Stream video frames and audio samples to FFmpeg stdin pipes
  - [ ] Monitor encoding progress and memory usage (ensure stable <500MB total)

- [ ] Implement recording controls for webcam mode (AC: #3)
  - [ ] Add `cmd_start_camera_recording` Tauri command (mirrors `cmd_start_recording` from Story 2.2)
  - [ ] Implement start recording: spawn capture threads, start FFmpeg encoder
  - [ ] Implement stop recording: gracefully stop capture, finalize FFmpeg encoding, return output path
  - [ ] Implement pause/resume: pause capture threads, maintain FFmpeg process, resume on command
  - [ ] Add recording state management in `recordingStore` (reuse patterns from Story 2.5)
  - [ ] Update `RecordingPanel.tsx` to handle webcam mode controls

- [ ] Auto-import recorded webcam videos (AC: #4)
  - [ ] Trigger auto-import when `cmd_stop_camera_recording` completes
  - [ ] Reuse auto-import logic from Story 2.6 (thumbnail generation, metadata extraction)
  - [ ] Generate thumbnail from first frame via FFmpeg
  - [ ] Extract metadata (duration, resolution, file size, codec) via ffprobe
  - [ ] Add MediaFile entry to mediaLibraryStore
  - [ ] Emit Tauri event 'recording-imported' to update frontend
  - [ ] Display success toast notification

- [ ] Validate playback and recording quality (AC: #5, #6)
  - [ ] Test recorded webcam MP4 plays correctly in Epic 1 MPV player
  - [ ] Verify video framerate is smooth 30 FPS without dropped frames
  - [ ] Verify audio-video synchronization (within 50ms drift tolerance from AC 2.3.7)
  - [ ] Test recording durations: 30 seconds, 5 minutes, 15 minutes
  - [ ] Monitor memory usage during recording (should remain <500MB)
  - [ ] Test pause/resume functionality maintains quality

- [ ] Error handling and edge cases
  - [ ] Handle camera disconnection during recording (save partial file, notify user)
  - [ ] Handle microphone failure (continue video-only, notify user)
  - [ ] Handle disk space exhaustion (graceful stop with notification from Story 2.5 patterns)
  - [ ] Handle FFmpeg encoding failure (save partial file if possible, clear error message)
  - [ ] Validate permissions before starting recording (camera + microphone)

- [ ] Testing (AC: All)
  - [ ] Unit tests: Verify RecordingConfig serialization for camera mode
  - [ ] Integration tests: Start webcam recording → Stop → Verify MP4 file exists and playable
  - [ ] Integration tests: Record 5 minutes → Verify memory stable, file size reasonable (~25-50MB)
  - [ ] Integration tests: Pause/Resume → Verify continuous playback without artifacts
  - [ ] E2E tests: Record webcam → Auto-import → Verify appears in media library within 2 seconds
  - [ ] E2E tests: Recorded webcam clip → Play in VideoPlayer → Verify smooth playback
  - [ ] Manual test: Record talking head video → Listen for audio quality, verify lip sync

## Dev Notes

- Relevant architecture patterns and constraints
- Source tree components to touch
- Testing standards summary

### Architecture Patterns (from architecture.md)

**Real-Time Encoding Pattern (Novel Pattern 2, lines 501-560):**
- Bounded channel `mpsc::channel(30)` for 1 second frame buffer
- Backpressure prevents memory bloat if encoding lags
- FFmpeg accepts raw frames via stdin pipe (no intermediate files)
- Memory guarantee: 30 frames × 8MB/frame @ 1080p BGRA = 240MB max

**Multi-Stream Recording Orchestration (Novel Pattern 1):**
- While this story focuses on single webcam stream, it sets foundation for Epic 4 PiP
- Use parallel Tokio tasks for video capture and audio capture
- Frame synchronization via nanosecond timestamps
- FFmpeg muxes video + audio into single MP4 container

**Component Integration:**
```
Camera (nokhwa) → Bounded Channel → FFmpeg stdin → MP4 output
Microphone (cpal) → Bounded Channel → FFmpeg stdin → (muxed)
```

### Source Tree Components

**Backend (Rust):**
- `src-tauri/src/commands/recording.rs` - Add `cmd_start_camera_recording`, `cmd_stop_camera_recording`
- `src-tauri/src/services/camera/nokhwa_wrapper.rs` - Camera capture service (from Story 2.7)
- `src-tauri/src/services/audio_capture.rs` - Microphone capture (from Story 2.4)
- `src-tauri/src/services/ffmpeg/encoder.rs` - Real-time encoding (from Story 2.3)
- `src-tauri/src/services/recording/orchestrator.rs` - Single-stream webcam orchestration
- `src-tauri/src/models/recording.rs` - RecordingConfig, RecordingSource::Camera

**Frontend (React):**
- `src/components/recording/RecordingPanel.tsx` - Add webcam mode UI state
- `src/components/recording/RecordingControls.tsx` - Start/stop/pause buttons (reuse from screen recording)
- `src/components/recording/RecordingPreview.tsx` - Webcam preview (from Story 2.7)
- `src/stores/recordingStore.ts` - Recording session state management
- `src/lib/tauri/recording.ts` - `startCameraRecording()` wrapper

**Data Flow:**
```
RecordingPanel (webcam mode)
  → RecordingControls.onClick("start")
  → recordingStore.startCameraRecording(config)
  → invoke('cmd_start_camera_recording', { config })
  → Tauri Backend: recording::orchestrator
    → Spawn camera capture task (nokhwa)
    → Spawn microphone capture task (cpal)
    → Spawn FFmpeg encoding task (encoder.rs)
    → Return recording_id
  → Frontend: Update recordingStore (status: recording)
  → RecordingControls shows "Stop" button

User clicks "Stop"
  → invoke('cmd_stop_camera_recording', { recording_id })
  → Backend: Stop capture threads, finalize FFmpeg
  → Trigger auto-import (Story 2.6 pattern)
  → Return output_path
  → Frontend: Toast "Recording imported", update media library
```

### Testing Strategy

**Unit Tests (Rust):**
- `recording::orchestrator::test_camera_recording_config()` - Verify RecordingSource::Camera config serialization
- `audio_capture::test_microphone_capture()` - Verify microphone audio stream initialization

**Integration Tests (Rust):**
- `test_camera_recording_start_stop()` - Start camera recording → Stop → Verify MP4 exists
- `test_camera_recording_memory_stability()` - Record 5 minutes → Monitor memory (should stay <500MB)
- `test_camera_recording_pause_resume()` - Pause → Wait → Resume → Verify continuous MP4 playback

**E2E Tests (TypeScript + Vitest):**
- `RecordingPanel.test.tsx` - Simulate webcam mode → Start → Stop → Verify auto-import triggered
- `recordingStore.test.ts` - Test state transitions: idle → recording → stopped

**Manual Tests:**
- Audio-video sync validation (record talking, verify lip sync)
- Camera disconnection during recording (unplug USB webcam mid-recording)
- Long recording (15 minutes) stability test

### Project Structure Notes

**Alignment with Unified Project Structure:**
- Follow existing file organization from Stories 2.1-2.7
- Webcam recording commands in `commands/recording.rs` alongside screen recording commands
- Reuse `services/ffmpeg/encoder.rs` (no new encoder needed, same pattern)
- Reuse `services/audio_capture.rs` (microphone capture from Story 2.4)
- Camera service from `services/camera/nokhwa_wrapper.rs` (Story 2.7)

**No Detected Conflicts:**
- Story 2.8 builds directly on Stories 2.3, 2.4, 2.6, 2.7 - all patterns established
- No architectural deviations from tech-spec-epic-2.md
- Consistent with recording architecture defined in architecture.md

### References

**Technical Specifications:**
- [Source: docs/tech-spec-epic-2.md#AC 2.8.1-2.8.6] - Story 2.8 acceptance criteria
- [Source: docs/tech-spec-epic-2.md#Services and Modules] - camera::nokhwa_wrapper, ffmpeg::encoder, audio_capture services
- [Source: docs/tech-spec-epic-2.md#Data Models] - RecordingConfig, RecordingSource::Camera
- [Source: docs/tech-spec-epic-2.md#Workflows] - Workflow 5: Webcam Recording (lines 505-524)

**Architecture:**
- [Source: docs/architecture.md#Novel Pattern 2] - Real-Time Encoding During Capture (lines 501-560)
- [Source: docs/architecture.md#Decision Summary] - nokhwa 0.10.9 (feature: input-avfoundation)
- [Source: docs/architecture.md#Dependencies] - FFmpeg integration via ffmpeg-sidecar 2.1.0

**Requirements:**
- [Source: docs/PRD.md#FR003] - Webcam Recording functional requirement
- [Source: docs/epics.md#Story 2.8] - Epic 2 story definition (lines 451-465)

**Prerequisites:**
- Story 2.7: Basic Webcam Recording Setup (camera permissions, device selection, preview)
- Story 2.4: System Audio and Microphone Capture (microphone audio capture)
- Story 2.3: Real-Time FFmpeg Encoding (bounded channel pattern, encoding pipeline)
- Story 2.6: Auto-Import Recordings to Media Library (auto-import workflow)

## Dev Agent Record

### Context Reference

- docs/stories/2-8-webcam-recording-with-audio-save.context.xml

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

### Completion Notes List

### File List
