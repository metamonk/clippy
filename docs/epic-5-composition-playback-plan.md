# Epic 5: Timeline Composition Playback (PROPOSED)

**Status:** Planning Phase
**Author:** zeno + Claude
**Date:** 2025-10-29
**Sequencing:** After Epic 4, Before Epic 6 (AI Automation)

---

## Executive Summary

**Current State:** Timeline playback previews individual clips at playhead position. Gaps show "No clip" message. No audio mixing. No multi-track compositing. Export works (FFmpeg composition), but preview experience is disjointed.

**Problem:** Users can't preview their final video composition during editing. Must export to see how clips flow together, making iterative editing slow and painful.

**Solution:** Implement professional-grade composition renderer that treats timeline as one continuous video, matching industry standards (Premiere Pro, DaVinci Resolve, Final Cut Pro).

---

## Epic Goal

Transform timeline playback from "single-clip preview" to "full composition preview" that seamlessly plays through all clips, handles gaps intelligently, mixes audio from multiple tracks in real-time, and composites multi-track video—delivering a professional editing experience where preview matches export.

**Success Metrics:**
- ✅ Timeline plays continuously through all clips without manual intervention
- ✅ Gaps render as black frames with silence (no "no clip" message)
- ✅ Multi-track audio mixed in real-time during playback
- ✅ Video tracks composite correctly (opacity, layering)
- ✅ Preview playback matches export output (visual parity)
- ✅ Performance: 30 FPS playback on MacBook Pro (2020+) with 3+ clips

**Estimated Stories:** 8
**Estimated Duration:** 4-6 weeks

---

## Why This is Needed Before Epic 6 (AI)

1. **User Experience Foundation:** AI features (transcription, captions) generate timeline content. Users need to preview compositions before Epic 6 adds AI-generated clips.

2. **Testing AI Output:** Without composition playback, users can't validate AI-generated captions/edits until export.

3. **Product Maturity:** Professional editing UX must be in place before adding advanced AI features. Can't sell "AI video editor" if basic playback doesn't work.

4. **Technical Dependency:** AI features may generate complex timelines (auto-cuts, B-roll insertion). Composition renderer must exist first.

---

## Current Architecture Limitations

### What Works Today
✅ Single-clip preview at playhead position
✅ Playhead synchronization
✅ Timeline export via FFmpeg (composition DOES work in export)
✅ Multi-track timeline data structure

### What's Missing
❌ No automatic clip switching during playback
❌ No gap handling (shows error message)
❌ No real-time audio mixing
❌ No multi-track video compositing
❌ No frame-accurate transitions

### Why Export Works But Playback Doesn't
**Export:** FFmpeg reads entire timeline, processes offline, outputs final composition
**Playback:** MPV plays ONE file at a time, can't composite in real-time

---

## Story Breakdown

### Story 5.1: Composition Playback Architecture & ADR

**Goal:** Research and document approach for real-time composition rendering.

**As a developer,**
I want to define the composition playback architecture,
So that implementation has clear technical direction.

**Acceptance Criteria:**
1. Research document compares 3 approaches:
   - **Approach A:** Real-time MPV switching with audio mixing
   - **Approach B:** FFmpeg pre-render to temp file, play via MPV
   - **Approach C:** Hybrid: pre-render small segments, stream
2. ADR-008 documents chosen approach with pros/cons
3. Architecture diagram shows composition renderer components
4. Performance benchmarks for each approach documented
5. Memory/CPU requirements estimated
6. API interface defined for CompositionRenderer service
7. Timeline → Renderer data flow documented
8. Edge cases documented (gaps, overlapping clips, audio-only tracks)

**Prerequisites:** Epic 4 complete (Story 4.8)

---

### Story 5.2: Composition State Management

**Goal:** Track composition playback state separate from single-clip preview.

**As a developer,**
I want composition state separate from clip preview state,
So that I can manage complex timeline playback.

