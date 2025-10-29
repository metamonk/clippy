# Sprint Change Proposal: Player Focus Context System Implementation

**Date:** 2025-10-28
**Author:** Correct-Course Workflow (BMM)
**Project:** clippy
**Epic:** Epic 1 - Foundation & TRUE MVP
**Change Scope:** Minor (architectural clarification, 2-4 hours)

---

## Section 1: Issue Summary

### Problem Statement

The clippy architecture documented a **Player Focus Context System** in ADR-007 (architecture.md lines 2017-2085) on 2025-10-28, but marked it as "Pending implementation". This architectural pattern defines how the video player should automatically switch between **Preview Mode** (independent source file playback) and **Timeline Mode** (timeline composition playback) based on user interaction context.

The current implementation is incomplete:
- ✅ **EXISTS:** `mode: 'preview' | 'timeline'` field in playerStore (line 27)
- ✅ **EXISTS:** `setMode()` action in playerStore (line 60)
- ❌ **MISSING:** Automatic mode-switching logic based on user context
- ❌ **MISSING:** `focusContext` field to track last user interaction
- ❌ **MISSING:** `sourceVideo` field to separate preview source from timeline clips

This creates architectural ambiguity: the system has two modes but no clear mechanism for when/how to switch between them.

### Discovery Context

Discovered during post-Epic 1 architecture review when planning Epic 2 (Recording Foundation). The issue became apparent when examining how imported recordings should behave:
- Should clicking a recording in the media library play it independently? (Preview Mode)
- Should clicking play on the timeline play the timeline composition? (Timeline Mode)

Without the Focus Context System, the answer is ambiguous.

### Evidence

1. **ADR-007 Documentation** (architecture.md:2017-2085):
   - Status: "Pending implementation (2025-10-28)"
   - Documents `focusContext` and `sourceVideo` fields (not implemented)
   - Documents mode-switching rules (not implemented)

2. **Current playerStore Implementation** (src/stores/playerStore.ts:27):
   ```typescript
   mode: 'preview' | 'timeline'  // ✅ Field exists
   setMode: (mode) => void       // ✅ Action exists
   // ❌ focusContext field missing
   // ❌ sourceVideo field missing
   // ❌ Automatic switching logic missing
   ```

3. **MediaItem Component** (src/components/media-library/MediaItem.tsx:56):
   ```typescript
   usePlayerStore.getState().setMode('preview'); // ✅ Manually sets mode
   ```
   - Only place mode is set
   - No Timeline component sets `mode='timeline'`

4. **Story 1.4 AC #2:** "Video plays **independently** when selected from media library"
   - Currently works, but architectural mechanism is unclear

---

## Section 2: Impact Analysis

### Epic Impact

**Epic 1: Foundation & TRUE MVP**
- ✅ Status: Complete (stories 1-10 done, 1-11 & 1-12 in review)
- ⚠️ **Issue:** Architectural pattern documented but not fully implemented
- 📋 **Action Needed:** Complete ADR-007 implementation, update status to "Implemented"
- 💡 **Benefit:** Clean architectural foundation before Epic 2-5

**Epic 2: Recording Foundation**
- Impact: None (recordings use preview mode by default)
- Auto-imported recordings will play in preview mode ✓

**Epic 3: Multi-Track Timeline & Editing Maturity**
- Impact: **HIGH**
- Timeline playback composition will require `mode='timeline'`
- Focus Context System must be in place before this epic begins
- Without it, ambiguity between "preview clip" vs "play composition"

**Epic 4 & 5:**
- Impact: None (use preview mode)

### Artifact Conflicts

**PRD (docs/PRD.md)**
- **FR006 (lines 48-53):** Documents Preview Mode and Timeline Mode
- **Gap:** Doesn't specify HOW mode switching works
- **Recommendation:** Add note that mode switching is automatic based on user's last interaction context

**Architecture Document (docs/architecture.md)**
- **ADR-007 (lines 2017-2085):** Fully documents the pattern but marked "Pending"
- **playerStore Interface (line 2041-2051):** Documents `focusContext` and `sourceVideo` fields (not in implementation)
- **Mode Switching Logic (lines 2054-2058):** Documents rules (not implemented)
- **Component Updates (lines 2060-2063):** Partially implemented (MediaItem ✓, Timeline ✗)

