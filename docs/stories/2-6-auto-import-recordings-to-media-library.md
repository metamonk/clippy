# Story 2.6: Auto-Import Recordings to Media Library

Status: ready-for-dev

## Story

As a user,
I want completed recordings to automatically appear in my media library,
so that I can immediately edit them without manual import.

## Acceptance Criteria

1. When recording stops, file automatically added to media library
2. Thumbnail generated for recorded clip
3. Metadata extracted (duration, resolution, file size)
4. Recording appears in media library within 2 seconds of stopping
5. Recorded file saved to organized location (user Documents/clippy/recordings or similar)
6. Success notification confirms recording saved

## Tasks / Subtasks

- [ ] Task 1: Recording Storage Path Management (AC: #5)
  - [ ] Subtask 1.1: Create Tauri command `cmd_get_recordings_dir` to get/create ~/Documents/clippy/recordings directory
  - [ ] Subtask 1.2: Update recording service to save files to organized directory with timestamp-based naming
  - [ ] Subtask 1.3: Add configuration option for custom recordings directory (optional)
  - [ ] Subtask 1.4: Add unit tests for path management functions

- [ ] Task 2: Auto-Import After Recording (AC: #1, #4)
  - [ ] Subtask 2.1: Modify `cmd_stop_recording` to return MediaFile object with full metadata
  - [ ] Subtask 2.2: Create `auto_import_recording` function in media service
  - [ ] Subtask 2.3: Integrate auto-import call in recording stop workflow
  - [ ] Subtask 2.4: Add integration test for recording → auto-import flow

- [ ] Task 3: Metadata Extraction for Recordings (AC: #3)
  - [ ] Subtask 3.1: Extend existing `extract_video_metadata` in media.rs to handle recording output format
  - [ ] Subtask 3.2: Extract duration, resolution, file size, codec from recorded MP4
  - [ ] Subtask 3.3: Ensure metadata extraction completes within 500ms for 2-second SLA
  - [ ] Subtask 3.4: Add error handling for corrupted/incomplete recordings

- [ ] Task 4: Thumbnail Generation (AC: #2)
  - [ ] Subtask 4.1: Reuse existing thumbnail generation from Story 1.5 (FFmpeg frame extraction)
  - [ ] Subtask 4.2: Extract thumbnail at 1-second mark of recording
  - [ ] Subtask 4.3: Save thumbnail to application cache directory
  - [ ] Subtask 4.4: Add thumbnail path to MediaFile object

- [ ] Task 5: Media Library Store Integration (AC: #1, #4)
  - [ ] Subtask 5.1: Call `mediaLibraryStore.addMediaFile()` after recording stops
  - [ ] Subtask 5.2: Update frontend to display new recording within 2 seconds
  - [ ] Subtask 5.3: Ensure recording appears at top of media library (most recent first)
  - [ ] Subtask 5.4: Add integration test for store update

- [ ] Task 6: Success Notification (AC: #6)
  - [ ] Subtask 6.1: Display toast notification "Recording saved successfully"
  - [ ] Subtask 6.2: Include recording filename and file size in notification
  - [ ] Subtask 6.3: Add click action to jump to media library and highlight recording
  - [ ] Subtask 6.4: Add unit tests for notification display

- [ ] Task 7: Integration Testing
  - [ ] Subtask 7.1: E2E test: Start recording → Stop → Verify in media library within 2 seconds
  - [ ] Subtask 7.2: Test with various recording durations (5s, 30s, 2min)
  - [ ] Subtask 7.3: Test error scenarios (disk full, corrupted output)
  - [ ] Subtask 7.4: Test notification interaction

## Dev Notes

### Relevant Architecture Patterns and Constraints

**Media Library Architecture (from architecture.md):**
- Media library state managed via Zustand `mediaLibraryStore` [Source: docs/architecture.md#State Management]
- MediaFile interface includes: id, filePath, filename, duration, resolution, fileSize, codec, thumbnail, importedAt [Source: docs/architecture.md#Core Data Models, lines 1381-1393]
- Metadata extraction handled by `commands/media.rs` [Source: docs/architecture.md#Epic to Architecture Mapping, line 256]
- Thumbnail generation using FFmpeg (reuse from Story 1.5) [Source: docs/architecture.md#Media Processing, line 281]

**Recording Architecture (from architecture.md):**
- Recording state managed via Zustand `recordingStore` [Source: docs/architecture.md#State Management]
- Recording commands in `src-tauri/src/commands/recording.rs` [Source: docs/architecture.md#Project Structure, line 192]
- Recording service in `src-tauri/src/services/recording/orchestrator.rs` [Source: docs/architecture.md#Project Structure, line 207]
- FFmpeg integration via `ffmpeg-sidecar` for real-time encoding [Source: docs/architecture.md#Technology Stack, line 282]

**Notification System:**
- shadcn/ui toast notifications for user feedback [Source: docs/architecture.md#Error Handling Patterns, line 817]
- Native macOS notifications via `@tauri-apps/plugin-notification` [Source: docs/architecture.md#Tauri Plugins, line 110]
- User-friendly error messages (no stack traces) [Source: docs/architecture.md#Error Handling, line 1275]

**File Path Management:**
- Absolute paths stored by default [Source: docs/architecture.md#File Path Handling, line 1336]
- macOS standard location: ~/Documents/clippy/recordings [Source: docs/PRD.md#FR002]
- Timestamp-based naming for recordings (e.g., recording-2025-10-28-143000.mp4)

### Source Tree Components to Touch

**Frontend (React/TypeScript):**
- `src/stores/mediaLibraryStore.ts` - MODIFY: Ensure addMediaFile() exists and handles auto-import
- `src/components/recording/RecordingPanel.tsx` - MODIFY: Call auto-import after stop recording
- `src/lib/tauri/recording.ts` - MODIFY: Update stop recording wrapper to return MediaFile
- `src/lib/tauri/media.ts` - VERIFY: Ensure metadata extraction wrapper exists

**Backend (Rust):**
- `src-tauri/src/commands/recording.rs` - MODIFY: Update cmd_stop_recording to return MediaFile
- `src-tauri/src/commands/media.rs` - VERIFY/MODIFY: Ensure extract_video_metadata handles recordings
- `src-tauri/src/services/recording/orchestrator.rs` - MODIFY: Set output path to ~/Documents/clippy/recordings
- `src-tauri/src/utils/paths.rs` - NEW/MODIFY: Add get_recordings_directory() function

**Testing:**
- `src/components/recording/RecordingPanel.test.tsx` - ADD: Test auto-import workflow
- `src-tauri/src/commands/recording.rs` - ADD: Test cmd_stop_recording returns MediaFile
- Integration test (Rust or Playwright): Record → Stop → Verify in library within 2s

### Testing Standards Summary

**From testing-strategy.md (if exists) or architecture.md patterns:**
- Unit tests required for all new Tauri commands (cargo test)
- Unit tests required for store modifications (Vitest)
- Integration test for full recording → library workflow
- Performance test: Verify 2-second SLA for auto-import
- Error scenario tests: Disk full, corrupted output, missing FFmpeg

**Test Coverage Targets:**
- Backend: >80% for commands and services
- Frontend: >75% for components and stores
- E2E: Critical path (record → auto-import → display)

### Project Structure Notes

**Alignment with Unified Project Structure:**
- Recording output path: `~/Documents/clippy/recordings/` (macOS standard user directory)
- Thumbnail cache: `~/Library/Caches/com.clippy.app/thumbnails/` (macOS standard cache)
- Media library store follows established Zustand patterns
- File naming convention: `recording-{timestamp}.mp4` (e.g., recording-2025-10-28-143527.mp4)

**Detected Conflicts or Variances:**
- None detected. Architecture.md patterns align with existing implementations in Stories 1.3-1.5 and 2.1-2.5.

### References

**Technical Details with Sources:**
- MediaFile interface: [Source: docs/architecture.md#Core Data Models, lines 1381-1393]
- FFmpeg thumbnail generation: [Source: docs/architecture.md#Media Processing, lines 281-287]
- Toast notification patterns: [Source: docs/architecture.md#React Error Handling, lines 817-841]
- Recording architecture: [Source: docs/architecture.md#Epic to Architecture Mapping, line 254]
- macOS standard paths: [Source: docs/PRD.md#FR002 Screen Recording Capabilities]
- 2-second performance requirement: [Source: docs/epics.md#Story 2.6, AC #4, line 424]

## Dev Agent Record

### Context Reference

- docs/stories/2-6-auto-import-recordings-to-media-library.context.xml

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

### Completion Notes List

### File List
