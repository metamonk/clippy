# Story 3.1: Multi-Track Timeline Foundation

Status: drafted

## Story

As a user,
I want to work with multiple timeline tracks (at least 2),
so that I can layer video clips and create picture-in-picture effects.

## Acceptance Criteria

1. Timeline UI shows minimum 2 tracks (Track 1: main video, Track 2: overlay/PiP)
2. Each track has independent playhead and clip containers
3. Can drag clips onto either track from media library
4. Tracks render in proper layering order (Track 2 overlays Track 1)
5. Preview player composites both tracks correctly
6. Track labels/headers identify each track
7. Future-ready for expanding to 4+ tracks

## Tasks / Subtasks

- [ ] Extend timeline data model to support multiple tracks (AC: 1, 2, 7)
  - [ ] Update `Track` interface in src/types/timeline.ts to include track number and type fields
  - [ ] Update `Timeline` interface to support array of tracks
  - [ ] Update timelineStore (src/stores/timelineStore.ts) to handle multiple tracks
  - [ ] Ensure track IDs remain unique (UUID generation)
  - [ ] Add track ordering logic (Track 1 = bottom layer, Track 2 = overlay)

- [ ] Update Timeline component UI to render multiple tracks (AC: 1, 6)
  - [ ] Modify src/components/timeline/Timeline.tsx to render 2 tracks vertically stacked
  - [ ] Add track labels/headers showing "Track 1" and "Track 2"
  - [ ] Implement visual separation between tracks (borders, spacing)
  - [ ] Ensure each track has sufficient height for clip visibility
  - [ ] Update Konva canvas layout to accommodate multiple track layers

- [ ] Implement clip drag-and-drop for multi-track (AC: 3)
  - [ ] Update MediaItem.tsx to support dragging clips to specific tracks
  - [ ] Implement drop zone detection for Track 1 vs Track 2
  - [ ] Add visual feedback showing which track will receive the clip
  - [ ] Update timelineStore actions (addClip) to accept trackId parameter
  - [ ] Ensure clips can only be dropped on valid track areas

- [ ] Implement track layering and compositing (AC: 4, 5)
  - [ ] Update playback rendering logic to composite both tracks
  - [ ] Implement z-index/layering: Track 2 overlays Track 1
  - [ ] For now, Track 2 renders as full overlay (PiP positioning deferred to Epic 4)
  - [ ] Update VideoPlayer.tsx or create TimelinePlayer.tsx to handle multi-track playback
  - [ ] Ensure playhead synchronization works across both tracks
  - [ ] Handle track transparency/alpha blending if needed

- [ ] Update existing timeline operations for multi-track (AC: 2, 3)
  - [ ] Verify trim functionality works on clips in both tracks
  - [ ] Ensure playhead updates work for both tracks
  - [ ] Update split clip functionality (Epic 3 future) to be track-aware
  - [ ] Ensure delete clip operations target correct track
  - [ ] Test timeline zoom/scroll with multiple tracks

- [ ] Add tests for multi-track timeline (AC: 1-7)
  - [ ] Unit test: timelineStore handles multiple tracks correctly
  - [ ] Unit test: Clip addition to specific track
  - [ ] Unit test: Track layering order preserved
  - [ ] Integration test: Drag clip to Track 2, verify correct placement
  - [ ] Integration test: Play timeline with clips on both tracks, verify composition
  - [ ] Visual test: Verify UI shows 2 distinct tracks with labels

## Dev Notes

### Architecture Context

**Current State (Epic 1 Complete):**
- Single-track timeline foundation established in Story 1.6
- Timeline uses Konva.js canvas for rendering (src/components/timeline/)
- Timeline state managed by Zustand (src/stores/timelineStore.ts)
- Clips can be dragged from media library onto timeline
- Playback synchronized between timeline and video player

**Epic 3 Goal:**
Transform the single-track timeline into a professional multi-track editor capable of handling complex compositions with layered video clips, essential for picture-in-picture workflows (Epic 4) and advanced editing.

**Technology Stack:**
- **Frontend Framework:** React 19 + TypeScript
- **Canvas Library:** Konva.js (react-konva wrapper)
- **State Management:** Zustand (timelineStore)
- **Video Player:** MPV via libmpv2 (headless mode)
- **Styling:** Tailwind CSS

**Key Architecture Patterns:**

From architecture.md (lines 847-930):
- Zustand immutable state updates
- Konva.js dirty region detection for 60 FPS rendering
- Single MPV instance for playback (mode-aware: preview vs timeline)

From PRD NFR001 (Performance):
- Video playback must maintain 30+ FPS
- Timeline rendering target: 60 FPS UI interactions