**Stories**
- **Story 1.4 (Video Preview Player):** References ADR-007, notes mode architecture
- **Story 1.7 (Timeline Playback Sync):** References ADR-007, but timeline mode switching not implemented

### Technical Impact

**Code Changes Required:**
- `src/stores/playerStore.ts` - Add 2 fields, update 1 action
- `src/components/media-library/MediaItem.tsx` - Already sets mode, add focusContext
- `src/components/timeline/Timeline.tsx` - Add focusContext='timeline' (deferred to Epic 3 if not needed yet)
- `docs/architecture.md` - Update ADR-007 status

**Testing Impact:**
- Add ~5 unit tests for focusContext behavior
- Update existing playerStore tests

**Infrastructure Impact:** None

---

## Section 3: Recommended Approach

### Selected Path: **Option 1 - Direct Adjustment**

**Rationale:**
- ✅ Completes existing architectural pattern (ADR-007)
- ✅ Minimal code changes (2 fields + component updates)
- ✅ No breaking changes to existing functionality
- ✅ Improves clarity before Epic 3
- ✅ Low risk, low effort (2-4 hours)
- ✅ Prevents future confusion

**Effort Estimate:** 2-4 hours
**Risk Level:** Low
**Timeline Impact:** None (can be implemented as tech debt cleanup)

**Trade-offs:**
- **Pro:** Clean architectural foundation
- **Pro:** User experience becomes more intuitive
- **Pro:** Prevents Epic 3 implementation confusion
- **Con:** Adds 2 fields to playerStore (minimal overhead)

---

## Section 4: Detailed Change Proposals

### Change Proposal 1: Update playerStore Interface

**File:** `src/stores/playerStore.ts`

**OLD (lines 10-30):**
```typescript
interface PlayerStore {
  currentVideo: MediaFile | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playheadPosition: number;
  mode: 'preview' | 'timeline';
  seekTarget: number | null;

  setCurrentVideo: (video: MediaFile | null) => void;
  // ... other actions
}
```

**NEW:**
```typescript
interface PlayerStore {
  currentVideo: MediaFile | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playheadPosition: number;
  mode: 'preview' | 'timeline';
  seekTarget: number | null;

  /** Focus context: tracks last user interaction (library vs timeline) */
  focusContext: 'source' | 'timeline';

  /** Source video for preview mode (independent of timeline) */
  sourceVideo: MediaFile | null;

  setCurrentVideo: (video: MediaFile | null) => void;
  setFocusContext: (context: 'source' | 'timeline') => void;
  // ... other actions
}
```

**Rationale:** Adds `focusContext` to track user's last interaction and `sourceVideo` to separate preview source from timeline clips. This enables automatic mode derivation: `focusContext='source' → mode='preview'`, `focusContext='timeline' → mode='timeline'`.

---

### Change Proposal 2: Update playerStore Implementation

**File:** `src/stores/playerStore.ts`

**OLD (lines 72-88):**
```typescript
export const usePlayerStore = create<PlayerStore>()(
  devtools(
    (set) => ({
      currentVideo: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playheadPosition: 0,
      mode: 'preview',
      seekTarget: null,

      setCurrentVideo: (video) =>
        set({
          currentVideo: video,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          playheadPosition: 0,
          seekTarget: null,
        }),
```

**NEW:**
```typescript
export const usePlayerStore = create<PlayerStore>()(
  devtools(
    (set) => ({
      currentVideo: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playheadPosition: 0,
      mode: 'preview',
      seekTarget: null,
      focusContext: 'source',     // Default: source (preview mode)
      sourceVideo: null,

      setCurrentVideo: (video) =>
        set({
          currentVideo: video,
          sourceVideo: video,      // Update source video for preview
          focusContext: 'source',  // Set focus to source
          mode: 'preview',         // Automatically derive mode
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          playheadPosition: 0,
          seekTarget: null,
        }),

      setFocusContext: (context) =>
        set({
          focusContext: context,
          mode: context === 'source' ? 'preview' : 'timeline'
        }),
```

**Rationale:** Implements automatic mode derivation from focusContext. When `setCurrentVideo()` is called (media library click), it automatically sets `focusContext='source'` and `mode='preview'`. Future timeline play button will call `setFocusContext('timeline')` to switch to timeline mode.

