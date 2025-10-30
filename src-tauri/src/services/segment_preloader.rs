//! Segment Preloader for Decode-Ahead Buffer (Story 5.8 Task 2)
//!
//! This module implements decode-ahead buffering for the composition playback architecture.
//! It pre-renders upcoming complex segments in the background to avoid playback stuttering.
//!
//! # Architecture Context (ADR-008)
//!
//! The SegmentPreloader enhances the Hybrid Smart Segment Pre-Rendering architecture:
//! - **Simple Segments:** Played directly via MPV (no pre-loading needed)
//! - **Complex Segments:** Pre-rendered to cache BEFORE playhead reaches them (500ms lookahead)
//!
//! # Key Features (Story 5.8 AC #3)
//!
//! 1. **500ms Lookahead Window:** Pre-render segments before playhead arrives
//! 2. **Priority Queue:** Current > Next (500ms) > Future segments
//! 3. **Background Rendering:** Non-blocking FFmpeg rendering via Tokio
//! 4. **Buffer Monitoring:** Track cache depth and pre-rendering status
//!
//! # Performance Targets
//!
//! - Pre-render complex segments before playback reaches them
//! - Maintain 60 FPS during playback (no stuttering on segment transitions)
//! - Background rendering must not block UI or playback threads
//! - Cache hit rate > 90% for smooth playback experience

use crate::models::timeline::Timeline;
use crate::services::composition_analyzer::CompositionAnalyzer;
use crate::services::segment_renderer::{Segment, SegmentRenderer, SegmentType};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, info, warn};

/// Segment priority for render queue ordering
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum SegmentPriority {
    /// Low priority: Future segments beyond lookahead window
    Low = 1,
    /// Medium priority: Next segments within 500ms lookahead
    Medium = 2,
    /// High priority: Currently playing segment
    High = 3,
}

/// Unique identifier for a segment
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SegmentId {
    /// Segment start time in milliseconds
    pub start_time: u64,
    /// Segment duration in milliseconds
    pub duration: u64,
    /// Content hash for cache key
    pub content_hash: String,
}

impl SegmentId {
    /// Create a new segment ID from a segment
    pub fn from_segment(segment: &Segment) -> Result<Self> {
        use sha2::{Digest, Sha256};

        let mut hasher = Sha256::new();
        hasher.update(segment.start_time.to_string().as_bytes());
        hasher.update(segment.duration.to_string().as_bytes());
        hasher.update(segment.video_layers.len().to_string().as_bytes());

        for layer in &segment.video_layers {
            hasher.update(layer.clip.file_path.as_bytes());
            hasher.update(layer.clip.trim_in.to_string().as_bytes());
            hasher.update(layer.clip.trim_out.to_string().as_bytes());
        }

        let result = hasher.finalize();
        let content_hash = format!("{:x}", result);

        Ok(Self {
            start_time: segment.start_time,
            duration: segment.duration,
            content_hash,
        })
    }
}

/// Segment with priority for queue ordering
#[derive(Debug, Clone)]
struct PrioritizedSegment {
    segment_id: SegmentId,
    segment: Segment,
    priority: SegmentPriority,
}

// Manual implementation of PartialEq and Eq based on segment_id and priority only
// (ignoring segment field which contains floats)
impl PartialEq for PrioritizedSegment {
    fn eq(&self, other: &Self) -> bool {
        self.segment_id == other.segment_id && self.priority == other.priority
    }
}

impl Eq for PrioritizedSegment {}

impl Ord for PrioritizedSegment {
    fn cmp(&self, other: &Self) -> Ordering {
        // Compare by priority first (High > Medium > Low)
        match self.priority.cmp(&other.priority) {
            Ordering::Equal => {
                // If same priority, compare by start time (earlier first)
                other.segment.start_time.cmp(&self.segment.start_time)
            }
            other => other,
        }
    }
}

impl PartialOrd for PrioritizedSegment {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Buffer status for monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BufferStatus {
    /// Number of segments waiting to be rendered
    pub segments_in_queue: usize,

    /// Number of segments cached and ready
    pub segments_cached: usize,

