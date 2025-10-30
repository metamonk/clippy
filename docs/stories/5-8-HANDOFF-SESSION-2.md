# Story 5.8 Development Handoff Document - Session 2

**Story:** 5.8 - Real-Time Performance Optimization
**Status:** Partial Implementation (Tasks 1-2 of 9 Complete)
**Date:** 2025-10-29
**Handoff From:** Dev Agent Session 2
**Handoff To:** Next Dev Agent Session

---

## 🎯 Current Status

### ✅ Completed: Tasks 1-2 (22% Complete)

**Task 1: FPS Monitoring Infrastructure (AC #1)** ✅
- All 5 subtasks complete
- 6 unit tests passing
- AC #1 Satisfied: Frame rate monitoring in dev mode shows FPS during playback

**Task 2: Decode-Ahead Buffer (AC #3)** ✅
- All 5 subtasks complete
- 4 unit tests passing
- AC #3 Satisfied: Decode-ahead buffer for upcoming clips (500ms ahead)

**Acceptance Criteria Satisfied:**
- ✅ AC #1: Frame rate monitoring in dev mode shows FPS during playback
- ✅ AC #3: Decode-ahead buffer for upcoming clips (500ms ahead)

**Key Accomplishments:**
1. **SegmentPreloader Service**: Priority queue-based decode-ahead buffer with 500ms lookahead
2. **Background Rendering**: Non-blocking FFmpeg operations via `tokio::spawn_blocking`
3. **Buffer Monitoring**: Tauri command `get_buffer_status()` for frontend metrics
4. **Cache Management**: LRU-style cache tracking with hit rate calculation
5. **Priority System**: High (current) > Medium (next 500ms) > Low (future) ordering

---

## 📋 Remaining Work (Tasks 3-9)

### **Task 3: Implement Frame Dropping Strategy (AC #4)** - **NEXT PRIORITY**

**Goal:** Gracefully skip frames when system can't maintain 60 FPS instead of freezing.

**Implementation Approach:**
Enhance the existing `FpsCounter` in `performance_monitor.rs` to detect and handle frame drops.

**Subtask 3.1: Add frame drop detection (timestamp gap > 33ms)**
- Modify `FpsCounter::record_frame()` to detect gaps > 33ms
- Add `dropped_frames: u64` field to `FpsCounter`
- Track frame drop count in `PerformanceMetrics`
- Implementation:
  ```rust
  pub fn record_frame(&mut self) {
      let now = Instant::now();

      // Check for frame drop (gap > 33ms = 2 frames at 60 FPS)
      if let Some(last_frame) = self.frame_timestamps.back() {
          let gap = now.duration_since(*last_frame);
          if gap.as_millis() > 33 {
              self.dropped_frames += 1;
              tracing::warn!("Frame drop detected: {}ms gap", gap.as_millis());
          }
      }

      self.frame_timestamps.push_back(now);
      // ... rest of logic
  }
  ```

**Subtask 3.2: Implement skip strategy (advance playhead without freeze)**
- Create new service: `src-tauri/src/services/playback_controller.rs`
- Implement `advance_playhead_on_drop()` method
- Skip to next available frame instead of waiting
- Use existing `mpv_seek` command to advance playhead

**Subtask 3.3: Add frame drop logging (tracing::warn!)**
- Already implemented in 3.1 (see code above)
- Log includes timestamp and gap duration
- Structured logging with tracing macros

**Subtask 3.4: Add recovery mechanism (reset to keyframe if excessive drops)**
- Track drops per second (sliding window)
- If > 10 drops in 1 second → reset to nearest keyframe
- Implementation:
  ```rust
  pub fn check_excessive_drops(&self) -> bool {
      // Count drops in last 1 second
      let one_sec_ago = Instant::now() - Duration::from_secs(1);
      let recent_drops = self.frame_timestamps.iter()
          .filter(|ts| **ts > one_sec_ago)
          .count();
      recent_drops > 10
  }
  ```
- Reset via `mpv_seek` to nearest keyframe (usually every 2-5 seconds)

**Subtask 3.5: Write stress tests for frame drop scenarios**
- Create intentional CPU overload (heavy loop in background thread)
- Verify frame drops trigger skip strategy (not freeze)
- Verify recovery mechanism activates after 10+ drops
- Test file: `src-tauri/tests/frame_drop_tests.rs`

**Estimated Time:** 2-3 hours

---

### **Task 4: Optimize Memory Usage (AC #5)**

**Goal:** Keep memory usage < 1GB for 5-minute timeline.

**Subtask 4.1: Profile current memory usage (baseline measurement)**
- Add `sysinfo` crate to `Cargo.toml`
- Create memory profiling script
- Document baseline in architecture.md

**Subtask 4.2: Implement segment cache eviction (LRU with 1GB max)**
- Add LRU eviction to `SegmentPreloader`
- Track total cache size (sum of segment file sizes)
- Evict oldest segments when > 1GB
- Implementation:
  ```rust
  pub struct SegmentPreloader {
      // ... existing fields
      cache_size_bytes: Arc<RwLock<u64>>,
      max_cache_size: u64, // 1GB = 1_000_000_000 bytes
      lru_queue: Arc<Mutex<VecDeque<String>>>, // segment_id queue
  }

  pub async fn evict_if_needed(&self) -> Result<()> {
      let cache_size = *self.cache_size_bytes.read().await;
      if cache_size > self.max_cache_size {
          // Evict oldest segment from LRU queue
          let mut lru = self.lru_queue.lock().await;
          if let Some(oldest_id) = lru.pop_front() {
              self.delete_cached_segment(&oldest_id).await?;
          }
      }
      Ok(())
  }
  ```

**Subtask 4.3: Add memory monitoring metrics**
- Add `memory_usage_bytes` to `PerformanceMetrics`
- Use `sysinfo::System` to get process memory
- Update `get_playback_fps()` to include memory metrics

**Subtask 4.4: Optimize segment cache file sizes (tune FFmpeg CRF)**
- Experiment with CRF values (currently 23)
- Test CRF 25-28 for smaller files with acceptable quality
- Update `SegmentRenderer::build_ffmpeg_command()`

**Subtask 4.5: Add memory usage assertions in tests (<1GB validation)**
- Integration test: Play 5-minute timeline, assert memory < 1GB
- Use `sysinfo` to measure memory before/after

**Estimated Time:** 3-4 hours

---

### **Task 5: Optimize CPU Usage (AC #6)**

**Goal:** Keep CPU usage < 80% on MacBook Pro 2020+.

**Subtask 5.1: Profile CPU hotspots (flamegraph analysis)**
```bash
cargo install flamegraph
sudo flamegraph --bin clippy -- playback-test
# Analyze flamegraph.svg for CPU bottlenecks
```

**Subtask 5.2: Optimize segment rendering (FFmpeg ultrafast preset, limit threads)**
- Already using ultrafast on non-macOS (see `segment_renderer.rs:381`)
- Add thread limit: `-threads 4` to prevent CPU saturation
- Update `SegmentRenderer::build_ffmpeg_command()`

**Subtask 5.3: Offload rendering to background threads (Tokio spawn_blocking)**
- Already implemented in Task 2 (`segment_preloader.rs:293`)
- Verify all CPU-intensive work uses `spawn_blocking`

**Subtask 5.4: Add CPU throttling for background tasks**
- Rate limit background segment rendering
- Don't render faster than playback needs (500ms lookahead)
- Add delay between renders if queue empty

**Subtask 5.5: Validate CPU <80% with 3+ video + 4+ audio tracks**
- Integration test: Monitor CPU during complex playback
- Use `sysinfo` to measure CPU percentage
- Assert average CPU < 80% over 30-second test

**Estimated Time:** 2-3 hours

---

### **Task 6: Optimize Scrubbing Performance (AC #7)**

**Goal:** Seek latency < 100ms for smooth scrubbing.

**Subtask 6.1: Measure baseline seek latency (current performance)**
- Add seek latency tracking to `PerformanceMetrics`
- Log seek operations with timestamps
- Create benchmark: 10 random seeks, measure average latency

**Subtask 6.2: Optimize segment cache lookup (in-memory index)**
- Add `HashMap<SegmentId, PathBuf>` for fast cache lookup
- Already implemented in `SegmentPreloader.cached_segments`! ✅
- Verify no filesystem scanning on seeks

**Subtask 6.3: Implement seek prediction (pre-cache likely seek targets)**
- Heuristic: Pre-cache segments at 0%, 25%, 50%, 75%, 100% of timeline
- Add `preload_seek_targets()` method to `SegmentPreloader`
- Call on timeline load

**Subtask 6.4: Add seek latency monitoring**
- Add `last_seek_latency_ms: Option<u64>` to `PerformanceMetrics`
- Track in `mpv_seek` command
- Display in FPS overlay when scrubbing

**Subtask 6.5: Write performance tests for scrub operations (<100ms target)**
- Test: Seek to 10 random positions, assert latency < 100ms
- Use cached segments for test (warm cache scenario)

**Estimated Time:** 2-3 hours

---

### **Task 7: Multi-Track Performance Validation (AC #2)**

**Goal:** Validate sustained 60 FPS with 3 video + 4 audio tracks.

**Subtask 7.1: Create complex test timeline (3 video + 4 audio tracks)**
- Create test fixture in `src-tauri/tests/fixtures/complex_timeline.json`
- Use existing test media from Story 5.7
- Timeline structure:
  - Track 1 (video): Base video (5 minutes)
  - Track 2 (video): PiP webcam (5 minutes)
  - Track 3 (video): Screen recording overlay (5 minutes)
  - Track 1 (audio): System audio
  - Track 2 (audio): Microphone
  - Track 3 (audio): Webcam audio
  - Track 4 (audio): Background music

**Subtask 7.2: Run playback with FPS monitoring enabled**
- Integration test: Play complex timeline for 30 seconds
- Record FPS throughout using `FpsCounter`
- Log any frame drops

**Subtask 7.3: Validate sustained 60 FPS over 5-minute timeline**
- Test: 5-minute playback maintains ≥ 60 FPS
- Allow brief dips (< 1 second) but average must be ≥ 60 FPS
- Fail test if average FPS < 60

**Subtask 7.4: Stress test with additional tracks (6 video + 8 audio)**
- Test graceful degradation beyond target
- Verify frame dropping works (no freeze)
- Document limits in architecture.md

**Subtask 7.5: Document performance limits and degradation points**
- Create performance table in architecture.md:
  ```markdown
  | Track Count | FPS | Memory | CPU | Notes |
  |-------------|-----|--------|-----|-------|
  | 1V + 1A | 60 | 200MB | 20% | Baseline |
  | 3V + 4A | 60 | 600MB | 60% | Target (AC #2) |
  | 6V + 8A | 45 | 900MB | 85% | Degradation |
  | 10V + 10A | 25 | 1.2GB | 95% | Severe degradation |
  ```

**Estimated Time:** 3-4 hours

---

### **Task 8: Performance Profiling Documentation (AC #8)**

**Goal:** Document all performance findings in architecture.md.

**Subtask 8.1: Document baseline performance metrics**
- CPU, memory, FPS for various timeline complexities
- Table format in architecture.md (see Task 7.5)

**Subtask 8.2: Document optimization strategies applied**
- List all optimizations from Tasks 1-7
- Explain rationale for each:
  - FPS monitoring → Detect performance issues early
  - Decode-ahead buffer → Prevent stuttering on segment transitions
  - Frame dropping → Graceful degradation (skip, not freeze)
  - Memory eviction → Stay under 1GB budget
  - CPU throttling → Prevent UI blocking
  - Scrub prediction → Fast seek response

**Subtask 8.3: Document known performance bottlenecks**
- FFmpeg rendering speed (CPU-bound)
- MPV load time for complex segments (150ms cache hit)
- Disk I/O for cache reads (SSD required for best performance)

**Subtask 8.4: Update architecture.md with profiling results**
- Add new section: "Performance Profiling Results (Story 5.8)"
- Include flamegraphs (save to `docs/images/flamegraph-playback.svg`)
- Memory profiles (screenshot from Instruments)
- FPS charts (export from test runs)

**Subtask 8.5: Create performance tuning guide for future developers**
- Create `docs/performance-tuning-guide.md`
- Sections:
  - How to profile (flamegraph, Instruments, memory tools)
  - How to optimize (FFmpeg flags, Tokio best practices, caching strategies)
  - How to troubleshoot (common issues, debug logs, metrics)
- Include code examples and screenshots

**Estimated Time:** 2-3 hours

---

### **Task 9: Integration Testing (AC #1-8)**

**Goal:** Comprehensive integration tests for all performance features.

**Subtask 9.1: Write integration test for FPS monitoring**
- Test: FPS counter tracks frames correctly during playback
- File: `src-tauri/tests/fps_monitoring_tests.rs`

**Subtask 9.2: Write integration test for decode-ahead buffer**
- Test: Segments pre-rendered before playhead reaches them
- Verify cache hits for smooth playback

**Subtask 9.3: Write integration test for frame dropping**
- Test: Frame drops trigger skip strategy (not freeze)
- Intentional CPU overload scenario

**Subtask 9.4: Write integration test for memory limits**
- Test: Memory stays < 1GB during 5-minute playback

**Subtask 9.5: Write integration test for CPU usage**
- Test: CPU < 80% during complex timeline playback

**Subtask 9.6: Write integration test for scrub latency**
- Test: Seek operations complete < 100ms

**Subtask 9.7: Add performance regression tests to CI/CD pipeline**
- Create `.github/workflows/performance-tests.yml`
- Run performance tests on every PR
- Fail build if performance regresses (FPS < 60, memory > 1GB, CPU > 80%)

**Estimated Time:** 4-5 hours

---

## 🔑 Key Architecture Details

### Decode-Ahead Buffer Architecture (Task 2)

**SegmentPreloader Flow:**
```
1. Timeline analysis → Segment classification (Simple vs Complex)
2. Priority assignment based on playhead position:
   - High: Currently playing segment
   - Medium: Segments within 500ms lookahead
   - Low: Future segments beyond 500ms
3. Priority queue ordering (BinaryHeap):
   - Pop highest priority segment
   - Spawn background rendering task (spawn_blocking)
4. Background rendering:
   - FFmpeg pre-render to cache
   - Mark segment as cached
   - Remove from rendering set
5. Cache lookup:
   - Check in-memory HashMap
   - Return cached path (cache hit)
   - Or trigger render (cache miss)
```

**Buffer Monitoring Metrics:**
- `segments_in_queue`: Number of segments waiting to be rendered
- `segments_cached`: Number of segments cached and ready
- `cache_hit_rate`: Percentage of cache hits (0.0 to 1.0)
- `rendering_segment`: Currently rendering segment ID (if any)
- `is_rendering`: Whether background rendering is active

**Cache Directory:**
- Location: `~/Library/Caches/com.clippy.app/segments/`
- File format: `{cache_key}.mp4` (SHA-256 hash of segment content)
- Cache key includes: clip paths, trim points, transforms, track structure

### Important Code Locations

**Performance Monitoring:**
- `src-tauri/src/services/performance_monitor.rs` - FPS counter
- `src-tauri/src/commands/performance.rs` - Tauri commands
- `src/lib/tauri/performance.ts` - TypeScript helpers
- `src/stores/devSettingsStore.ts` - Settings store

**Decode-Ahead Buffer:**
- `src-tauri/src/services/segment_preloader.rs` - Priority queue and background rendering
- `src-tauri/src/services/segment_renderer.rs` - FFmpeg segment rendering
- `src-tauri/src/services/composition_analyzer.rs` - Segment classification

**Playback Architecture:**
- `src/components/player/VideoPlayer.tsx` - Main playback component
- `src/stores/compositionStore.ts` - Composition state (Story 5.2)
- `src/lib/timeline/gapAnalyzer.ts` - Gap detection (Story 5.4)

### Dependencies Added

None! Used existing dependencies:
- `tokio` (async runtime, spawn_blocking)
- `serde` (serialization)
- `sha2` (cache key hashing)
- Standard library collections (BinaryHeap, HashMap, HashSet)

### Testing Infrastructure

**Unit Tests:**
- 6 tests in `performance_monitor.rs` (Task 1)
- 4 tests in `segment_preloader.rs` (Task 2)
- Total: 10 passing unit tests

**Integration Tests:**
- Reuse Story 5.7 infrastructure (`composition_parity_tests.rs`)
- Test fixtures: `src-tauri/tests/fixtures/`

---

## 🚀 Quick Start for Next Dev Agent

```bash
# 1. Resume from where we left off
cd /Users/zeno/Projects/clippy/project

# 2. Review what's been done
cat docs/stories/5-8-HANDOFF-SESSION-2.md

# 3. Check current story status
cat docs/stories/5-8-real-time-performance-optimization.md

# 4. Run tests to ensure Tasks 1-2 are working
cd src-tauri
cargo test performance_monitor
cargo test segment_preloader
cd ..

# 5. Start on Task 3: Frame Dropping Strategy
# Read Task 3 details in this handoff document
# Enhance src-tauri/src/services/performance_monitor.rs with frame drop detection

# 6. Reference existing FPS counter
cat src-tauri/src/services/performance_monitor.rs
```

---

## 💡 Implementation Tips

### For Task 3 (Frame Dropping):
- Enhance existing `FpsCounter` rather than creating new struct
- Frame drop = gap > 33ms between `record_frame()` calls
- Log with `tracing::warn!` for visibility
- Test with intentional CPU overload (heavy loop in `spawn_blocking`)

### For Task 4 (Memory Optimization):
- Add `sysinfo = "0.30"` to Cargo.toml for memory monitoring
- LRU cache pattern: `HashMap` + `VecDeque` for ordering
- Track cache size: sum of file sizes (use `fs::metadata()`)
- Evict on insert: check before adding new segment

### For Task 5 (CPU Optimization):
- FFmpeg flags already optimized (ultrafast preset, hardware decode)
- Add `-threads 4` to `build_ffmpeg_command()`
- Rate limit renders: `tokio::time::sleep(Duration::from_millis(100))` between queue checks
- Monitor CPU: `sysinfo::System::new_all()` → `system.global_cpu_info().cpu_usage()`

### For Task 6 (Scrubbing):
- Cache lookup already O(1) (HashMap) ✅
- Seek prediction: Calculate segment IDs at 0%, 25%, 50%, 75%, 100%
- Pre-cache on timeline load: `preload_seek_targets(&timeline)`
- Track latency: `let start = Instant::now(); mpv_seek(); let latency = start.elapsed();`

### For Task 7 (Multi-Track Validation):
- Use Story 5.7 test fixtures for media files
- Create JSON timeline fixture (see handoff for structure)
- Run in release mode for accurate FPS (`cargo test --release`)
- Allow tolerance: 58-60 FPS acceptable (not strict 60.0)

### For Task 8 (Documentation):
- Take screenshots of Instruments (memory profile)
- Export flamegraph as SVG
- Create performance table (markdown format)
- Link to relevant story files for context

### For Task 9 (Integration Tests):
- Extend `composition_parity_tests.rs` pattern
- Use `#[tokio::test]` for async tests
- Mock heavy operations if needed (e.g., FFmpeg rendering)
- Run in CI: `cargo test --test integration_tests`

---

## ⚠️ Known Issues & Gotchas

1. **Float Comparison in Equality:**
   - Clip contains ClipTransform with f64 fields (opacity, x, y, width, height)
   - Cannot derive Eq for Segment/VideoLayer (only PartialEq)
   - PrioritizedSegment uses manual Eq implementation (compares segment_id only)

2. **Background Rendering Concurrency:**
   - Currently processes one segment at a time (sequential)
   - Could parallelize for better throughput (spawn multiple tasks)
   - Be careful with FFmpeg thread limits to avoid CPU saturation

3. **Cache Invalidation:**
   - Cache key based on segment content hash
   - Any timeline change (trim, transform, clip order) → new cache key
   - Consider cache size growth over time (need eviction!)

4. **MPV State Management:**
   - MPV playback state managed in `MpvPlayerState` (lib.rs:139)
   - Segment transitions must not disrupt MPV instance
   - Use `mpv_load_file` carefully to avoid stuttering

5. **Performance Test Flakiness:**
   - CPU/memory tests sensitive to system load
   - Allow tolerance in assertions (e.g., 75% instead of strict 80%)
   - Run performance tests in isolation, not with full test suite
   - Consider using `--test-threads=1` for stable results

---

## 📊 Progress Metrics

**Story Completion:**
- Tasks Complete: 2 of 9 (22%)
- Subtasks Complete: 10 of 45+ (22%)
- Acceptance Criteria Satisfied: 2 of 8 (25%)
- Tests Passing: 10 unit tests

**Remaining Work Estimate:**
- Task 3: 2-3 hours (Frame Dropping)
- Task 4: 3-4 hours (Memory Optimization)
- Task 5: 2-3 hours (CPU Optimization)
- Task 6: 2-3 hours (Scrubbing Performance)
- Task 7: 3-4 hours (Multi-Track Validation)
- Task 8: 2-3 hours (Documentation)
- Task 9: 4-5 hours (Integration Testing)
- **Total Estimated: 18-25 hours** (3-4 development sessions)

---

## 🤝 Handoff Checklist

Before closing this session, ensure:

- [x] Task 2 code implemented (segment preloader)
- [x] Story file updated with Task 2 completion
- [x] Sprint status remains in-progress (not marked done yet)
- [x] Tests passing (10 unit tests: 6 FPS + 4 buffer)
- [x] Handoff document created with clear next steps
- [x] Architecture decisions documented in story file
- [x] File list updated with all new/modified files

**Next Dev Agent:** Start with **Task 3: Implement Frame Dropping Strategy**

**Recommended Approach:**
1. Read Task 3 implementation details above
2. Enhance `performance_monitor.rs` with frame drop detection
3. Test with intentional CPU overload
4. Move to Task 4 (Memory Optimization) if time allows

---

## 🎯 Session 2 Summary

**What We Accomplished:**
- ✅ Implemented complete decode-ahead buffer architecture with priority queue
- ✅ Background rendering via Tokio spawn_blocking (non-blocking FFmpeg)
- ✅ Buffer monitoring with cache hit rate tracking
- ✅ 4 unit tests passing for buffer behavior validation
- ✅ Full system integration with Tauri commands and state management
- ✅ Comprehensive handoff documentation for next session

**Code Quality:**
- All tests passing (10 total: 6 FPS + 4 buffer)
- Zero compilation warnings (except 1 benign dead_code for cache_dir field)
- Proper async/await patterns with Tokio
- Manual Eq implementation to handle float comparisons correctly

**Story Progress:**
- 22% complete (2 of 9 tasks)
- 2 of 8 acceptance criteria satisfied (AC #1, AC #3)
- Estimated remaining: 18-25 hours (3-4 sessions)

**Next Session Should:**
1. Start with Task 3 (Frame Dropping) - already planned in detail above
2. Continue to Task 4 (Memory Optimization) if capacity allows
3. Follow the detailed implementation plans in this handoff document

**All Documentation Updated:**
- ✅ Story file: `docs/stories/5-8-real-time-performance-optimization.md`
- ✅ Handoff doc: `docs/stories/5-8-HANDOFF-SESSION-2.md` (this file)
- ✅ Previous handoff: `docs/stories/5-8-HANDOFF.md` (Session 1)

Good luck! 🚀

---

**End of Session 2 Handoff Document**
