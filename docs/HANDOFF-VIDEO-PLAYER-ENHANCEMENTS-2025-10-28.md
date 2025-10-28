# Handoff: Video Player Enhancements - Seek/Scrub & Playback Issues

**Date:** 2025-10-28
**Session:** Post-MPV Bug Fix - Feature Enhancements
**Status:** Ready for implementation
**Next Agent:** Developer
**Priority:** Medium (TD-003), Low (TD-004)

---

## 🎯 Context

Story 1.4 (Video Preview Player) has been successfully implemented with MPV integration. The critical dimension retrieval bug has been resolved (see `SUMMARY-MPV-BUG-FIX-2025-10-28.md`). Video playback is working, but two minor UX issues remain:

1. **TD-003:** No seek/scrub controls (Medium priority)
2. **TD-004:** Video playback stops 1 second before end (Low priority)

These are **feature gaps and minor bugs**, not blockers. The player meets all Story 1.4 acceptance criteria, but lacks the polish expected in a professional video editor.

---

## 🚨 Issues to Address

### Issue 1: Missing Seek/Scrub Functionality (TD-003)

**Priority:** Medium
**Severity:** UX - Feature gap
**Impact:** Users cannot scrub through video or restart playback

**Current State:**
- ✅ Play/pause button works
- ✅ Time display shows current/duration (e.g., "0:02 / 0:05")
- ✅ Spacebar keyboard shortcut toggles play/pause
- ❌ No progress bar or timeline slider
- ❌ No way to seek to specific time
- ❌ No way to restart video after it ends
- ❌ No arrow key seeking shortcuts

**Expected Behavior:**
- Progress bar showing current position in video
- Interactive slider for scrubbing to any time
- Click on progress bar to jump to time
- Arrow keys for frame-by-frame or 5-second seeking
- Restart button or auto-restart when video ends

**Files to Modify:**
- `src/components/player/PlayerControls.tsx` - Add progress bar/slider UI
- `src/stores/playerStore.ts` - May need `seek()` action if not already present
- `src/components/player/VideoPlayer.tsx` - May need to handle seek commands

**Recommended Approach:**

1. **Add Slider Component** (15 min)
   - Use shadcn/ui Slider: `npx shadcn@latest add slider`
   - Or use native HTML5 `<input type="range">` for simplicity

2. **Implement Progress Bar** (1 hour)
   ```tsx
   // In PlayerControls.tsx
   const progress = (currentTime / duration) * 100;

   <Slider
     value={[progress]}
     onValueChange={(value) => handleSeek(value[0])}
     max={100}
     step={0.1}
     className="flex-1"
   />
   ```

3. **Add Seek Handler** (30 min)
   - Invoke `mpv_seek` Tauri command
   - Update playerStore currentTime
   - Handle seek during playback and pause

4. **Keyboard Shortcuts** (30 min)
   - Left/Right arrows: Seek -5s / +5s
   - Shift + Left/Right: Frame-by-frame (1/30s)
   - Home: Jump to start
   - End: Jump to end

5. **Restart/End Behavior** (30 min)
   - Option A: Add restart button next to play/pause
   - Option B: Auto-restart on video end
   - Option C: Show "replay" icon when at end

**Backend Support:**
Check if `mpv_seek` command exists in `src-tauri/src/commands/mpv.rs`:
```rust
#[tauri::command]
pub fn mpv_seek(state: State<MpvPlayerState>, time_seconds: f64) -> MpvResponse {
    // ...
}
```

If not present, add it using `mpv.seek()`.

**Testing:**
- Test scrubbing with all codec types (H.264, HEVC, ProRes, VP9)
- Verify seek accuracy (should be within 33ms frame-accurate)
- Test keyboard shortcuts
- Test restart behavior
- Test scrubbing during playback vs pause

---

### Issue 2: Video Stops 1 Second Before End (TD-004)

**Priority:** Low
**Severity:** Minor cosmetic issue
**Impact:** Video doesn't reach true end position

**Current Behavior:**
- Video plays normally
- At approximately last 1 second, playback stops
- Time display shows something like "0:04 / 0:05" when stopped
- User cannot see final frame/second of video

**Expected Behavior:**
- Video plays to true end (0:05 / 0:05)
- All frames visible including last one
- Playback stops naturally at duration

**Hypothesis:**