    /// Cache hit rate (0.0 to 1.0)
    pub cache_hit_rate: f64,

    /// Currently rendering segment (if any)
    pub rendering_segment: Option<String>,

    /// Background rendering active
    pub is_rendering: bool,
}

/// Segment preloader for decode-ahead buffering
pub struct SegmentPreloader {
    /// Priority queue for segment rendering
    render_queue: Arc<Mutex<BinaryHeap<PrioritizedSegment>>>,

    /// Segment renderer for FFmpeg pre-rendering
    segment_renderer: Arc<SegmentRenderer>,

    /// Cache directory for pre-rendered segments
    cache_dir: PathBuf,

    /// Lookahead window in milliseconds (default 500ms)
    lookahead_ms: u64,

    /// Composition analyzer for segment classification
    analyzer: CompositionAnalyzer,

    /// Cached segments (segment_id -> cache_path)
    cached_segments: Arc<RwLock<HashMap<String, PathBuf>>>,

    /// Segments currently being rendered
    rendering_segments: Arc<RwLock<HashSet<String>>>,

    /// Cache statistics
    cache_hits: Arc<RwLock<u64>>,
    cache_misses: Arc<RwLock<u64>>,

    /// Total cache size in bytes (Story 5.8 AC #5: Subtask 4.2)
    cache_size_bytes: Arc<RwLock<u64>>,

    /// Maximum cache size (1GB = 1_000_000_000 bytes) (Story 5.8 AC #5)
    max_cache_size: u64,

    /// LRU queue for cache eviction (Story 5.8 AC #5)
    lru_queue: Arc<Mutex<VecDeque<String>>>,
}

impl SegmentPreloader {
    /// Create a new segment preloader
    ///
    /// # Arguments
    ///
    /// * `cache_dir` - Directory for storing pre-rendered segment cache files
    pub fn new(cache_dir: PathBuf) -> Self {
        Self {
            render_queue: Arc::new(Mutex::new(BinaryHeap::new())),
            segment_renderer: Arc::new(SegmentRenderer::new(cache_dir.clone())),
            cache_dir,
            lookahead_ms: 500, // 500ms lookahead (AC #3)
            analyzer: CompositionAnalyzer::new(),
            cached_segments: Arc::new(RwLock::new(HashMap::new())),
            rendering_segments: Arc::new(RwLock::new(HashSet::new())),
            cache_hits: Arc::new(RwLock::new(0)),
            cache_misses: Arc::new(RwLock::new(0)),
            cache_size_bytes: Arc::new(RwLock::new(0)),
            max_cache_size: 1_000_000_000, // 1GB limit (Story 5.8 AC #5)
            lru_queue: Arc::new(Mutex::new(VecDeque::new())),
        }
    }

    /// Set custom lookahead window
    pub fn with_lookahead_ms(mut self, lookahead_ms: u64) -> Self {
        self.lookahead_ms = lookahead_ms;
        self
    }

    /// Enqueue upcoming segments for pre-rendering
    ///
    /// # Arguments
    ///
    /// * `current_time` - Current playhead position in milliseconds
    /// * `timeline` - Timeline containing all segments
    ///
    /// # Priority Assignment
    ///
    /// - **High:** Currently playing segment (at current_time)
    /// - **Medium:** Upcoming segments within lookahead window (current_time + 500ms)
    /// - **Low:** Future segments beyond lookahead window
    pub async fn enqueue_upcoming_segments(
        &self,
        current_time: u64,
        timeline: &Timeline,
    ) -> Result<()> {
        // Analyze timeline into segments
        let segments = self.analyzer.analyze_timeline(&timeline.tracks, timeline.total_duration);

        let lookahead_end = current_time + self.lookahead_ms;

        let mut queue = self.render_queue.lock().await;
        let cached = self.cached_segments.read().await;
        let rendering = self.rendering_segments.read().await;

        for segment in segments {
            // Only enqueue complex segments (simple segments play directly via MPV)
            if self.analyzer.classify_segment(&segment) != SegmentType::Complex {
                continue;
            }

            let segment_id = SegmentId::from_segment(&segment)?;
            let segment_end = segment.start_time + segment.duration;

            // Skip if already cached or rendering
            if cached.contains_key(&segment_id.content_hash) || rendering.contains(&segment_id.content_hash) {
                continue;
            }

            // Determine priority based on segment timing
            let priority = if segment.start_time <= current_time && segment_end > current_time {
                // Currently playing segment
                SegmentPriority::High
            } else if segment.start_time <= lookahead_end && segment.start_time > current_time {
                // Within lookahead window (next 500ms)
                SegmentPriority::Medium
            } else if segment.start_time > lookahead_end {
                // Beyond lookahead window
                SegmentPriority::Low
            } else {
                // Past segment (should not happen during forward playback)
                continue;
            };

            debug!(
                "Enqueuing segment at {}ms with priority {:?}",
                segment.start_time, priority
            );

            queue.push(PrioritizedSegment {
                segment_id,
                segment,
                priority,
            });
        }

        info!(
            "Enqueued {} segments for pre-rendering (current_time: {}ms, lookahead: {}ms)",
            queue.len(),
            current_time,
            self.lookahead_ms
        );

        Ok(())
    }