**Acceptance Criteria:**
1. New `compositionStore.ts` created for composition state
2. State tracks: currentCompositionTime, activeClips, activeTracks, renderState
3. `VideoPlayer` checks `mode === 'timeline'` and uses composition state
4. Clip switching logic triggers at clip boundaries
5. Gap detection identifies timeline regions without clips
6. Multi-track clip queries return all clips at given time
7. Unit tests for composition state transitions
8. Performance: state updates < 16ms (60 FPS target)

**Prerequisites:** Story 5.1

---

### Story 5.3: Sequential Clip Playback (Single Track)

**Goal:** Auto-advance through clips on a single track.

**As a user,**
I want playback to continue automatically when one clip ends,
So that I can preview multi-clip sequences without manual intervention.

**Acceptance Criteria:**
1. When clip ends, composition renderer finds next clip
2. Next clip loads and starts playing seamlessly
3. Transition latency < 100ms (imperceptible to user)
4. Playhead continues moving through transition
5. CurrentTime updates correctly across clip boundaries
6. Works for 2+ consecutive clips on same track
7. End of timeline stops playback (no error)
8. Keyboard shortcuts (Space, Arrow keys) work during transitions

**Prerequisites:** Story 5.2

**Note:** Single-track only. Multi-track compositing in Story 5.5.

---

### Story 5.4: Gap Handling with Black Frames

**Goal:** Render black frames and silence in gaps between clips.

**As a user,**
I want gaps in my timeline to show black frames instead of errors,
So that my composition plays smoothly even with intentional spacing.

**Acceptance Criteria:**
1. Gap detection identifies timeline regions without clips
2. Black frame rendered in video preview during gaps
3. Silent audio played during gaps (no audio artifacts)
4. Gap duration calculated from timeline structure
5. Playhead continues advancing through gaps
6. Transition from clip → gap → clip is seamless
7. Works for gaps at start, middle, and end of timeline
8. Performance: black frame rendering has zero overhead

**Prerequisites:** Story 5.3

---

### Story 5.5: Multi-Track Audio Mixing

**Goal:** Mix audio from multiple tracks playing simultaneously.

**As a user,**
I want to hear audio from all tracks during playback,
So that I can preview voice-over, music, and sound effects together.

**Acceptance Criteria:**
1. Composition renderer identifies all clips at current playhead position
2. Audio streams from overlapping clips mixed in real-time
3. Per-clip volume settings applied during mixing
4. Muted clips excluded from mix
5. Audio synchronization maintained across tracks (< 10ms variance)
6. Supports 2-8 simultaneous audio tracks
7. Mix output sent to single MPV audio stream
8. No audio distortion or clipping with multiple loud tracks
9. Fade-in/fade-out effects applied correctly in mix

**Prerequisites:** Story 5.4

**Technical Challenge:** Real-time audio mixing with MPV. May require external audio library (rodio, cpal) or FFmpeg audio filter.

---

### Story 5.6: Multi-Track Video Compositing

**Goal:** Composite videos from multiple tracks with layering and opacity.

**As a user,**
I want video tracks to layer on top of each other,
So that I can create picture-in-picture effects and overlays.

**Acceptance Criteria:**
1. Track z-index determines layer order (Track 1 = bottom, Track N = top)
2. Clips on higher tracks render over lower tracks
3. Opacity/alpha channel support for semi-transparent overlays
4. Black background if no clips at bottom track level
5. Compositing performance: 30 FPS with 3 simultaneous video tracks
6. Works with different video resolutions (scales to canvas)
7. Maintains aspect ratio for each clip
8. Position/scale transforms applied (for PiP effects)

**Prerequisites:** Story 5.5

**Technical Challenge:** Real-time video compositing. May require:
- **Option A:** FFmpeg overlay filter (requires pre-processing)
- **Option B:** GPU-accelerated compositor (OpenGL/Metal)
- **Option C:** Canvas/WebGL rendering in frontend

---

### Story 5.7: Composition Export Parity Validation

**Goal:** Ensure composition playback visually matches export output.

**As a developer,**
I want automated tests comparing playback to export,
So that users see accurate previews.