Several possible causes:

1. **MPV `keep-open` behavior:**
   - Current setting: `keep-open=yes` (line 27, mpv_player.rs)
   - May be stopping playback early to avoid EndFile event
   - Solution: Try `keep-open=always` or adjust end-of-file handling

2. **Duration calculation issue:**
   - MPV duration property may not match actual playable content
   - Some codecs have trailing metadata that inflates duration
   - Solution: Compare `duration` vs `time-remaining` properties

3. **Frame capture polling interval:**
   - Current: 100ms polling for time updates (VideoPlayer.tsx:171)
   - May detect "near end" state prematurely
   - Solution: Reduce interval to 33ms (30fps) for frame accuracy

4. **Pause-on-end logic:**
   - VideoPlayer may have logic that pauses near end
   - Check for any trim boundary enforcement code
   - Solution: Review pause conditions

**Files to Investigate:**
- `src-tauri/src/services/mpv_player.rs:27` - `keep-open` setting
- `src/components/player/VideoPlayer.tsx:171` - Time polling interval
- `src/components/player/VideoPlayer.tsx:185-193` - Trim boundary constraints

**Debugging Steps:**

1. **Add Diagnostic Logging** (15 min)
   ```rust
   // In mpv_player.rs get_time()
   let time = mpv.get_property::<f64>("time-pos")?;
   let remaining = mpv.get_property::<f64>("time-remaining").ok();
   debug!("[MPV] time-pos: {}, remaining: {:?}, duration: {}", time, remaining, duration);
   ```

2. **Test Different `keep-open` Values** (15 min)
   - Try `keep-open=always`
   - Try removing `keep-open` entirely
   - Monitor EndFile events

3. **Compare Duration Sources** (15 min)
   ```rust
   let duration = mpv.get_property::<f64>("duration")?;
   let length = mpv.get_property::<f64>("length").ok();
   let playtime_remaining = mpv.get_property::<f64>("playtime-remaining").ok();
   debug!("[MPV] duration: {}, length: {:?}, remaining: {:?}", duration, length, playtime_remaining);
   ```

4. **Test Frame-Accurate Timing** (15 min)
   - Reduce polling interval from 100ms to 33ms
   - Check if issue persists
   - May improve end-detection accuracy

**Expected Resolution Time:** ~1 hour

**Testing:**
- Test with multiple video formats (H.264, HEVC, ProRes, VP9)
- Test with different video lengths (short 5s clips, longer 30s videos)
- Verify last frame is visible
- Check time display shows 100% completion

---

## 📁 File Map for Enhancement

### Frontend Files
```
src/
├── components/
│   ├── player/
│   │   ├── PlayerControls.tsx          [TD-003: Add progress bar/slider]
│   │   ├── PlayerControls.test.tsx     [TD-003: Add slider tests]
│   │   └── VideoPlayer.tsx             [TD-004: Adjust polling interval]
│   └── layout/
│       └── PreviewPanel.tsx             [Context: Where player is rendered]
├── stores/
│   └── playerStore.ts                   [TD-003: May need seek() action]
└── lib/
    └── utils/
        └── timeUtils.ts                 [Context: Time formatting helpers]
```

### Backend Files
```
src-tauri/src/
├── commands/
│   └── mpv.rs                           [TD-003: Check mpv_seek command exists]
└── services/
    └── mpv_player.rs                    [TD-004: keep-open setting, duration logic]
```

---

## 🧪 Development Environment

**Current Working State:**
- ✅ Dev server running at http://localhost:1420
- ✅ MPV headless config working (`vo=null`)
- ✅ All codecs loading successfully
- ✅ Play/pause functional
- ✅ TypeScript compilation clean
- ✅ Tests passing (with known Video.js mock issues)

**Test Files Available:**
- `/Users/zeno/Downloads/test_h264.mp4` - H.264, 5 seconds, 1170x2532
- `/Users/zeno/Downloads/test_hevc.mp4` - HEVC, 5 seconds, 1170x2532
- `/Users/zeno/Downloads/test_prores.mov` - ProRes, 5 seconds, 1170x2532
- `/Users/zeno/Downloads/test_vp9.webm` - VP9, 5 seconds, 1170x2532

**Logs:**
- Application: `/Users/zeno/Library/Logs/clippy/app.log`
- Dev server: Terminal output or `/tmp/clippy-restart.log`

