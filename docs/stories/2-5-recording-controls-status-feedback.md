# Story 2.5: Recording Controls & Status Feedback

Status: ready-for-dev

## Story

As a user,
I want clear controls and feedback during recording,
So that I know recording is working and can manage it easily.

## Acceptance Criteria

1. Recording panel/modal with clear "Start Recording" and "Stop Recording" buttons
2. Recording duration timer shows elapsed time
3. Visual indicator (pulsing red dot) shows recording is active
4. Native macOS notification when recording starts
5. Pause/resume functionality for screen recording
6. Can cancel recording (discards partial recording)
7. Recording controls remain accessible during recording
8. Check available disk space before starting recording
9. Display warning if available space < estimated file size (assume 5MB/min for estimation)
10. Stop recording gracefully if disk space exhausted with partial file save notification

## Tasks / Subtasks

- [ ] Task 1: Recording Panel UI with Core Controls (AC: #1, #2, #3)
  - [ ] Subtask 1.1: Create RecordingControls.tsx component with start/stop button states
  - [ ] Subtask 1.2: Implement recording duration timer display (MM:SS format)
  - [ ] Subtask 1.3: Add pulsing red dot visual indicator using CSS animation
  - [ ] Subtask 1.4: Wire up controls to recordingStore state management
  - [ ] Subtask 1.5: Add unit tests for RecordingControls component

- [ ] Task 2: macOS System Integration (AC: #4)
  - [ ] Subtask 2.1: Create Tauri command cmd_send_recording_notification
  - [ ] Subtask 2.2: Integrate @tauri-apps/plugin-notification for native macOS notifications
  - [ ] Subtask 2.3: Test notification permissions and fallback behavior
  - [ ] Subtask 2.4: Add unit tests for notification command

- [ ] Task 3: Pause/Resume Recording Functionality (AC: #5, #6, #7)
  - [ ] Subtask 3.1: Extend recording service to support pause/resume state management
  - [ ] Subtask 3.2: Add pause/resume/cancel buttons to RecordingControls UI
  - [ ] Subtask 3.3: Implement FFmpeg pause mechanism (stop encoding, resume with same output file)
  - [ ] Subtask 3.4: Update recording timer to pause/resume with recording state
  - [ ] Subtask 3.5: Implement cancel recording with cleanup (delete partial file)
  - [ ] Subtask 3.6: Ensure controls remain accessible during all recording states
  - [ ] Subtask 3.7: Add integration tests for pause/resume/cancel workflows

- [ ] Task 4: Disk Space Management (AC: #8, #9, #10)
  - [ ] Subtask 4.1: Create Tauri command cmd_check_disk_space to query available space
  - [ ] Subtask 4.2: Implement pre-recording disk space check (5MB/min estimation)
  - [ ] Subtask 4.3: Display warning toast if insufficient space detected
  - [ ] Subtask 4.4: Add periodic disk space monitoring during recording (every 30 seconds)
  - [ ] Subtask 4.5: Implement graceful stop if disk space exhausted (save partial file, notify user)
  - [ ] Subtask 4.6: Add unit tests for disk space checking logic
  - [ ] Subtask 4.7: Add integration tests for disk space exhaustion scenarios

## Dev Notes

### Relevant Architecture Patterns and Constraints

**Recording Architecture (from architecture.md):**
- Recording state managed via Zustand `recordingStore`
- Tauri backend commands in `src-tauri/src/commands/recording.rs`
- Recording service in `src-tauri/src/services/recording/orchestrator.rs`
- FFmpeg integration via `ffmpeg-sidecar` for real-time encoding

**UI Component Structure:**
- `src/components/recording/RecordingControls.tsx` - Main controls component
- shadcn/ui Button, Toast, Dialog components for consistent UI
- Tailwind CSS for styling with macOS design aesthetics

**Error Handling:**
- User-facing errors displayed via shadcn/ui toast notifications
- Backend errors logged to `~/Library/Logs/clippy/app.log`
- Graceful degradation for permission/disk space issues

**State Management:**
- `recordingStore` tracks: `isRecording`, `isPaused`, `recordingId`, `elapsedTime`, `estimatedFileSize`
- Timer updates every second via `setInterval` when recording active

### Source Tree Components to Touch

**Frontend (React/TypeScript):**
- `src/components/recording/RecordingControls.tsx` - NEW: Main controls UI
- `src/components/recording/RecordingPanel.tsx` - MODIFY: Integrate RecordingControls
- `src/stores/recordingStore.ts` - MODIFY: Add pause/resume/cancel actions
- `src/lib/tauri/recording.ts` - MODIFY: Add wrappers for new commands

**Backend (Rust):**
- `src-tauri/src/commands/recording.rs` - MODIFY: Add cmd_pause_recording, cmd_resume_recording, cmd_cancel_recording, cmd_check_disk_space, cmd_send_recording_notification
- `src-tauri/src/services/recording/orchestrator.rs` - MODIFY: Implement pause/resume/cancel logic
- `src-tauri/src/services/ffmpeg/encoder.rs` - MODIFY: Support pause/resume for FFmpeg encoding

**Testing:**
- `src/components/recording/RecordingControls.test.tsx` - NEW: Unit tests for controls
- `src/stores/recordingStore.test.ts` - MODIFY: Add pause/resume/cancel tests

### Testing Standards Summary

**Frontend Testing (Vitest + React Testing Library):**
- Unit tests for all RecordingControls interactions (start/stop/pause/resume/cancel)
- Test timer updates and visual indicator states
- Mock Tauri invoke() calls for isolated component testing

**Backend Testing (cargo test):**
- Unit tests for disk space checking logic
- Integration tests for pause/resume/cancel workflows
- Test graceful degradation when disk space exhausted

**Manual Testing:**
- Verify native macOS notification appears when recording starts
- Test pause/resume during active recording (confirm no dropped frames)
- Test cancel recording and verify partial file is deleted
- Test disk space warning with low available space (<500MB)
- Test recording stops gracefully when disk fills up

### Project Structure Notes

#### Alignment with Unified Project Structure

**Component Organization:**
- Recording components follow pattern: `src/components/recording/*.tsx`
- Store follows pattern: `src/stores/recordingStore.ts`
- Tauri command wrappers: `src/lib/tauri/recording.ts`

**Backend Organization:**
- Commands: `src-tauri/src/commands/recording.rs`
- Services: `src-tauri/src/services/recording/`
- Error types: `src-tauri/src/error.rs`

**Testing Organization:**
- Frontend tests co-located: `*.test.tsx`
- Backend tests: inline `#[cfg(test)]` modules

#### Detected Conflicts or Variances

**No structural conflicts detected.** This story extends existing recording architecture from Stories 2.1-2.4 with UI controls and disk space management. All components align with established patterns.

**Variance Note:** Pause/resume FFmpeg encoding requires careful handling - FFmpeg CLI doesn't natively support pause, so implementation will stop/restart encoding with same output file. This is acceptable for MVP scope (AC #5).

### References

**Technical Details:**
- [Source: docs/epics.md#Story 2.5] - Acceptance criteria and story context
- [Source: docs/architecture.md#Recording Commands] - Tauri command patterns (lines 1502-1527)
- [Source: docs/architecture.md#State Management Patterns] - Zustand store patterns (lines 850-945)
- [Source: docs/architecture.md#Error Handling Patterns] - Toast notification patterns (lines 813-847)
- [Source: docs/PRD.md#FR002] - Screen recording functional requirements (lines 34-36)
- [Source: docs/PRD.md#NFR003] - Usability requirements for recording workflow (lines 86-91)

**Architecture Decisions:**
- [Source: docs/architecture.md#ADR-001] - ffmpeg-sidecar usage for encoding (lines 1836-1861)
- [Source: docs/architecture.md#Pattern 2] - Real-time encoding with bounded channels (lines 501-558)

**Recording Architecture:**
- [Source: docs/architecture.md#Recording Commands] - Backend command structure (lines 1502-1527)
- [Source: docs/architecture.md#Epic to Architecture Mapping] - Recording module mapping (lines 253-260)

## Dev Agent Record

### Context Reference

- `docs/stories/2-5-recording-controls-status-feedback.context.xml` - Generated 2025-10-28

### Agent Model Used

<!-- Will be filled by dev agent -->

### Debug Log References

<!-- Will be filled by dev agent -->

### Completion Notes List

<!-- Will be filled by dev agent during implementation -->

### File List

<!-- Will be filled by dev agent during implementation -->