**Acceptance Criteria:**
1. Test suite exports timeline composition to MP4
2. Test suite captures playback frames at same timestamps
3. Frame comparison detects visual differences (pixel diff)
4. Audio waveform comparison validates audio mixing
5. Test runs on 3 test timelines: single-track, multi-track, gaps
6. Differences < 5% pixel variance (accounts for compression)
7. Timing accuracy: playback within 33ms of export timestamps
8. Documentation: known parity gaps and reasons

**Prerequisites:** Story 5.6

---

### Story 5.8: Real-Time Performance Optimization

**Goal:** Achieve consistent 30 FPS playback with complex timelines.

**As a user,**
I want smooth playback even with multi-track compositions,
So that I can edit without lag or stuttering.

**Acceptance Criteria:**
1. Frame rate monitoring in dev mode shows FPS during playback
2. Maintain 30 FPS with 3+ video tracks + 4+ audio tracks
3. Decode-ahead buffer for upcoming clips (500ms ahead)
4. Frame dropping strategy for performance degradation (skip, not freeze)
5. Memory usage < 1GB for typical 5-minute timeline
6. CPU usage < 80% on MacBook Pro (2020+)
7. Smooth scrubbing through timeline (< 100ms seek latency)
8. Performance profiling documented in architecture.md

**Prerequisites:** Story 5.7

---

## Architecture Considerations (ADR-008 Preview)

### Approach Comparison

#### Approach A: Real-Time MPV Switching + External Audio Mixing
**How it works:**
- MPV plays one video clip at a time
- Rust service switches MPV source at clip boundaries
- External audio library (rodio/cpal) mixes multiple audio streams
- Canvas/WebGL composites video frames in frontend

**Pros:**
- ✅ No pre-rendering delay
- ✅ Immediate playback start
- ✅ Low disk usage (no temp files)

**Cons:**
- ❌ Complex synchronization between MPV + audio mixer
- ❌ Frame drops during clip switching
- ❌ GPU compositing adds complexity

**Estimated Effort:** High (6-8 weeks)

---

#### Approach B: FFmpeg Pre-Render to Temp File
**How it works:**
- User presses play → FFmpeg renders composition to temp MP4
- MPV plays pre-rendered file
- Delete temp file when timeline changes

**Pros:**
- ✅ Simple architecture (reuse export pipeline)
- ✅ Perfect synchronization (already rendered)
- ✅ No real-time compositing complexity

**Cons:**
- ❌ Render delay before playback starts (5-30 seconds for 1-minute timeline)
- ❌ High disk I/O (write temp file, read for playback)
- ❌ Poor scrubbing experience (must re-render on seeks)

**Estimated Effort:** Medium (3-4 weeks)

---

#### Approach C: Hybrid - Smart Segment Pre-Rendering (RECOMMENDED)
**How it works:**
- Detect "simple" timeline segments (single clip, no compositing)
- Play simple segments directly via MPV
- Pre-render "complex" segments (multi-track, gaps) to temp cache
- Seamlessly switch between direct play and cached segments

**Pros:**
- ✅ Best of both worlds: instant start for simple clips
- ✅ Perfect sync for complex compositing
- ✅ Minimal disk usage (cache only complex parts)
- ✅ Graceful degradation (show progress bar during render)

**Cons:**
- ⚠️ More complex logic (segment analysis, cache management)
- ⚠️ Cache invalidation when timeline changes

**Estimated Effort:** Medium-High (4-6 weeks)

**Recommendation:** Start with Approach C for best UX/complexity balance.

---

## Technical Challenges & Mitigations

### Challenge 1: Real-Time Audio Mixing
**Problem:** MPV can only play one audio source at a time.

**Solutions:**
1. FFmpeg audio mixing filter (requires pre-render)
2. External audio library (rodio/cpal) for real-time mixing
3. Web Audio API (frontend mixing, may have latency)

**Recommended:** FFmpeg audio mixing in smart segment pre-render (Approach C)

---

### Challenge 2: Multi-Track Video Compositing
**Problem:** Real-time video compositing is computationally expensive.

**Solutions:**
1. FFmpeg overlay filter (pre-render segments)
2. GPU-accelerated compositor (Metal on macOS)
3. Canvas/WebGL rendering in frontend