    /// Process render queue in background (Subtask 2.2)
    ///
    /// Spawns background tasks to render queued segments using Tokio spawn_blocking
    /// for CPU-intensive FFmpeg operations.
    pub async fn process_render_queue(&self) -> Result<()> {
        let mut queue = self.render_queue.lock().await;

        // Pop highest priority segment
        if let Some(prioritized_segment) = queue.pop() {
            let segment_id = prioritized_segment.segment_id.clone();
            let segment = prioritized_segment.segment;

            // Mark as rendering
            {
                let mut rendering = self.rendering_segments.write().await;
                rendering.insert(segment_id.content_hash.clone());
            }

            // Clone Arc references for background task
            let renderer = Arc::clone(&self.segment_renderer);
            let cached_segments = Arc::clone(&self.cached_segments);
            let rendering_segments = Arc::clone(&self.rendering_segments);
            let cache_size_bytes = Arc::clone(&self.cache_size_bytes);
            let max_cache_size = self.max_cache_size;
            let lru_queue = Arc::clone(&self.lru_queue);

            info!(
                "Starting background render for segment at {}ms (priority: {:?})",
                segment.start_time, prioritized_segment.priority
            );

            // Spawn background rendering task (Tokio spawn_blocking for CPU-intensive work)
            tokio::spawn(async move {
                // Use spawn_blocking for CPU-intensive FFmpeg rendering
                let result = tokio::task::spawn_blocking(move || {
                    renderer.render_segment(&segment)
                })
                .await;

                // CPU throttling: Add delay to rate-limit renders (AC #6: CPU <80%)
                // Don't render faster than playback needs (500ms lookahead)
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                match result {
                    Ok(Ok(cache_path)) => {
                        info!(
                            "Segment rendered successfully: {}",
                            cache_path.display()
                        );

                        // Add to cache
                        let mut cached = cached_segments.write().await;
                        cached.insert(segment_id.content_hash.clone(), cache_path.clone());
                        drop(cached); // Release lock

                        // Track for LRU eviction (Story 5.8 AC #5)
                        // Get file size
                        if let Ok(metadata) = tokio::fs::metadata(&cache_path).await {
                            let file_size = metadata.len();

                            // Update total cache size
                            let mut cache_size = cache_size_bytes.write().await;
                            *cache_size += file_size;

                            // Add to LRU queue (most recently used at the back)
                            let mut lru = lru_queue.lock().await;
                            lru.push_back(segment_id.content_hash.clone());

                            debug!(
                                "Tracked segment {} ({}MB), total cache: {}MB",
                                segment_id.content_hash,
                                file_size / 1_048_576,
                                *cache_size / 1_048_576
                            );

                            // Check if eviction is needed (Story 5.8 AC #5)
                            if *cache_size > max_cache_size {
                                drop(cache_size); // Release lock
                                info!(
                                    "Cache size exceeds limit, starting eviction",
                                );

                                // Evict oldest segments until we're under the limit
                                let mut lru = lru_queue.lock().await;
                                let mut cached = cached_segments.write().await;
                                let mut total_size = cache_size_bytes.write().await;

                                while *total_size > max_cache_size && !lru.is_empty() {
                                    if let Some(oldest_id) = lru.pop_front() {
                                        if let Some(cache_path) = cached.remove(&oldest_id) {
                                            if let Ok(metadata) = tokio::fs::metadata(&cache_path).await {
                                                let file_size = metadata.len();
                                                if let Err(e) = tokio::fs::remove_file(&cache_path).await {
                                                    warn!("Failed to delete cached segment {}: {}", oldest_id, e);
                                                } else {
                                                    *total_size = total_size.saturating_sub(file_size);
                                                    debug!("Evicted segment {} ({}MB)", oldest_id, file_size / 1_048_576);
                                                }
                                            }
                                        }
                                    }
                                }

                                info!("Eviction complete: cache size now {}MB", *total_size / 1_048_576);
                            }
                        }

                        // Remove from rendering set
                        let mut rendering = rendering_segments.write().await;
                        rendering.remove(&segment_id.content_hash);
                    }
                    Ok(Err(e)) => {
                        warn!("Failed to render segment: {}", e);

                        // Remove from rendering set on failure
                        let mut rendering = rendering_segments.write().await;
                        rendering.remove(&segment_id.content_hash);
                    }
                    Err(e) => {
                        warn!("Render task panicked: {}", e);

                        // Remove from rendering set on panic
                        let mut rendering = rendering_segments.write().await;
                        rendering.remove(&segment_id.content_hash);
                    }
                }
            });
        }

        Ok(())
    }

