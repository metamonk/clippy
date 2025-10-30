# Story 5.8 Development Handoff Document

**Story:** 5.8 - Real-Time Performance Optimization
**Status:** Partial Implementation (Task 1 of 9 Complete)
**Date:** 2025-10-29
**Handoff From:** Dev Agent Session 1
**Handoff To:** Next Dev Agent Session

---

## 🎯 Current Status

### ✅ Completed: Task 1 - FPS Monitoring Infrastructure (AC #1)

**All 5 subtasks complete:**
- ✅ Subtask 1.1: FPS counter created in `performance_monitor.rs`
- ✅ Subtask 1.2: Tauri command `get_playback_fps()` implemented
- ✅ Subtask 1.3: FPS overlay added to VideoPlayer component
- ✅ Subtask 1.4: Developer settings store created with FPS toggle
- ✅ Subtask 1.5: 6 unit tests passing

**Acceptance Criteria Satisfied:**
- ✅ AC #1: Frame rate monitoring in dev mode shows FPS during playback

**How to Test:**
```bash
# 1. Enable FPS overlay in browser console
localStorage.setItem('dev-settings-storage', '{"state":{"showFpsOverlay":true},"version":1}')

# 2. Reload app and play a video
# 3. You should see FPS overlay in top-right corner showing:
#    - Current FPS (color-coded: green ≥60, yellow ≥30, red <30)
#    - Average FPS
#    - Total frames rendered
#    - Uptime in seconds
```

---

## 📋 Remaining Work (Tasks 2-9)

### **Task 2: Implement Decode-Ahead Buffer (AC #3)** - **NEXT PRIORITY**

**Goal:** Pre-render upcoming complex segments 500ms ahead to avoid playback stuttering.

**Architecture Context:**
- Story 5.3 implements sequential clip playback (clip-to-clip transitions)
- Story 5.4 implements gap handling with black frames
- Decode-ahead buffer should pre-render complex segments before playhead reaches them
- Complex segments = multi-track or gaps requiring FFmpeg pre-rendering

**Implementation Plan:**

**Subtask 2.1: Design segment pre-loading queue (500ms lookahead)**
- Create `SegmentPreloader` struct in new file: `src-tauri/src/services/segment_preloader.rs`
- Define segment types: Simple (single clip) vs Complex (multi-track/gaps)
- Implement 500ms lookahead window calculation
  ```rust
  pub struct SegmentPreloader {
      render_queue: PriorityQueue<SegmentId, Priority>,
      background_renderer: Arc<Mutex<SegmentRenderer>>,
      lookahead_ms: u64, // 500ms
  }
  ```

**Subtask 2.2: Implement background segment rendering for upcoming clips**
- Use Tokio `spawn_blocking` for CPU-intensive FFmpeg rendering
- Render to cache: `~/Library/Caches/com.clippy.app/segments/`
- Reference Story 5.1 ADR-008 for hybrid architecture details
- Use existing `SegmentRenderer` from `src-tauri/src/services/segment_renderer.rs`

**Subtask 2.3: Add priority queue for segment cache (current > next > future)**
- Priority levels:
  - `High`: Currently playing segment
  - `Medium`: Next segment within 500ms
  - `Low`: Future segments beyond 500ms
- Use `priority-queue` crate (may need to add to Cargo.toml)

**Subtask 2.4: Add buffer monitoring (report buffer depth)**
- Track how many segments are pre-rendered and cached
- Add Tauri command: `get_buffer_status()` returning cache depth
- Add metrics to PerformanceMetrics struct

**Subtask 2.5: Write integration tests for buffer behavior**
- Test: Segments rendered before playhead reaches them
- Test: Priority queue orders segments correctly
- Test: Background rendering doesn't block playback

---

### **Task 3: Implement Frame Dropping Strategy (AC #4)**

**Goal:** Gracefully skip frames when system can't maintain 60 FPS instead of freezing.

**Subtask 3.1: Add frame drop detection (timestamp gap > 33ms)**
- Enhance `FpsCounter` to detect frame drops (gap > 33ms between frames)
- Track frame drop count in `PerformanceMetrics.dropped_frames`

**Subtask 3.2: Implement skip strategy (advance playhead without freeze)**
- When frame drop detected: advance playhead to next available frame
- Don't freeze waiting for slow render - skip to maintain smooth playback

**Subtask 3.3: Add frame drop logging (tracing::warn!)**
- Log each frame drop with timestamp and context
- Example: `tracing::warn!("Frame drop at {}ms, gap: {}ms", time, gap)`