**Recommended:** FFmpeg overlay filter for Approach C (acceptable latency with smart caching)

---

### Challenge 3: Frame-Accurate Clip Transitions
**Problem:** Switching MPV source has 50-200ms latency.

**Solutions:**
1. Pre-decode next clip in background
2. Accept small gap (< 100ms) in timeline
3. Pre-render multi-clip sequences

**Recommended:** Pre-render complex segments to avoid switching latency

---

### Challenge 4: Scrubbing Performance
**Problem:** Seeking in pre-rendered temp file is slow.

**Solutions:**
1. Generate keyframe-only temp files (I-frame only)
2. Cache multiple pre-rendered segments at different positions
3. Accept degraded scrubbing (show "rendering preview" spinner)

**Recommended:** Keyframe-only temp files + progress indicator for complex segments

---

## Dependencies & Risks

### Dependencies
- ✅ Epic 4 complete (multi-track timeline, audio mixing foundation)
- ✅ FFmpeg export pipeline working (Story 1.9)
- ✅ MPV playback foundation (Story 1.3.5)
- ✅ Timeline state management (Story 3.1)

### Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Real-time compositing too slow | High | Use Approach C (pre-render complex segments) |
| Audio sync issues | Medium | Extensive testing with different track counts |
| Disk space for temp files | Low | Cache cleanup, user settings for cache size |
| Memory leaks in long timelines | Medium | Profiling + benchmarks in Story 5.8 |

---

## Success Criteria for Epic

1. **Feature Completeness:**
   - ✅ Plays through 3+ clips on single track without gaps
   - ✅ Handles gaps with black frames
   - ✅ Mixes 2+ audio tracks in real-time
   - ✅ Composites 2+ video tracks (PiP preview)

2. **Performance:**
   - ✅ 30 FPS playback with 3 video + 4 audio tracks
   - ✅ < 100ms latency for play/pause/seek
   - ✅ < 1GB memory usage for 5-minute timeline

3. **Parity:**
   - ✅ Visual/audio output matches export within 5% variance
   - ✅ Timeline timestamps accurate within 33ms (1 frame)

4. **User Experience:**
   - ✅ No manual intervention needed for multi-clip playback
   - ✅ Clear visual feedback during rendering (if any)
   - ✅ Keyboard shortcuts work during composition playback

---

## Implementation Sequence

### Phase 1: Foundation (Stories 5.1-5.2)
- Research and architecture decisions
- Composition state management
- **Duration:** 1 week

### Phase 2: Single-Track Playback (Stories 5.3-5.4)
- Sequential clip playback
- Gap handling
- **Duration:** 1-2 weeks

### Phase 3: Multi-Track Support (Stories 5.5-5.6)
- Audio mixing
- Video compositing
- **Duration:** 2-3 weeks

### Phase 4: Polish & Optimization (Stories 5.7-5.8)
- Export parity validation
- Performance optimization
- **Duration:** 1 week

**Total Estimated Duration:** 5-7 weeks

---

## Next Steps

1. ✅ Document this plan (this file)
2. ⏳ Review with zeno for approval
3. ⏳ Create ADR-008 for chosen approach
4. ⏳ Update epics.md with Epic 5 (renumber AI to Epic 6)
5. ⏳ Create Story 5.1 implementation file
6. ⏳ Begin architecture research phase

---

## Questions for Discussion

1. **Performance Target:** Is 30 FPS acceptable, or should we target 60 FPS?
2. **Approach:** Agree on Approach C (Hybrid Smart Segments)?
3. **Timeline:** Is 5-7 weeks acceptable before starting Epic 6 (AI)?
4. **Scope:** Should this epic include transitions (fade, crossfade)?
5. **Priority:** Any stories that can be deferred to post-Epic 6?

---

## References

- **ADR-007:** Playback Mode Architecture (Preview vs Timeline)
- **Story 1.7:** Timeline Playback Synchronization (foundation)
- **Story 1.9:** FFmpeg Integration & Export (composition works in export)
- **Story 3.1-3.10:** Multi-Track Timeline & Editing Maturity
- **Epic 4:** Advanced Recording (multi-audio foundation)