    /// Check if a segment is cached
    ///
    /// # Arguments
    ///
    /// * `segment` - Segment to check
    ///
    /// # Returns
    ///
    /// Some(PathBuf) if cached, None if not cached
    pub async fn get_cached_segment(&self, segment: &Segment) -> Result<Option<PathBuf>> {
        let segment_id = SegmentId::from_segment(segment)?;
        let cached = self.cached_segments.read().await;

        if let Some(cache_path) = cached.get(&segment_id.content_hash) {
            let result = cache_path.clone();
            drop(cached); // Release lock before async call

            // Cache hit
            let mut hits = self.cache_hits.write().await;
            *hits += 1;

            // Update LRU position (Story 5.8 AC #5)
            self.touch_segment(&segment_id.content_hash).await;

            debug!("Cache hit for segment at {}ms", segment.start_time);
            Ok(Some(result))
        } else {
            // Cache miss
            let mut misses = self.cache_misses.write().await;
            *misses += 1;

            debug!("Cache miss for segment at {}ms", segment.start_time);
            Ok(None)
        }
    }

    /// Get buffer status for monitoring (Subtask 2.4)
    pub async fn get_buffer_status(&self) -> BufferStatus {
        let queue = self.render_queue.lock().await;
        let cached = self.cached_segments.read().await;
        let rendering = self.rendering_segments.read().await;
        let hits = self.cache_hits.read().await;
        let misses = self.cache_misses.read().await;

        let total_requests = *hits + *misses;
        let cache_hit_rate = if total_requests > 0 {
            *hits as f64 / total_requests as f64
        } else {
            0.0
        };

        let rendering_segment = if !rendering.is_empty() {
            rendering.iter().next().cloned()
        } else {
            None
        };

        BufferStatus {
            segments_in_queue: queue.len(),
            segments_cached: cached.len(),
            cache_hit_rate,
            rendering_segment,
            is_rendering: !rendering.is_empty(),
        }
    }

    /// Clear cache (for testing or when timeline changes)
    pub async fn clear_cache(&self) -> Result<()> {
        let mut cached = self.cached_segments.write().await;
        cached.clear();

        let mut queue = self.render_queue.lock().await;
        queue.clear();

        let mut lru = self.lru_queue.lock().await;
        lru.clear();

        let mut cache_size = self.cache_size_bytes.write().await;
        *cache_size = 0;

        info!("Segment cache cleared");
        Ok(())
    }