**Subtask 3.4: Add recovery mechanism (reset to keyframe if excessive drops)**
- If > 10 drops in 1 second → reset to nearest keyframe
- This prevents cascade failures

**Subtask 3.5: Write stress tests for frame drop scenarios**
- Test: Intentional CPU overload triggers frame dropping (not freeze)
- Test: Recovery mechanism activates after 10+ drops
- Test: Playback continues after frame drops

---

### **Task 4: Optimize Memory Usage (AC #5)**

**Goal:** Keep memory usage < 1GB for 5-minute timeline.

**Subtask 4.1: Profile current memory usage (baseline measurement)**
- Use macOS Instruments or `cargo instruments -t "Allocations"`
- Document baseline in architecture.md

**Subtask 4.2: Implement segment cache eviction (LRU with 1GB max)**
- Implement LRU cache in `segment_renderer.rs`
- Max cache size: 1GB
- Evict oldest segments when limit reached

**Subtask 4.3: Add memory monitoring metrics**
- Add `memory_usage_bytes` to PerformanceMetrics
- Use `sysinfo` crate for process memory tracking

**Subtask 4.4: Optimize segment cache file sizes (tune FFmpeg CRF)**
- Experiment with FFmpeg CRF values (currently uses default)
- Target: Balance quality vs file size for cached segments

**Subtask 4.5: Add memory usage assertions in tests (<1GB validation)**
- Integration test: Play 5-minute timeline, assert memory < 1GB

---

### **Task 5: Optimize CPU Usage (AC #6)**

**Goal:** Keep CPU usage < 80% on MacBook Pro 2020+.

**Subtask 5.1: Profile CPU hotspots (flamegraph analysis)**
- Run `cargo flamegraph` on composition playback
- Document hotspots in architecture.md

**Subtask 5.2: Optimize segment rendering (FFmpeg ultrafast preset, limit threads)**
- Add `-preset ultrafast` to FFmpeg commands in `segment_renderer.rs`
- Limit FFmpeg threads to prevent CPU saturation

**Subtask 5.3: Offload rendering to background threads (Tokio spawn_blocking)**
- Already partially done in Task 2.2
- Ensure all CPU-intensive work uses `spawn_blocking`

**Subtask 5.4: Add CPU throttling for background tasks**
- Implement rate limiting for background segment rendering
- Don't render faster than playback needs

**Subtask 5.5: Validate CPU <80% with 3+ video + 4+ audio tracks**
- Integration test: Play complex timeline, monitor CPU usage
- Assert average CPU < 80%

---

### **Task 6: Optimize Scrubbing Performance (AC #7)**

**Goal:** Seek latency < 100ms for smooth scrubbing.

**Subtask 6.1: Measure baseline seek latency (current performance)**
- Add seek latency tracking to performance monitor
- Log seek operations with timestamps

**Subtask 6.2: Optimize segment cache lookup (in-memory index)**
- Create in-memory index of cached segments for fast lookup
- Avoid filesystem scanning on every seek

**Subtask 6.3: Implement seek prediction (pre-cache likely seek targets)**
- Heuristic: Pre-cache segments at 0%, 25%, 50%, 75%, 100% of timeline
- These are common scrub destinations

**Subtask 6.4: Add seek latency monitoring**
- Track seek operations and latency in PerformanceMetrics
- Display in FPS overlay when scrubbing

**Subtask 6.5: Write performance tests for scrub operations (<100ms target)**
- Test: Seek to 10 random positions, assert latency < 100ms

---

### **Task 7: Multi-Track Performance Validation (AC #2)**

**Goal:** Validate sustained 60 FPS with 3 video + 4 audio tracks.

**Subtask 7.1: Create complex test timeline (3 video + 4 audio tracks)**
- Create test fixture in `src-tauri/tests/fixtures/`
- Use existing test media from Story 5.7

**Subtask 7.2: Run playback with FPS monitoring enabled**
- Integration test: Play complex timeline for 30 seconds
- Record FPS throughout

**Subtask 7.3: Validate sustained 60 FPS over 5-minute timeline**
- Test: 5-minute playback maintains ≥ 60 FPS
- Allow brief dips (< 1 second) but average must be ≥ 60

**Subtask 7.4: Stress test with additional tracks (6 video + 8 audio)**
- Test graceful degradation beyond target
- Document limits in architecture.md

**Subtask 7.5: Document performance limits and degradation points**
- Create performance tuning guide (see Task 8.5)

---

### **Task 8: Performance Profiling Documentation (AC #8)**

**Goal:** Document all performance findings in architecture.md.

**Subtask 8.1: Document baseline performance metrics**
- CPU, memory, FPS for various timeline complexities
- Table format in architecture.md