---

## 💡 Implementation Tips

### For TD-003 (Seek/Scrub):

1. **Start with basic HTML range input** rather than complex slider library
   - Faster to implement
   - Good enough for MVP
   - Can upgrade to shadcn Slider later if needed

2. **Consider UX during seeking:**
   - Should playback pause while scrubbing?
   - Should it resume after scrub if was playing?
   - Typical pattern: pause on scrub start, resume on release if was playing

3. **Frame-accurate seeking is critical:**
   - MPV supports frame-accurate seeks with `mpv.seek(time, "absolute+exact")`
   - Important for professional video editing workflow

4. **Test with keyboard focus:**
   - Ensure arrow keys work when player has focus
   - Don't interfere with other UI keyboard shortcuts

### For TD-004 (1s Early Stop):

1. **Start with logging:**
   - Add comprehensive logging before changing code
   - Compare duration, time-pos, time-remaining, playtime-remaining
   - Log EndFile events

2. **Test hypothesis methodically:**
   - Change one variable at a time
   - Document what works/doesn't work
   - Some codecs may behave differently

3. **Consider frame vs time precision:**
   - Video duration might be frame-based (e.g., 150 frames @ 30fps = 5.0s)
   - But actual last frame might be at 4.967s
   - May need to adjust duration rounding

---

## 📊 Success Criteria

### TD-003 (Seek/Scrub) Complete When:
- [ ] Progress bar visible showing current position
- [ ] User can click/drag to scrub video
- [ ] Scrubbing works during playback and pause
- [ ] Keyboard shortcuts work (arrows, home, end)
- [ ] Seek accuracy within 33ms (1 frame @ 30fps)
- [ ] Works with all codecs (H.264, HEVC, ProRes, VP9)
- [ ] Video can be restarted after ending
- [ ] Tests pass

### TD-004 (1s Early Stop) Complete When:
- [ ] Video plays to true end (100% of duration)
- [ ] Time display shows full duration (e.g., 0:05 / 0:05)
- [ ] Last frame visible
- [ ] Works with all codecs
- [ ] No regression in playback behavior
- [ ] Root cause understood and documented

---

## 🔗 Reference Documents

**Context:**
- `docs/SUMMARY-MPV-BUG-FIX-2025-10-28.md` - Previous debug session summary
- `docs/HANDOFF-PLAYBACK-MODE-DEBUG-2025-10-28.md` - Full MPV debug session
- `docs/stories/1-4-video-preview-player-with-basic-controls.md` - Story 1.4 details
- `docs/architecture.md` - ADR-006 (MPV Integration), ADR-007 (Playback Modes)

**Technical Debt:**
- `docs/TECHNICAL-DEBT.md` - TD-003, TD-004 full specifications

**Code:**
- `src/components/player/PlayerControls.tsx` - Current controls implementation
- `src/components/player/VideoPlayer.tsx` - MPV integration
- `src-tauri/src/services/mpv_player.rs` - MPV wrapper service
- `src-tauri/src/commands/mpv.rs` - Tauri commands

---

## 📋 Recommended Task Order

### Session 1: Add Seek/Scrub (Est. 3 hours)

1. Check if `mpv_seek` command exists in backend
2. Add Slider/range input to PlayerControls
3. Implement seek handler
4. Add keyboard shortcuts
5. Add restart behavior
6. Test with all codecs
7. Update tests

### Session 2: Fix Early Stop (Est. 1 hour)

1. Add diagnostic logging
2. Test different `keep-open` values
3. Compare duration properties
4. Adjust polling interval if needed
5. Document root cause
6. Test fix with all codecs

---

## 🤝 Handoff Checklist

- [x] Context provided (MPV bug fixed, player working)
- [x] Issues clearly defined (TD-003, TD-004)
- [x] Files identified for modification
- [x] Recommended approaches outlined
- [x] Success criteria defined
- [x] Test files available
- [x] Reference documents linked
- [x] Development environment ready
- [x] Task order suggested

---

**Ready for next developer.** All context captured. Start with TD-003 (seek/scrub) as it has higher UX impact.

**Questions?** Review `SUMMARY-MPV-BUG-FIX-2025-10-28.md` for recent changes, or `TECHNICAL-DEBT.md` for full TD-003/TD-004 specifications.
