# clippy - Technical Backlog

This file tracks action items, follow-ups, and technical debt identified during code reviews and retrospectives.

## Legend

- **Date:** When the item was identified
- **Story:** Source story that generated this item
- **Epic:** Epic number
- **Type:** Bug | TechDebt | Enhancement | Testing | Documentation
- **Severity:** High | Medium | Low
- **Owner:** Assigned owner (or TBD)
- **Status:** Open | In Progress | Resolved | Deferred
- **Notes:** Brief description with file references

---

## Action Items from Story Reviews

| Date | Story | Epic | Type | Severity | Owner | Status | Notes |
|------|-------|------|------|----------|-------|--------|-------|
| 2025-10-29 | 4.7 | 4 | Bug | **CRITICAL** | TBD | Open | **BLOCKER:** Fix Compilation Error - Missing `use std::sync::atomic::AtomicBool;` import in commands/recording.rs:83-85. Prevents project build. ETA: 2 minutes. (File: src-tauri/src/commands/recording.rs:~5) |
| 2025-10-29 | 4.7 | 4 | Enhancement | High | TBD | Open | Implement Timeline Multi-Audio Display - Update TimelineClip component to render 3-audio-track indicators. Reference Story 3.9 patterns. (AC #5, File: src/components/timeline/TimelineClip.tsx) |
| 2025-10-29 | 4.7 | 4 | Enhancement | High | TBD | Open | Implement Per-Track Volume Controls - Extend ClipVolumeControl with track selection dropdown, per-track volume/mute. Add timelineStore audioTrackSettings state. (AC #6, Files: src/components/timeline/ClipVolumeControl.tsx, src/stores/timelineStore.ts) |
| 2025-10-29 | 4.7 | 4 | Testing | High | TBD | Open | Add Integration Test with FFprobe Validation - Record 30s PiP video, verify 3 AAC tracks @ 48kHz, measure sync accuracy (<50ms). (AC #1-4, File: src-tauri/tests/test_4_7_integration.rs) |
| 2025-10-29 | 4.7 | 4 | Testing | Medium | TBD | Open | Add FFmpeg Muxing Unit Test - Test finalize_with_audio with 3 AudioInputConfig, verify command includes -map 0:v -map 1:a -map 2:a -map 3:a. (AC #3, File: src-tauri/src/services/ffmpeg/encoder.rs) |
| 2025-10-29 | 4.7 | 4 | Enhancement | Medium | TBD | Open | Verify Story 4.6 Completion - Confirm PiP foundation (FFmpeg overlay filter, 2-video-stream orchestration, PiP config) before Story 4.7 merge. (Dependency Story 4.6) |
| 2025-10-29 | 4.7 | 4 | Documentation | Low | TBD | Open | Add Inline Code Documentation - Document audio_samples_to_pcm_bytes (f32 → i16le), finalize_with_audio architecture. (Files: orchestrator.rs:33, encoder.rs:343) |
| 2025-10-29 | 4.7 | 4 | Testing | Low | TBD | Open | Add Component Tests for Multi-Audio UI - Test TimelineClip indicators, ClipVolumeControl dropdown, timelineStore state updates. (AC #5-6, Files: src/components/timeline/*.test.tsx) |
| 2025-10-29 | 4.6 | 4 | Bug | **CRITICAL** | TBD | Open | Fix 18 TypeScript compilation errors - Multiple frontend type errors block build. Includes PiPConfigurator null types, unused variables, missing API properties. (AC #1, Files: Multiple frontend files, ETA: 2-3 hours) |
| 2025-10-29 | 4.6 | 4 | Testing | **CRITICAL** | TBD | Open | Add integration tests for full PiP recording flow - Create test_4_6_integration.rs, test start→capture→compose→verify. Mock or fixture-based. (AC #7, File: src-tauri/tests/test_4_6_integration.rs, ETA: 3-4 hours) |
| 2025-10-29 | 4.6 | 4 | Enhancement | High | TBD | Open | Implement error handling in composition task - Add timeout, frame drop counter, cleanup on error, propagate Result. (AC #7, File: recording.rs:1632, ETA: 2 hours) |
| 2025-10-29 | 4.6 | 4 | Enhancement | High | TBD | Open | Add performance metrics collection (FPS, frame drops) - Calculate FPS every 10s, track frame drops vs expected, log summary on stop. (AC #7, File: recording.rs:1632, ETA: 2 hours) |
| 2025-10-29 | 4.6 | 4 | Enhancement | Medium | TBD | Open | Enforce or report AC #3 synchronization to user - Fail recording or emit Tauri event with variance for UI display. (AC #3, File: recording.rs:1659, ETA: 1-2 hours) |
| 2025-10-29 | 4.6 | 4 | Bug | Medium | TBD | Open | Implement FIFO cleanup in error paths - Store FIFO paths, cleanup in Drop and stop_composition error paths. (File: compositor.rs:467,557, ETA: 1 hour) |
| 2025-10-29 | 4.6 | 4 | Bug | Medium | TBD | Open | Fix broken PiPConfigurator tests - Correct null type errors in test mocks, use proper PipPosition/PipSize types. (File: PiPConfigurator.test.tsx, ETA: 1 hour) |
| 2025-10-29 | 4.6 | 4 | TechDebt | Low | TBD | Open | Reduce logging noise - Change frame write logs from debug! to trace! level (300/s spam). (Files: compositor.rs:404,454, ETA: 15 min) |
| 2025-10-29 | 4.6 | 4 | Enhancement | Low | TBD | Open | Add output path sanitization - Validate user-provided path for directory traversal. (File: recording.rs:1550, ETA: 30 min) |
| 2025-10-29 | 4.6 | 4 | Enhancement | Low | TBD | Open | Create FIFOs in app-specific directory - Move from /tmp to ~/Library/Caches/clippy/ for better isolation. (File: compositor.rs:195, ETA: 30 min) |

---

## Epic Follow-ups

### Epic 4 - Advanced Recording & PiP Composition

**Post-Review Follow-ups from Story 4.6:**

1. **[CRITICAL] TypeScript Compilation Errors** - 18 frontend type errors blocking build (PiPConfigurator, RecordingPanel, pipUtils, timeline components). Must fix before production release.
2. **[CRITICAL] Integration Testing for PiP Recording** - No end-to-end tests for full recording flow. Cannot validate AC #7 (30 FPS, frame drops) without integration tests.
3. **[High] Error Handling in Composition Task** - Missing timeout handling, frame drop detection, and cleanup logic in recording.rs composition task. Risk of silent failures.
4. **[High] Performance Metrics Collection** - No FPS calculation or frame drop tracking. Required for AC #7 validation and production monitoring.
5. **[Medium] Synchronization Enforcement** - AC #3 validation exists but only logs warnings. Consider failing recording or notifying user if sync variance exceeds threshold.

**Post-Review Follow-ups from Story 4.7:**

1. **[High] Timeline Multi-Audio Display** - TimelineClip component needs multi-audio-track rendering for PiP recordings with 3 audio tracks
2. **[High] Per-Track Volume Controls** - ClipVolumeControl needs track selector dropdown and per-track volume/mute controls
3. **[High] Integration Testing** - Need FFprobe validation test for 3-audio-track recordings
4. **[Medium] Story 4.6 Dependency Validation** - Verify PiP foundation complete before Story 4.7 merge