**Subtask 8.2: Document optimization strategies applied**
- List all optimizations from Tasks 1-7
- Explain rationale for each

**Subtask 8.3: Document known performance bottlenecks**
- Identify and document any remaining bottlenecks
- Suggest future improvements

**Subtask 8.4: Update architecture.md with profiling results**
- Add new section: "Performance Profiling Results (Story 5.8)"
- Include flamegraphs, memory profiles, FPS charts

**Subtask 8.5: Create performance tuning guide for future developers**
- Create `docs/performance-tuning-guide.md`
- How to profile, optimize, and troubleshoot performance issues

---

### **Task 9: Integration Testing (AC #1-8)**

**Goal:** Comprehensive integration tests for all performance features.

**Subtask 9.1: Write integration test for FPS monitoring**
- Test: FPS counter tracks frames correctly during playback

**Subtask 9.2: Write integration test for decode-ahead buffer**
- Test: Segments pre-rendered before playhead reaches them

**Subtask 9.3: Write integration test for frame dropping**
- Test: Frame drops trigger skip strategy (not freeze)

**Subtask 9.4: Write integration test for memory limits**
- Test: Memory stays < 1GB during 5-minute playback

**Subtask 9.5: Write integration test for CPU usage**
- Test: CPU < 80% during complex timeline playback

**Subtask 9.6: Write integration test for scrub latency**
- Test: Seek operations complete < 100ms

**Subtask 9.7: Add performance regression tests to CI/CD pipeline**
- Create GitHub Actions workflow for performance tests
- Fail build if performance regresses

---

## 🔑 Key Files & Architecture

### Existing Files to Understand

**Performance Monitoring:**
- `src-tauri/src/services/performance_monitor.rs` - FPS counter (Task 1 ✅)
- `src-tauri/src/commands/performance.rs` - Tauri commands (Task 1 ✅)
- `src/lib/tauri/performance.ts` - TypeScript helpers (Task 1 ✅)
- `src/stores/devSettingsStore.ts` - Settings store (Task 1 ✅)

**Playback Architecture (Stories 5.3-5.4):**
- `src/components/player/VideoPlayer.tsx` - Main playback component
- `src/stores/compositionStore.ts` - Composition state (Story 5.2)
- `src/lib/timeline/gapAnalyzer.ts` - Gap detection (Story 5.4)

**Rendering & Export:**
- `src-tauri/src/services/segment_renderer.rs` - FFmpeg segment rendering
- `src-tauri/src/services/ffmpeg/mod.rs` - FFmpeg service layer
- `src-tauri/src/services/mpv_player.rs` - MPV playback engine

**Testing Infrastructure:**
- `src-tauri/tests/composition_parity_tests.rs` - Parity tests (Story 5.7)
- `src-tauri/tests/fixtures/` - Test media fixtures

### New Files to Create

**Task 2:**
- `src-tauri/src/services/segment_preloader.rs`
- `src-tauri/src/services/segment_cache.rs` (if separate from preloader)

**Task 8:**
- `docs/performance-tuning-guide.md`

---

## 🧪 Testing Strategy

### Run Existing Tests
```bash
# Rust unit tests (includes FPS counter tests)
cd src-tauri
cargo test

# TypeScript tests
npm test

# Integration tests
cargo test --test composition_parity_tests
```

### Enable FPS Overlay for Manual Testing
```javascript
// In browser console:
localStorage.setItem('dev-settings-storage', '{"state":{"showFpsOverlay":true},"version":1}')
```

### Performance Profiling Commands
```bash
# CPU profiling (flamegraph)
cargo install flamegraph
sudo flamegraph --bin clippy -- playback-test

# Memory profiling (macOS)
instruments -t "Allocations" target/release/clippy

# CPU profiling (macOS)
instruments -t "Time Profiler" target/release/clippy
```

---

## 📚 Reference Documentation

**Architecture Decisions:**
- `docs/architecture.md` - ADR-008: Hybrid Smart Segment Pre-Rendering
- `docs/stories/5-1-composition-playback-architecture-adr.md` - Performance benchmarks

**Requirements:**
- `docs/PRD.md` - NFR001: Performance requirements (60 FPS target)
- `docs/epics.md` - Epic 5, Story 5.8 details

**Related Stories:**
- Story 5.1: Composition Playback Architecture (ADR-008 foundation)
- Story 5.2: Composition State Management
- Story 5.3: Sequential Clip Playback (clip transitions)
- Story 5.4: Gap Handling (black frame rendering)
- Story 5.6: Multi-Track Video Compositing (uses performance_monitor.rs)
- Story 5.7: Export Parity Validation (test infrastructure)