---

### Change Proposal 3: Update MediaItem Component

**File:** `src/components/media-library/MediaItem.tsx`

**OLD (lines 48-58):**
```typescript
const { currentVideo, setCurrentVideo } = usePlayerStore();

const handleClick = () => {
  if (onClick) {
    onClick(mediaFile);
    return;
  }

  usePlayerStore.getState().setMode('preview');
  setCurrentVideo(mediaFile);
};
```

**NEW:**
```typescript
const { currentVideo, setCurrentVideo } = usePlayerStore();

const handleClick = () => {
  if (onClick) {
    onClick(mediaFile);
    return;
  }

  // Focus Context System: setCurrentVideo automatically sets focusContext='source' → mode='preview'
  // No need for explicit setMode call
  setCurrentVideo(mediaFile);
};
```

**Rationale:** Uses Focus Context System. Explicit `setMode('preview')` call is now unnecessary because `setCurrentVideo()` automatically sets `focusContext='source'` which derives `mode='preview'`. Makes the intent clear: "I'm interacting with the library (source), so play this independently (preview)."

---

### Change Proposal 4: Update ADR-007 in Architecture Document

**File:** `docs/architecture.md`

**OLD (lines 2082-2085):**
```markdown
**Status:** Pending implementation (2025-10-28)

**Date:** 2025-10-28
```

**NEW:**
```markdown
**Status:** Implemented (2025-10-28)

**Implementation:**
- `focusContext: 'source' | 'timeline'` field added to playerStore
- `sourceVideo: MediaFile | null` field added to playerStore
- Automatic mode derivation: focusContext → mode mapping
- MediaItem component sets `focusContext='source'` on click
- Future Timeline component will set `focusContext='timeline'` on play (Epic 3)

**Rules Implemented:**
- Library interactions → `focusContext='source'` → `mode='preview'`
- Timeline interactions → `focusContext='timeline'` → `mode='timeline'`
- Play button respects current focusContext
- Last interaction wins (implicit, no manual toggle required)

**Date:** 2025-10-28
**Implementation Date:** 2025-10-28
```

**Rationale:** Documents the completed implementation, clarifies the pattern for future developers, removes "Pending" status.

---

### Change Proposal 5: Add PRD Clarification

**File:** `docs/PRD.md`

**OLD (lines 48-53):**
```markdown
**FR006: Real-Time Video Preview and Playback**
- System shall provide **Preview Mode** for playing selected media files independently with basic controls (play/pause, seek, scrub)
- System shall provide **Timeline Mode** for rendering multi-track composition with PiP overlays in real-time preview window
- System shall use single MPV (libmpv) playback engine with mode switching for resource efficiency
- System shall maintain 30+ FPS playback and frame-accurate seeking (<33ms precision) in both modes
```

**NEW:**
```markdown
**FR006: Real-Time Video Preview and Playback**
- System shall provide **Preview Mode** for playing selected media files independently with basic controls (play/pause, seek, scrub)
- System shall provide **Timeline Mode** for rendering multi-track composition with PiP overlays in real-time preview window
- System shall automatically switch between modes based on user's last interaction context: library interactions activate Preview Mode, timeline interactions activate Timeline Mode
- System shall use single MPV (libmpv) playback engine with automatic mode switching for resource efficiency
- System shall maintain 30+ FPS playback and frame-accurate seeking (<33ms precision) in both modes
```

**Rationale:** Clarifies WHEN mode switching happens (automatic based on user context, not manual toggle).

---

### Change Proposal 6: Add Unit Tests

**File:** `src/stores/playerStore.test.ts`

