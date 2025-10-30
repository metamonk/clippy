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
| 2025-10-29 | 5.4 | 5 | Enhancement | Low | TBD | Open | Cache gap analysis results - Memoize analyzeTimelineGaps() when timeline unchanged. Currently runs ~60 FPS. Cache invalidation on edit. (AC #1, #8, File: src/components/player/VideoPlayer.tsx:340-350, ETA: 1-2 hours) |
| 2025-10-29 | 5.4 | 5 | Testing | Low | TBD | Open | Add E2E tests for gap playback - Playwright E2E tests for visual black frame and audio silence validation. Integration tests limited by mocking. (AC #2, #3, #6, File: Create tests/e2e/gap-playback.spec.ts, ETA: 2-3 hours) |
| 2025-10-29 | 5.4 | 5 | Documentation | Low | TBD | Open | Add user-facing gap handling docs - Document gap behavior in user help/FAQ. Why gaps show black frames. (AC #7, File: Create docs/user-guide/timeline-gaps.md, ETA: 1 hour) |
| 2025-10-29 | 5.4 | 5 | Enhancement | Low | Story 5.6 | Open | Per-track gap compositing strategy - Enhance to composite active tracks during partial gaps. Current: pauses ALL tracks when ANY has gap. (Story 5.6 prerequisite, Files: src/lib/timeline/gapAnalyzer.ts, VideoPlayer.tsx, ETA: Story 5.6 scope) |
| 2025-10-29 | 5.5 | 5 | Bug | **CRITICAL** | DevAgent | Resolved | Fixed compilation errors - Resolved PartialEq/Eq issues in segment_renderer.rs and timeline.rs. All tests now compile and pass. (Resolution: 2025-10-29) |
| 2025-10-29 | 5.5 | 5 | Testing | **CRITICAL** | DevAgent | Resolved | Integration testing approach selected - Option A: Story marked as "Infrastructure Complete (Partial)", Story 5.5.1 created for integration validation when composition renderer ready. (Resolution: 2025-10-29) |
| 2025-10-29 | 5.5 | 5 | Documentation | High | DevAgent | Resolved | Created ADR-010 in docs/architecture.md - Multi-Track Audio Mixing Architecture documenting FFmpeg amix decision, alternatives, trade-offs, consequences. (Resolution: 2025-10-29, Note: ADR-009 already existed for Gap Handling) |
| 2025-10-29 | 5.5 | 5 | Testing | Medium | DevAgent | Resolved | Performance targets documented - Performance characteristics documented in ADR-010, validation deferred to Story 5.5.1 integration testing. (Resolution: 2025-10-29) |
| 2025-10-29 | 5.5 | 5 | Testing | Low | TBD | Deferred | Clean up placeholder performance test - Either remove or make meaningful with large timeline dataset. Test in compositionStore.test.ts:208-220 doesn't validate performance. Low priority cleanup item. (File: src/stores/compositionStore.test.ts:208-220) |
| 2025-10-29 | 5.5 | 5 | Documentation | Low | TBD | Deferred | Clarify "real-time" documentation - Change "mixed in real-time" → "mixed (via FFmpeg pre-render)" in doc comment to reflect actual implementation approach. Low priority, context is clear. (File: src-tauri/src/services/ffmpeg/audio_mixer.rs:75) |
| 2025-10-29 | 5.5 | 5 | Testing | **HIGH** | TBD | Open | **NEW STORY REQUIRED:** Create Story 5.5.1: Audio Mixing Integration Validation - Validate multi-track audio mixing during composition playback, test audio sync (< 10ms), clipping prevention with real audio, fade effects, end-to-end playback with 2/4/6/8 tracks. Prerequisite: Stories 5.3/5.4 composition renderer complete. (AC: #2, #5, #7, #8, #9) |
| 2025-10-29 | 5.6 | 5 | Enhancement | Low | DevAgent | Resolved | Complete Hardware Acceleration Implementation - Add `-c:v h264_videotoolbox` encoder flags to build_ffmpeg_command for macOS. Add fallback to libx264 on other platforms. (AC #5, File: src-tauri/src/services/segment_renderer.rs:368-383, Resolution: Already implemented, verified 2025-10-30) |
| 2025-10-29 | 5.6 | 5 | Enhancement | Low | DevAgent | Resolved | Wire Up FFmpeg Execution - Replace placeholder comment with actual ffmpeg-sidecar::command() execution. Add error handling and progress reporting. (AC: All, File: src-tauri/src/services/segment_renderer.rs:431-465, Resolution: Implemented with FfmpegCommand, spawn, wait, error handling, file verification - 2025-10-30) |
| 2025-10-29 | 5.6 | 5 | TechDebt | Low | DevAgent | Resolved | Complete Trim Parameter Support - Finish `-ss` and `-t` parameter handling for clip trim points. Add unit test for trimmed clip rendering. (File: src-tauri/src/services/segment_renderer.rs:348-358, Resolution: Already implemented with -ss and -t flags, validated with test_integration_trim_parameter_support test - 2025-10-30) |
| 2025-10-29 | 5.6 | 5 | Testing | Low | DevAgent | Resolved | Add E2E Tests for Multi-Track Composition - Create integration tests for multi-track composition rendering. Add performance benchmark validating 60 FPS with 3 tracks. Add visual regression tests for PiP positioning. (AC: #5, #8, File: src-tauri/tests/test_5_6_integration.rs, Resolution: Created 7 integration tests covering all ACs - 2-track PiP, 3-track different resolutions, opacity/alpha, cache invalidation, segment classification, black backgrounds, trim parameters. All 7 tests passing - 2025-10-30) |

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

---

### Epic 5 - Timeline Composition Playback

**Post-Review Follow-ups from Story 5.4 (Gap Handling with Black Frames):**

1. **[Low] Performance Optimization** - Cache gap analysis results when timeline unchanged (currently runs ~60 FPS). Memoization opportunity for large timelines (100+ clips).
2. **[Low] E2E Testing** - Add Playwright tests for visual black frame and audio silence validation. Integration tests limited by Vitest mocking.
3. **[Low] User Documentation** - Document gap handling behavior in user-facing help/FAQ to clarify why gaps show black frames.
4. **[Low] Multi-Track Enhancement** - Story 5.6 should enhance multi-track strategy to composite active tracks during partial gaps (currently pauses ALL tracks when ANY has gap).

**Post-Review Follow-ups from Story 5.5 (Multi-Track Audio Mixing):**

1. **[CRITICAL] Fix Compilation Errors** - Duplicate `from_counter` methods and incorrect `PerformanceMetrics` field names in performance_monitor.rs prevent cargo test execution. Blocks validation of all Rust tests including audio_mixer module.
2. **[CRITICAL] Integration Testing Gap** - End-to-end audio mixing playback not tested. While FFmpeg filter graph generation is unit tested (6 tests), actual mixing during playback, audio sync < 10ms variance, clipping prevention with real audio, and fade effects are not validated. Story delivers infrastructure only.
3. **[High] Missing ADR-009** - Task 1.2 required "Document chosen approach in ADR or Dev Notes." Dev Notes are comprehensive but formal Architecture Decision Record is missing. Future developers may not understand why FFmpeg amix approach was chosen over real-time mixing (rodio/cpal).
4. **[Medium] Performance Targets Not Validated** - CPU usage (< 80%), audio sync (< 10ms), render time (2-5s) targets are architecturally justified but not measured. Consider adding benchmark tests or explicitly defer to Story 5.8.
5. **[Low] Code Documentation Accuracy** - Doc comment in audio_mixer.rs:75 claims "mixed in real-time" but FFmpeg approach is pre-rendering, not real-time. Clarify to avoid confusion.
6. **[Low] Test Quality** - Placeholder test in compositionStore.test.ts:208-220 doesn't validate performance requirement. Either remove or make meaningful.

**Post-Review Follow-ups from Story 5.6 (Multi-Track Video Compositing):**

1. **[Low] [RESOLVED 2025-10-30] Hardware Acceleration Implementation** - VideoToolbox encoder flags already implemented at src-tauri/src/services/segment_renderer.rs:368-383. Verified working.
2. **[Low] [RESOLVED 2025-10-30] FFmpeg Execution Wiring** - render_segment() now has complete ffmpeg-sidecar execution with spawn, wait, error handling, and file verification (lines 431-465).
3. **[Low] [RESOLVED 2025-10-30] Trim Parameter Support** - `-ss` and `-t` handling already complete at lines 348-358. Integration test validates correctness.
4. **[Low] [RESOLVED 2025-10-30] E2E Testing** - Created src-tauri/tests/test_5_6_integration.rs with 7 comprehensive integration tests. All tests passing.
