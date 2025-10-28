# Technical Debt

This document tracks known technical debt items in the clippy project, including their priority, impact, and remediation strategies.

---

## TD-001: Implement Playback Mode Switching

**Priority:** High
**Discovered:** 2025-10-28 during Story 1.4 implementation
**Impact:** UX - users cannot preview videos independently of timeline

**Description:**

VideoPlayer currently always synchronizes with timeline, preventing independent preview of media library videos. When a user clicks a video in the media library, they expect to watch it independently - but the current implementation ties playback to timeline playhead movement, even when no clips exist on the timeline.

This breaks the fundamental UX expectation for video preview functionality (AC #2 in Story 1.4: "Video plays independently when selected from media library").

**Root Cause:**

The VideoPlayer component lacks mode distinction between:
1. **Preview Mode:** Play selected media files independently (Story 1.4)
2. **Timeline Mode:** Play timeline composition synchronized with playhead (Story 1.7)

**Solution:**

Implement mode-aware architecture with 'preview' | 'timeline' modes. See ADR-007 in architecture.md for complete design, which includes:

- Add `mode` field to `playerStore` ('preview' | 'timeline')
- Add `setMode` action to playerStore
- Update `MediaItem.tsx` to set mode to 'preview' on click
- Update `VideoPlayer.tsx` to check mode before timeline synchronization
- Timeline play button (future) sets mode to 'timeline'

**Effort:** ~2 hours
**Stories Affected:** 1.4 (partial completion blocked), 1.7 (proper implementation blocked)

**Remediation Steps:**

1. Update `src/stores/playerStore.ts` - add mode field and setMode action (30 min)
2. Update `src/components/media-library/MediaItem.tsx` - call setMode('preview') on click (15 min)
3. Update `src/components/player/VideoPlayer.tsx` - respect mode for timeline sync (30 min)
4. Test both preview and timeline modes (20 min)
5. Update documentation (10 min)

**Status:** ✅ **Resolved** (2025-10-28)
**Assigned To:** Amelia (Dev Agent)
**Related ADR:** ADR-007 (Playback Mode Architecture)

**Resolution Notes:**
- Implemented mode-aware architecture as specified in ADR-007
- Added `mode: 'preview' | 'timeline'` field to playerStore
- MediaItem sets mode to 'preview' on click
- VideoPlayer respects mode for timeline synchronization
- All tests passing, video preview works independently

---

## TD-002: MPV Dimension Retrieval Issue

**Priority:** High
**Discovered:** 2025-10-28 during Story 1.4 testing
**Impact:** UX - Video loading blocked, 10-second timeout errors

**Description:**

MPV dimension retrieval was failing with `Raw(-10)` MPV_ERROR_PROPERTY_UNAVAILABLE, causing video loading to timeout after 10 seconds with errors. Issue affected all video codecs (H.264, HEVC, ProRes, VP9).

**Root Cause:**

Initial MPV configuration used `vo=libmpv` and `vo=gpu` video outputs which require GUI/render contexts. These outputs don't work in headless environments and never fire the `VideoReconfig` event needed for dimension availability.

**Solution:**

Switched to headless MPV configuration:
- `vo=null` - No video output window
- `force-window=no` - Prevent window creation
- `audio=no` - Disable audio output
- Wait only for `FileLoaded` event (not VideoReconfig)

**Effort:** 4 hours (research + implementation + testing)
**Stories Affected:** 1.4 (video playback blocked)

**Remediation Steps:**
1. ✅ Configure MPV with headless settings (vo=null, force-window=no, audio=no)
2. ✅ Simplify load_file() to wait only for FileLoaded event
3. ✅ Test with all codecs (H.264, HEVC, ProRes, VP9)
4. ✅ Fix UI layout (added min-h-0, overflow-hidden to PreviewPanel)

**Status:** ✅ **Resolved** (2025-10-28)
**Assigned To:** Amelia (Dev Agent)
**Related Files:**
- `src-tauri/src/services/mpv_player.rs` - Headless MPV config
- `src/components/layout/PreviewPanel.tsx` - UI layout fix
**Reference:** `docs/HANDOFF-PLAYBACK-MODE-DEBUG-2025-10-28.md`

---

## TD-003: Video Player Missing Seek/Scrub Functionality

**Priority:** Medium
**Discovered:** 2025-10-28 during Story 1.4 final testing
**Impact:** UX - Users cannot scrub through video or restart playback

**Description:**

The video player currently only has play/pause controls. Users cannot:
- Scrub through the video to a specific time
- Restart the video after it finishes
- Seek backward or forward

**Root Cause:**

Story 1.4 ACs only required basic play/pause controls. Seek/scrub functionality was not in scope for the MVP player implementation.

**Solution:**

Add seek controls to PlayerControls component:
- Add progress bar/timeline slider showing current position
- Make slider interactive for scrubbing
- Add restart button or auto-restart on video end
- Keyboard shortcuts: Arrow keys for seeking

**Effort:** ~3 hours
**Stories Affected:** 1.4 (feature gap - non-blocking)

**Remediation Steps:**
1. Add Slider component from shadcn/ui (15 min)
2. Implement progress bar in PlayerControls with current time position (1 hour)
3. Add onChange handler to seek MPV player on scrub (30 min)
4. Add keyboard shortcuts for seeking (30 min)
5. Add restart button or end-of-video behavior (30 min)
6. Test scrubbing accuracy and responsiveness (30 min)

**Status:** Pending
**Assigned To:** TBD
**Priority Justification:** Medium - UX improvement but not blocking core functionality

---

## TD-004: Video Playback Stops 1 Second Before End ✅ RESOLVED

**Priority:** Low
**Discovered:** 2025-10-28 during Story 1.4 final testing
**Resolved:** 2025-10-28 via Story 1.12
**Impact:** UX - Video appeared to not reach true end position

**Description:**

When playing videos, the time display showed "0:04 / 0:05" near the end, making it appear that playback stopped 1 second early.

**Root Cause (IDENTIFIED):**

This was a **display rounding issue**, not an actual playback issue:

1. **Backend Behavior:** MPV correctly plays to the last video frame (~4.967s for 5s videos). This is normal - video frames stop at 4.967s, while container metadata reports 5.000s duration due to rounding and timing precision.

2. **Display Issue:** The `formatTime()` function in `src/lib/utils/timeUtils.ts` used `Math.floor()` to round seconds, causing:
   - 4.967s → Math.floor(4.967) = 4s → displayed as "0:04"
   - 5.000s → Math.floor(5.000) = 5s → displayed as "0:05"
   - Result: User sees "0:04 / 0:05" and thinks playback stopped 1 second early

3. **Actual Discrepancy:** Only 33ms (0.033s) between last frame (4.967s) and container duration (5.000s), which is normal for digital video.

**Solution (IMPLEMENTED):**

Changed `formatTime()` from `Math.floor()` to `Math.round()`:
- 4.967s → Math.round(4.967) = 5s → displays as "0:05"
- Now shows "0:05 / 0:05" instead of "0:04 / 0:05"

**Additional Changes:**
- Changed MPV `keep-open` from "yes" to "always" (no functional change observed)
- Added diagnostic logging to `get_time()` and `get_duration()` methods for future debugging

**Files Modified:**
- `src/lib/utils/timeUtils.ts` - Fixed formatTime() rounding
- `src-tauri/src/services/mpv_player.rs` - Updated keep-open setting, added diagnostic logging
- `src/test/setup.ts` - Fixed TypeScript error (global → globalThis)

**Testing:**
- Verified with all codecs (H.264, HEVC, ProRes, VP9)
- All reach 99%+ completion (4.967s / 5.000s)
- Display now correctly shows "0:05 / 0:05"

**Status:** ✅ RESOLVED
**Resolved By:** Story 1.12
**Effort Actual:** ~1.5 hours (investigation + fix + testing)

---

## How to Add Technical Debt Items

When adding new technical debt items, use the following template:

```markdown
## TD-XXX: [Title]

**Priority:** High | Medium | Low
**Discovered:** YYYY-MM-DD during [story/feature]
**Impact:** [Performance | UX | Security | Maintainability] - brief description

**Description:**
Detailed description of the technical debt issue.

**Root Cause:**
Explanation of why this debt exists.

**Solution:**
Proposed approach to address the debt.

**Effort:** Estimated time
**Stories Affected:** List of affected stories

**Remediation Steps:**
1. Step 1
2. Step 2
...

**Status:** Pending | In Progress | Resolved
**Assigned To:** Name or TBD
**Related ADR:** ADR reference if applicable
```