**Data Model Changes:**

Current single-track model (src/types/timeline.ts):
```typescript
interface Track {
  id: string;
  clips: Clip[];
  trackType: 'video' | 'audio';
}
```

**Enhanced multi-track model:**
```typescript
interface Track {
  id: string;
  trackNumber: number;       // NEW: 1, 2, 3, 4...
  clips: Clip[];
  trackType: 'video' | 'audio';
  label?: string;            // NEW: "Track 1", "Track 2"
  isVisible?: boolean;       // NEW: Track visibility toggle (future)
}

interface Timeline {
  tracks: Track[];           // Array of tracks, ordered by trackNumber
  totalDuration: number;
}
```

**Layering Architecture:**

Track rendering order:
- Track 1 (trackNumber: 1) = Base layer (full screen)
- Track 2 (trackNumber: 2) = Overlay layer (PiP in Epic 4)
- Track 3+ (future) = Additional overlays

For Story 3.1 scope:
- Track 2 renders as full overlay on Track 1 (simple alpha blend)
- PiP sizing/positioning deferred to Epic 4

**Compositing Approach:**

Option 1: Frontend Canvas Composition (Recommended for Story 3.1)
- Konva.js canvas layers Track 1 and Track 2
- Track 2 clips render above Track 1 clips
- Simple visual layering, no actual video composition yet

Option 2: Backend FFmpeg Composition (Deferred to Epic 4)
- FFmpeg overlay filter for actual video compositing
- Required for real-time preview with PiP positioning
- More complex, better for Story 4.5+

**Decision for Story 3.1:** Use Option 1 (frontend canvas layering) to prove multi-track UI works. Real video compositing can be implemented in Epic 3 or 4 when needed for actual multi-track playback.

**Lessons Learned from Epic 1:**

From Story 1.12 completion notes:
- MPV headless configuration (`vo=null`) works well for backend playback control
- Time formatting utilities (formatTime) critical for user display
- Konva.js performs well for timeline rendering (60 FPS achievable)
- Zustand state management scales well with complexity

Key carry-overs:
- Keep MPV in headless mode (no changes needed to mpv_player.rs)
- Use event-based architecture (not polling) where possible
- Maintain frame-accurate seeking (<33ms precision)

### Project Structure Notes

**Files to Create:**
```
None - All components exist from Epic 1
```

**Files to Modify:**
```
src/types/timeline.ts                  [UPDATE: Add trackNumber, label to Track interface]
src/stores/timelineStore.ts            [UPDATE: Multi-track actions, track ordering]
src/components/timeline/Timeline.tsx    [UPDATE: Render 2 tracks, track headers]
src/components/timeline/TimelineTrack.tsx [UPDATE: Track-specific rendering, labels]
src/components/media-library/MediaItem.tsx [UPDATE: Drag target for specific tracks]
```

**Test Files:**
```
src/stores/timelineStore.test.ts       [UPDATE: Multi-track tests]
src/components/timeline/Timeline.test.tsx [ADD: Multi-track UI tests]
```

**Alignment with Architecture:**
- Timeline canvas architecture: architecture.md lines 117-127 (Timeline component structure)
- State management pattern: architecture.md lines 853-930 (Zustand best practices)
- Konva.js rendering: architecture.md lines 268-299 (Performance optimization)

**Naming Conventions:**
- TypeScript: camelCase for variables/functions, PascalCase for components
- Track IDs: UUID format (e.g., "track-uuid-1")
- Track numbers: Integer 1, 2, 3, 4...
- Track labels: "Track 1", "Track 2", etc.

**Known Technical Constraints:**

From architecture.md:
- Konva.js canvas rendering: Target 60 FPS UI interactions
- Zustand optimized re-renders via selectors
- Single MPV instance (mode: 'preview' | 'timeline')

From PRD:
- Multi-track support minimum 2 tracks, expandable to 4+ (Story 3.1 AC#7)
- Timeline must handle multiple clips per track (Story 3.2, next story)

### References

- [Source: docs/epics.md#Story 3.1: Multi-Track Timeline Foundation, lines 479-495]
- [Source: docs/architecture.md#Timeline Data Consistency, lines 1058-1129]
- [Source: docs/architecture.md#State Management Patterns (Zustand), lines 850-945]
- [Source: docs/PRD.md#FR005: Multi-Track Timeline Editor, lines 44-46]
- [Source: docs/PRD.md#NFR001: Performance, lines 76-80]
- [Source: docs/stories/1-6-single-track-timeline-foundation.md - Foundation reference]
- [Source: docs/stories/1-12-fix-video-playback-early-stop.md - Recent completion notes with lessons learned]

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

### Completion Notes List

### File List