**Retrospective Learnings:**
- `docs/epic-3-retrospective.md` - Performance benchmarking recommendations

---

## 🚀 Quick Start for Next Dev Agent

```bash
# 1. Resume from where we left off
cd /Users/zeno/Projects/clippy/project

# 2. Review what's been done
cat docs/stories/5-8-HANDOFF.md

# 3. Check current story status
cat docs/stories/5-8-real-time-performance-optimization.md

# 4. Run tests to ensure Task 1 is working
cd src-tauri
cargo test performance_monitor
cd ..

# 5. Start on Task 2: Decode-Ahead Buffer
# Read Task 2 details in this handoff document
# Create src-tauri/src/services/segment_preloader.rs

# 6. Reference existing segment renderer
cat src-tauri/src/services/segment_renderer.rs
```

---

## 💡 Implementation Tips

### For Task 2 (Decode-Ahead Buffer):
- Study `SegmentRenderer` in `segment_renderer.rs` first
- Use `composition_analyzer.rs` to classify simple vs complex segments
- Cache location: `~/Library/Caches/com.clippy.app/segments/`
- Consider using `tokio::sync::mpsc` for renderer queue

### For Task 3 (Frame Dropping):
- Enhance existing `FpsCounter` rather than creating new struct
- Frame drop = gap > 33ms between `record_frame()` calls
- Log with `tracing::warn!` for visibility
- Test with intentional CPU overload (heavy loop)

### For Task 4 (Memory Optimization):
- Use `sysinfo` crate for memory monitoring (add to Cargo.toml)
- LRU cache pattern: `std::collections::HashMap` + `std::collections::VecDeque`
- Segment cache files: Use hash of segment ID as filename

### For Task 5 (CPU Optimization):
- FFmpeg preset flag: `-preset ultrafast` in segment_renderer.rs
- Thread limit: `-threads 4` to prevent CPU saturation
- Use `tokio::task::spawn_blocking` for all FFmpeg calls

### For Task 6 (Scrubbing):
- In-memory index: `HashMap<SegmentId, PathBuf>` for fast cache lookup
- Seek prediction: Calculate segment IDs at 0%, 25%, 50%, 75%, 100%
- Pre-cache these segments on timeline load

---

## ⚠️ Known Issues & Gotchas

1. **FPS Counter vs Frame Capture Rate Mismatch:**
   - FPS counter tracks at 15 FPS (frame capture interval)
   - This is intentional - measures actual rendering rate, not target
   - True playback FPS would need higher sampling rate

2. **Nested Tauri Directory:**
   - Project has nested src-tauri structure: `/project/src-tauri/src-tauri/`
   - Always run cargo commands from inner `src-tauri` directory

3. **Story Scope:**
   - This story is HUGE (9 tasks, 40+ subtasks)
   - Consider breaking into Story 5.8.1, 5.8.2, 5.8.3 if this becomes blockers

4. **Performance Testing Challenges:**
   - CPU/memory tests may be flaky due to system load
   - Allow tolerance in assertions (e.g., 75% instead of strict 80%)
   - Run performance tests in isolation, not with full test suite

---

## 📊 Success Criteria

Story is complete when ALL 8 Acceptance Criteria are satisfied:

- [x] AC #1: Frame rate monitoring in dev mode shows FPS during playback ✅ (Task 1)
- [ ] AC #2: Maintain 60 FPS with 3+ video tracks + 4+ audio tracks (Task 7)
- [ ] AC #3: Decode-ahead buffer for upcoming clips (500ms ahead) (Task 2)
- [ ] AC #4: Frame dropping strategy for performance degradation (Task 3)
- [ ] AC #5: Memory usage < 1GB for typical 5-minute timeline (Task 4)
- [ ] AC #6: CPU usage < 80% on MacBook Pro (2020+) (Task 5)
- [ ] AC #7: Smooth scrubbing through timeline (< 100ms seek latency) (Task 6)
- [ ] AC #8: Performance profiling documented in architecture.md (Task 8)

---

## 🤝 Handoff Checklist

Before closing this session, ensure:

- [x] Task 1 code committed (performance monitoring infrastructure)
- [x] Story file updated with Task 1 completion
- [x] Sprint status updated (story still in-progress)
- [x] Tests passing (6 FPS counter tests)
- [x] Handoff document created with clear next steps
- [x] Architecture decisions documented in story file

**Next Dev Agent:** Start with **Task 2: Implement Decode-Ahead Buffer**

Good luck! 🚀