**NEW Tests to Add:**
```typescript
describe('focusContext behavior', () => {
  it('should default to source focus context', () => {
    const { focusContext } = usePlayerStore.getState();
    expect(focusContext).toBe('source');
  });

  it('should set focusContext to source when video selected', () => {
    const { setCurrentVideo } = usePlayerStore.getState();
    setCurrentVideo(mockMediaFile);

    const { focusContext, mode } = usePlayerStore.getState();
    expect(focusContext).toBe('source');
    expect(mode).toBe('preview');
  });

  it('should update mode when focusContext changes', () => {
    const { setFocusContext } = usePlayerStore.getState();

    setFocusContext('timeline');
    expect(usePlayerStore.getState().mode).toBe('timeline');

    setFocusContext('source');
    expect(usePlayerStore.getState().mode).toBe('preview');
  });

  it('should maintain sourceVideo separately from currentVideo', () => {
    const { setCurrentVideo } = usePlayerStore.getState();
    setCurrentVideo(mockMediaFile);

    const { currentVideo, sourceVideo } = usePlayerStore.getState();
    expect(sourceVideo).toBe(mockMediaFile);
    expect(currentVideo).toBe(mockMediaFile);
  });
});
```

**Rationale:** Validates Focus Context System behavior, ensures mode derivation works correctly.

---

## Section 5: Implementation Handoff

### Change Scope Classification: **Minor**

**Justification:**
- Additive changes only (no breaking changes)
- 2-4 hours implementation + testing
- No user-facing feature changes
- Architectural clarification within existing Epic 1 scope

### Handoff Recipients

**Primary: Development Team**
- **Deliverables:**
  - Updated playerStore with focusContext and sourceVideo
  - Updated MediaItem component
  - Updated architecture.md ADR-007
  - Updated PRD.md FR006
  - New unit tests (5 tests)
- **Timeline:** 2-4 hours
- **Success Criteria:**
  - All tests passing
  - ADR-007 marked "Implemented"
  - focusContext automatically set on media library interaction
  - Mode automatically derived from focusContext

**Secondary: Architect (Winston)**
- **Deliverables:** Review and approve ADR-007 updates
- **Timeline:** 30 minutes

**Awareness Only:**
- **Scrum Master:** No backlog changes needed
- **Product Manager:** No product scope impact

### Implementation Tasks

1. **[2 hours] Update playerStore** (src/stores/playerStore.ts)
   - Add `focusContext: 'source' | 'timeline'` field with default 'source'
   - Add `sourceVideo: MediaFile | null` field
   - Add `setFocusContext(context)` action
   - Update `setCurrentVideo()` to set focusContext='source' and sourceVideo
   - Implement automatic mode derivation in setFocusContext

2. **[30 min] Update MediaItem** (src/components/media-library/MediaItem.tsx)
   - Remove explicit `setMode('preview')` call (now handled by setCurrentVideo)
   - Add comment documenting Focus Context System behavior

3. **[1 hour] Add Tests** (src/stores/playerStore.test.ts)
   - Add 5 unit tests for focusContext behavior
   - Validate mode derivation logic
   - Validate sourceVideo separation

4. **[30 min] Update Documentation**
   - Update ADR-007 status to "Implemented"
   - Add implementation details and rules
   - Update PRD FR006 with mode-switching clarification

### Success Criteria

- ✅ All existing tests continue to pass
- ✅ 5 new focusContext tests pass
- ✅ ADR-007 status updated to "Implemented"
- ✅ Clicking media library item sets focusContext='source' and mode='preview'
- ✅ `sourceVideo` field tracks preview source independently
- ✅ Code compiles with no TypeScript errors
- ✅ Ready for Epic 3 timeline mode implementation

---

## Appendix: Alternatives Considered

### Alternative 1: Do Nothing (Defer to Epic 3)
- **Pros:** No immediate work required
- **Cons:** Architectural confusion carries forward, Epic 3 implementation becomes ambiguous
- **Verdict:** ❌ Rejected - Technical debt compounds, better to address now

### Alternative 2: Explicit Mode Toggle UI
- **Pros:** User has full control
- **Cons:** Extra UI complexity, adds cognitive load, against UX principle of "automatic workflows"
- **Verdict:** ❌ Rejected - Focus Context System (automatic) is more intuitive

### Alternative 3: Remove Mode Concept Entirely
- **Pros:** Simpler mental model
- **Cons:** Cannot support both preview and timeline playback with single MPV instance
- **Verdict:** ❌ Rejected - Violates architectural decision to use single MPV instance (resource efficiency)

---

**Proposal prepared by:** BMM Correct-Course Workflow
**Date:** 2025-10-28
**Total Effort Estimate:** 2-4 hours
**Risk Level:** Low
**Recommended Action:** Approve and implement before Epic 2 begins