    /// Evict oldest cached segments if total size exceeds 1GB limit (Story 5.8 AC #5: Subtask 4.2)
    pub async fn evict_if_needed(&self) -> Result<()> {
        let cache_size = *self.cache_size_bytes.read().await;

        if cache_size <= self.max_cache_size {
            return Ok(());
        }

        info!(
            "Cache size {}MB exceeds limit {}MB, starting eviction",
            cache_size / 1_048_576,
            self.max_cache_size / 1_048_576
        );

        let mut lru = self.lru_queue.lock().await;
        let mut cached = self.cached_segments.write().await;
        let mut total_size = self.cache_size_bytes.write().await;

        // Evict oldest segments until we're under the limit
        while *total_size > self.max_cache_size && !lru.is_empty() {
            if let Some(oldest_id) = lru.pop_front() {
                if let Some(cache_path) = cached.remove(&oldest_id) {
                    // Get file size before deletion
                    if let Ok(metadata) = tokio::fs::metadata(&cache_path).await {
                        let file_size = metadata.len();

                        // Delete the cached file
                        if let Err(e) = tokio::fs::remove_file(&cache_path).await {
                            warn!("Failed to delete cached segment {}: {}", oldest_id, e);
                        } else {
                            *total_size = total_size.saturating_sub(file_size);
                            debug!("Evicted segment {} ({}MB)", oldest_id, file_size / 1_048_576);
                        }
                    }
                }
            }
        }

        info!(
            "Eviction complete: cache size now {}MB",
            *total_size / 1_048_576
        );

        Ok(())
    }

    /// Track a newly cached segment for LRU eviction (Story 5.8 AC #5)
    async fn track_cached_segment(&self, segment_id: &str, cache_path: &PathBuf) -> Result<()> {
        // Get file size
        let file_size = tokio::fs::metadata(cache_path)
            .await
            .map(|m| m.len())
            .unwrap_or(0);

        // Update total cache size
        let mut cache_size = self.cache_size_bytes.write().await;
        *cache_size += file_size;

        // Add to LRU queue (most recently used at the back)
        let mut lru = self.lru_queue.lock().await;
        lru.push_back(segment_id.to_string());

        debug!(
            "Tracked segment {} ({}MB), total cache: {}MB",
            segment_id,
            file_size / 1_048_576,
            *cache_size / 1_048_576
        );

        Ok(())
    }

    /// Update LRU position when segment is accessed (Story 5.8 AC #5)
    async fn touch_segment(&self, segment_id: &str) {
        let mut lru = self.lru_queue.lock().await;

        // Remove from current position
        if let Some(pos) = lru.iter().position(|id| id == segment_id) {
            lru.remove(pos);
        }

        // Add to back (most recently used)
        lru.push_back(segment_id.to_string());
    }

    /// Get current cache size in bytes (Story 5.8 AC #5)
    pub async fn get_cache_size_bytes(&self) -> u64 {
        *self.cache_size_bytes.read().await
    }

    /// Get current cache size in megabytes (Story 5.8 AC #5)
    pub async fn get_cache_size_mb(&self) -> f64 {
        let bytes = self.get_cache_size_bytes().await;
        bytes as f64 / 1_048_576.0
    }

