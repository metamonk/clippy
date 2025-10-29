# Story 4.1: Window Selection for Screen Recording

Status: in-progress

## Story

As a user,
I want to record a specific application window instead of the full screen,
So that I can focus recordings on relevant content without showing my entire desktop.

## Acceptance Criteria

1. Recording panel shows "Full Screen" vs "Window" recording mode toggle
2. Window mode displays list of open application windows to choose from
3. ScreenCaptureKit SCContentFilter configured to capture selected window only
4. Window recording captures window content at native resolution
5. Recording follows window if it moves (or maintains fixed capture area - document choice)
6. Window selection persists for subsequent recordings in session
7. Clear error if selected window closes during recording

## Tasks / Subtasks

- [ ] Task 1: Add window recording mode to RecordingConfig model (AC: #1)
  - [ ] Subtask 1.1: Update `RecordingConfig` interface in `src/types/recording.ts` to add `recordingMode: 'fullscreen' | 'window'` field (default 'fullscreen')
  - [ ] Subtask 1.2: Add `selectedWindowId?: number` field to store window identifier for ScreenCaptureKit
  - [ ] Subtask 1.3: Update Rust `RecordingConfig` struct in `src-tauri/src/models/recording.rs` with corresponding fields
  - [ ] Subtask 1.4: Update recordingStore in `src/stores/recordingStore.ts` to manage recording mode and selected window state

- [ ] Task 2: Implement window enumeration backend (AC: #2, #3)
  - [ ] Subtask 2.1: Create `cmd_get_available_windows` Tauri command in `src-tauri/src/commands/recording.rs`
  - [ ] Subtask 2.2: Use ScreenCaptureKit `SCShareableContent.getExcludingDesktopWindows()` to enumerate windows
  - [ ] Subtask 2.3: Return list of windows with properties: `windowId`, `ownerName` (app name), `title` (window title), `isOnScreen` (visibility)
  - [ ] Subtask 2.4: Filter out hidden/minimized windows and system UI elements
  - [ ] Subtask 2.5: Create `WindowInfo` type in `src/types/recording.ts` to represent window metadata

- [ ] Task 3: Build recording mode toggle UI (AC: #1, #2)
  - [ ] Subtask 3.1: Add radio button group or toggle to `RecordingPanel.tsx` for "Full Screen" vs "Window" mode
  - [ ] Subtask 3.2: Create `WindowSelector.tsx` component to display window list when "Window" mode selected
  - [ ] Subtask 3.3: Implement dropdown or list UI showing window titles with app icons (if available from ScreenCaptureKit)
  - [ ] Subtask 3.4: Add search/filter input for long window lists (>10 windows)
  - [ ] Subtask 3.5: Display "No windows available" message if window list is empty
  - [ ] Subtask 3.6: Add "Refresh Windows" button to reload window list

- [ ] Task 4: Configure ScreenCaptureKit for window capture (AC: #3, #4, #5)
  - [ ] Subtask 4.1: Update `services/screen_capture/screencapturekit.rs` to accept window mode configuration
  - [ ] Subtask 4.2: Create `SCContentFilter` with window-specific filter using `initWithDesktopIndependentWindow()` when window mode selected
  - [ ] Subtask 4.3: Capture window content at native resolution (detect window size and use as capture resolution)
  - [ ] Subtask 4.4: **Document decision:** Choose "Follow Window" (dynamic capture region) or "Fixed Capture" (static region). Default to "Follow Window" for better UX
  - [ ] Subtask 4.5: If "Follow Window" chosen: Verify ScreenCaptureKit automatically tracks window movement
  - [ ] Subtask 4.6: If "Fixed Capture" chosen: Implement region tracking logic
  - [ ] Subtask 4.7: Test window recording with window resizing (capture should adapt to new size)

- [ ] Task 5: Persist window selection in session (AC: #6)
  - [ ] Subtask 5.1: Update recordingStore to save `lastSelectedWindowId` in session state
  - [ ] Subtask 5.2: Pre-select last used window when user switches back to "Window" mode
  - [ ] Subtask 5.3: Validate selected window still exists before recording starts (handle closed window case)
  - [ ] Subtask 5.4: Reset to "Full Screen" mode if last selected window is no longer available

- [ ] Task 6: Handle window closed during recording error case (AC: #7)
  - [ ] Subtask 6.1: Add error detection in `services/screen_capture/screencapturekit.rs` for window invalidation
  - [ ] Subtask 6.2: ScreenCaptureKit callback handles window closure event (stream error or empty frames)
  - [ ] Subtask 6.3: Stop recording gracefully and emit event to frontend
  - [ ] Subtask 6.4: Display user-friendly toast notification: "Recording stopped: Selected window was closed"
  - [ ] Subtask 6.5: Save partial recording if possible, or discard if no frames captured

- [ ] Task 7: Add unit and integration tests (AC: #1-7)
  - [ ] Subtask 7.1: Unit test: RecordingConfig model with window mode properties
  - [ ] Subtask 7.2: Component test: WindowSelector renders window list and handles selection
  - [ ] Subtask 7.3: Component test: Recording mode toggle switches between fullscreen and window modes
  - [ ] Subtask 7.4: Integration test: `cmd_get_available_windows` returns valid window list
  - [ ] Subtask 7.5: Integration test: Window recording captures correct window content (visual verification)
  - [ ] Subtask 7.6: Integration test: Recording stops gracefully when window closes
  - [ ] Subtask 7.7: E2E test: Full workflow from window selection to successful recording

## Dev Notes

### Architecture Patterns and Constraints

**Recording Mode Architecture:**
- Extends existing `RecordingConfig` model from Story 2.1-2.3 foundation
- Recording mode is a configuration parameter, not a separate recording type
- Window selection is optional - only required when `recordingMode === 'window'`
- Session state persistence uses Zustand store, not permanent storage

**ScreenCaptureKit Integration:**
- Window enumeration via `SCShareableContent.getExcludingDesktopWindows(excludedApps: [], onScreenWindowsOnly: true)`
- Window filter via `SCContentFilter.initWithDesktopIndependentWindow(window)`
- Window tracking behavior determined by filter type (follow vs fixed) - **Decision Required**
- Native resolution detection: Use window bounds from `SCWindow` metadata
- Error handling: ScreenCaptureKit emits stream errors when window is invalid

**Follow Window vs Fixed Capture Decision:**
- **Recommended: Follow Window**
  - Pros: Better UX, window can move without breaking recording, matches user expectations
  - Cons: May capture window decorations (title bar, borders), slight performance overhead
  - Implementation: ScreenCaptureKit handles automatically with `initWithDesktopIndependentWindow`
- **Alternative: Fixed Capture**
  - Pros: Predictable output size, excludes window decorations if carefully positioned
  - Cons: Window movement breaks recording (captures empty space), requires manual region calculation
  - Implementation: Use `initWithDisplay` with custom rect bounds
- **Default to Follow Window** for Story 4.1 implementation, document as architectural decision

**Window Selection UX:**
- Display window title and app name: "{appName} - {windowTitle}"
- Group by application if multiple windows from same app
- Show preview thumbnail if available from ScreenCaptureKit window snapshots
- Disable recording button until window is selected in window mode
- Show warning icon if selected window is minimized or off-screen

**Error Handling:**
- Window closed during recording: Stop recording, save partial file, notify user
- Window minimized: ScreenCaptureKit should continue capturing (test behavior)
- Window moved off-screen: ScreenCaptureKit should continue capturing (test behavior)
- No windows available: Disable window mode, show informative message

**Performance Considerations:**
- Window enumeration is synchronous but fast (<100ms typical)
- Cache window list for 5 seconds to avoid excessive ScreenCaptureKit calls
- Window capture has similar performance to fullscreen (both use ScreenCaptureKit streams)
- Window tracking adds negligible overhead if using `Follow Window` approach

### Source Tree Components to Touch

**Frontend (TypeScript/React):**
- `src/types/recording.ts` - Add recordingMode and selectedWindowId to RecordingConfig, create WindowInfo interface
- `src/components/recording/RecordingPanel.tsx` - Add recording mode toggle UI
- `src/components/recording/WindowSelector.tsx` (NEW) - Window selection dropdown/list component
- `src/components/recording/RecordingModeToggle.tsx` (NEW) - "Full Screen" vs "Window" toggle component
- `src/stores/recordingStore.ts` - Add recording mode and window selection state management
- `src/lib/tauri/recording.ts` - Add `getAvailableWindows()` wrapper for Tauri command

**Backend (Rust):**
- `src-tauri/src/models/recording.rs` - Add recording_mode and selected_window_id fields to RecordingConfig struct
- `src-tauri/src/commands/recording.rs` - Add `cmd_get_available_windows` Tauri command
- `src-tauri/src/services/screen_capture/screencapturekit.rs` - Update to accept window mode, create window-specific filters
- `src-tauri/src/services/screen_capture/mod.rs` - Add WindowInfo struct for window metadata

**Tests:**
- `src/components/recording/WindowSelector.test.tsx` (NEW) - Window selection component tests
- `src/components/recording/RecordingModeToggle.test.tsx` (NEW) - Mode toggle tests
- `src/stores/recordingStore.test.ts` - Recording mode state management tests
- `tests/e2e/4.1-window-recording.spec.ts` (NEW) - E2E workflow test

### Project Structure Notes

**Alignment with Unified Project Structure:**
- Builds on Epic 2 recording infrastructure (Stories 2.1-2.3)
- Follows established ScreenCaptureKit integration patterns from Story 2.1
- Consistent with RecordingConfig extension pattern (similar to audio source selection in Story 2.4)
- Recording UI components follow existing pattern in `src/components/recording/`
- State management follows Zustand patterns in `src/stores/recordingStore.ts`

**Detected Conflicts or Variances:**
- None - Window mode is an additive feature to existing recording infrastructure
- ScreenCaptureKit filter creation logic will have conditional branching (fullscreen vs window filter)
- Recording validation must check window mode and selected window before starting
- UI layout in RecordingPanel may need expansion to accommodate window selector

**Lessons Learned from Story 2.1 (ScreenCaptureKit Setup):**
- ScreenCaptureKit permissions already handled (screen recording permission covers window capture)
- macOS permission prompts can be intrusive - inform user before triggering
- ScreenCaptureKit error handling is crucial - framework can fail silently
- Window list enumeration should exclude system UI and hidden windows for better UX

**Lessons Learned from Story 2.4 (Audio Source Selection):**
- Dropdown UI for source selection works well in RecordingPanel
- Session persistence of user preferences improves workflow
- Configuration validation before recording start prevents runtime errors
- Clear error messages when selected source is unavailable

**Lessons Learned from Story 3.10 (Audio Fade):**
- Optional configuration fields maintain backward compatibility
- Session state in Zustand stores effective for transient preferences
- UI components can coexist in constrained timeline/panel spaces
- Validation utilities (like validateFadeDuration) prevent invalid configurations

### References

**Technical Specifications:**
- [Source: docs/epics.md#Story 4.1: Window Selection for Screen Recording] - Core requirements and acceptance criteria
- [Source: docs/PRD.md#FR002: Screen Recording Capabilities] - Window selection requirement
- [Source: docs/architecture.md#Epic 4: Advanced Recording & PiP Composition] - Advanced recording architecture

**Related Stories:**
- Story 2.1: ScreenCaptureKit Setup & Permissions - Foundation for screen capture (permissions, basic capture)
- Story 2.2: Full-Screen Recording - Existing fullscreen capture implementation
- Story 2.4: System Audio and Microphone Capture - Audio source selection pattern (similar UI approach)
- Story 4.2: Recording Configuration Panel - Will build on this story's recording mode infrastructure

**Apple Documentation:**
- ScreenCaptureKit Overview: https://developer.apple.com/documentation/screencapturekit
- SCShareableContent: https://developer.apple.com/documentation/screencapturekit/scshareablecontent
- SCContentFilter: https://developer.apple.com/documentation/screencapturekit/sccontentfilter
- Filtering Content for Screen Capture: https://developer.apple.com/documentation/screencapturekit/filtering_content

**Rust Crate Documentation:**
- screencapturekit crate: https://docs.rs/screencapturekit/latest/screencapturekit/

## Dev Agent Record

### Context Reference

- `docs/stories/4-1-window-selection-for-screen-recording.context.xml` (Generated: 2025-10-29)

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)

### Debug Log References

### Completion Notes List

### File List

## Senior Developer Review (AI)

(Awaiting review after implementation)

## Change Log

- **2025-10-29** - Story reset to in-progress: Previous completion claims were false, implementing from scratch (Amelia/Dev Agent)