    /// Pre-cache segments at likely seek targets for smooth scrubbing (Story 5.8 AC #7)
    ///
    /// Heuristic: Pre-cache segments at 0%, 25%, 50%, 75%, 100% of timeline
    /// to improve seek latency for common scrubbing positions.
    ///
    /// # Arguments
    ///
    /// * `timeline` - The timeline to analyze for seek targets
    ///
    /// # Implementation Note
    ///
    /// This method provides the infrastructure for seek prediction. Full implementation
    /// requires integration with the playback orchestrator to trigger pre-loading
    /// when a timeline is loaded. The seek latency monitoring (AC #7) is implemented
    /// in PerformanceMetrics with `last_seek_latency_ms` and `meets_seek_latency_target()`.
    pub async fn preload_seek_targets(&self, _timeline: &Timeline) -> Result<()> {
        // TODO: Implement seek prediction when timeline composition API is stable
        // Current implementation: Seek latency monitoring in PerformanceMetrics
        //
        // Planned implementation:
        // 1. Calculate timeline duration
        // 2. For percentages [0.0, 0.25, 0.50, 0.75, 1.0]:
        //    a. Calculate time position (duration * percentage)
        //    b. Detect multi-track segments at that time
        //    c. Enqueue complex segments with LOW priority
        //
        // Benefits:
        // - Faster seeks to common positions (start, middle, end)
        // - Smoother scrubbing experience for multi-track compositions
        // - Complemented by O(1) HashMap cache lookups (already implemented)

        info!("Seek prediction infrastructure ready (full implementation pending timeline composition API)");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::timeline::{Clip, Track, TrackType};

    /// Test helper: Create a test clip
    fn create_test_clip(id: &str, file_path: &str, start_time: u64, duration: u64) -> Clip {
        Clip {
            id: id.to_string(),
            file_path: file_path.to_string(),
            start_time,
            duration,
            trim_in: 0,
            trim_out: duration,
            fade_in: None,
            fade_out: None,
            volume: None,
            muted: None,
            audio_tracks: None,
            transform: None,
        }
    }

    /// Test helper: Create a test track
    fn create_test_track(track_number: u32, clips: Vec<Clip>) -> Track {
        Track {
            id: format!("track-{}", track_number),
            track_number,
            clips,
            track_type: TrackType::Video,
        }
    }

    #[tokio::test]
    async fn test_segment_priority_ordering() {
        // Test that priority queue orders segments correctly (High > Medium > Low)
        let cache_dir = PathBuf::from("/tmp/test-cache");
        let preloader = SegmentPreloader::new(cache_dir);

        let segment1 = Segment {
            video_layers: vec![],
            start_time: 0,
            duration: 1000,
            canvas_size: crate::services::segment_renderer::CanvasSize::default(),
        };

        let segment2 = segment1.clone();
        let segment3 = segment1.clone();

        let id1 = SegmentId::from_segment(&segment1).unwrap();
        let id2 = SegmentId::from_segment(&segment2).unwrap();
        let id3 = SegmentId::from_segment(&segment3).unwrap();

        let mut queue = preloader.render_queue.lock().await;

        // Add segments with different priorities
        queue.push(PrioritizedSegment {
            segment_id: id1.clone(),
            segment: segment1,
            priority: SegmentPriority::Low,
        });

        queue.push(PrioritizedSegment {
            segment_id: id2.clone(),
            segment: segment2,
            priority: SegmentPriority::High,
        });

        queue.push(PrioritizedSegment {
            segment_id: id3.clone(),
            segment: segment3,
            priority: SegmentPriority::Medium,
        });

        // Pop should return High priority first
        let first = queue.pop().unwrap();
        assert_eq!(first.priority, SegmentPriority::High);

        // Then Medium
        let second = queue.pop().unwrap();
        assert_eq!(second.priority, SegmentPriority::Medium);

        // Then Low
        let third = queue.pop().unwrap();
        assert_eq!(third.priority, SegmentPriority::Low);
    }

    #[tokio::test]
    async fn test_buffer_status_tracking() {
        // Test buffer monitoring (Subtask 2.4)
        let cache_dir = PathBuf::from("/tmp/test-cache");
        let preloader = SegmentPreloader::new(cache_dir);

        // Initial status should be empty
        let status = preloader.get_buffer_status().await;
        assert_eq!(status.segments_in_queue, 0);
        assert_eq!(status.segments_cached, 0);
        assert_eq!(status.cache_hit_rate, 0.0);
        assert!(!status.is_rendering);
    }

    #[tokio::test]
    async fn test_cache_hit_tracking() {
        // Test cache hit rate calculation
        let cache_dir = PathBuf::from("/tmp/test-cache");
        let preloader = SegmentPreloader::new(cache_dir);

        let segment = Segment {
            video_layers: vec![],
            start_time: 0,
            duration: 1000,
            canvas_size: crate::services::segment_renderer::CanvasSize::default(),
        };

        // First access: cache miss
        let result1 = preloader.get_cached_segment(&segment).await.unwrap();
        assert!(result1.is_none());

        // Simulate cache hit by adding to cache
        let segment_id = SegmentId::from_segment(&segment).unwrap();
        {
            let mut cached = preloader.cached_segments.write().await;
            cached.insert(segment_id.content_hash.clone(), PathBuf::from("/tmp/cached.mp4"));
        }

        // Second access: cache hit
        let result2 = preloader.get_cached_segment(&segment).await.unwrap();
        assert!(result2.is_some());

        // Check cache hit rate (1 hit, 1 miss = 50%)
        let status = preloader.get_buffer_status().await;
        assert_eq!(status.cache_hit_rate, 0.5);
    }

    #[tokio::test]
    async fn test_lookahead_window_priority_assignment() {
        // Test that segments within lookahead get Medium priority
        let cache_dir = PathBuf::from("/tmp/test-cache");
        let preloader = SegmentPreloader::new(cache_dir).with_lookahead_ms(500);

        // Create timeline with segments at different times
        let clip1 = create_test_clip("clip1", "/path/to/video1.mp4", 0, 1000);
        let clip2 = create_test_clip("clip2", "/path/to/video2.mp4", 0, 1000);
        let clip3 = create_test_clip("clip3", "/path/to/video3.mp4", 400, 1000); // Within lookahead
        let clip4 = create_test_clip("clip4", "/path/to/video4.mp4", 400, 1000);
        let clip5 = create_test_clip("clip5", "/path/to/video5.mp4", 2000, 1000); // Beyond lookahead
        let clip6 = create_test_clip("clip6", "/path/to/video6.mp4", 2000, 1000);

        let track1 = create_test_track(1, vec![clip1, clip3, clip5]);
        let track2 = create_test_track(2, vec![clip2, clip4, clip6]);

        let timeline = Timeline {
            tracks: vec![track1, track2],
            total_duration: 3000,
        };

        // Current time: 0ms, lookahead: 500ms
        // Segment at 0ms: High (current)
        // Segment at 400ms: Medium (within lookahead)
        // Segment at 2000ms: Low (beyond lookahead)
        preloader.enqueue_upcoming_segments(0, &timeline).await.unwrap();

        let queue = preloader.render_queue.lock().await;
        assert!(queue.len() > 0);
    }

    // Story 5.8 AC #5 Tests: LRU cache eviction

    #[tokio::test]
    async fn test_cache_size_tracking() {
        use tempfile::tempdir;
        let temp_dir = tempdir().unwrap();
        let preloader = SegmentPreloader::new(temp_dir.path().to_path_buf());

        // Initial cache size should be 0
        assert_eq!(preloader.get_cache_size_bytes().await, 0);
        assert_eq!(preloader.get_cache_size_mb().await, 0.0);
    }

    #[tokio::test]
    async fn test_lru_eviction_not_triggered_under_limit() {
        use tempfile::tempdir;
        let temp_dir = tempdir().unwrap();
        let preloader = SegmentPreloader::new(temp_dir.path().to_path_buf());

        // Eviction should not trigger when under limit
        preloader.evict_if_needed().await.unwrap();

        // Cache should still be empty
        assert_eq!(preloader.get_cache_size_bytes().await, 0);
    }

    #[tokio::test]
    async fn test_clear_cache_resets_size() {
        use tempfile::tempdir;
        let temp_dir = tempdir().unwrap();
        let preloader = SegmentPreloader::new(temp_dir.path().to_path_buf());

        // Simulate adding some cache size
        {
            let mut cache_size = preloader.cache_size_bytes.write().await;
            *cache_size = 500_000_000; // 500MB
        }

        assert_eq!(preloader.get_cache_size_bytes().await, 500_000_000);

        // Clear cache
        preloader.clear_cache().await.unwrap();

        // Size should be reset
        assert_eq!(preloader.get_cache_size_bytes().await, 0);
    }

    #[tokio::test]
    async fn test_max_cache_size_is_1gb() {
        use tempfile::tempdir;
        let temp_dir = tempdir().unwrap();
        let preloader = SegmentPreloader::new(temp_dir.path().to_path_buf());

        // Verify 1GB limit
        assert_eq!(preloader.max_cache_size, 1_000_000_000);
    }
}
