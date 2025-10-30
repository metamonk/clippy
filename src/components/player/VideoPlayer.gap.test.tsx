/**
 * VideoPlayer Gap Handling Integration Tests
 * Story 5.4: Gap Handling with Black Frames
 *
 * Tests integration of gap detection, black frame rendering,
 * and playhead advancement during timeline gaps.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { VideoPlayer } from './VideoPlayer';
import { usePlayerStore } from '@/stores/playerStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { useCompositionStore } from '@/stores/compositionStore';
import type { Track, Clip } from '@/types/timeline';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ success: true, data: {} }),
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock MPV utility functions
vi.mock('@/lib/tauri/mpv', () => ({
  setMpvVolume: vi.fn().mockResolvedValue(undefined),
  applyMpvFadeFilters: vi.fn().mockResolvedValue(undefined),
  clearMpvAudioFilters: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Helper: Create test clip
 */
function createTestClip(
  startTime: number,
  duration: number,
  trimIn = 0,
  trimOut?: number
): Clip {
  const finalTrimOut = trimOut !== undefined ? trimOut : duration;
  return {
    id: `clip-${startTime}`,
    filePath: `/test/video-${startTime}.mp4`,
    startTime,
    duration,
    trimIn,
    trimOut: finalTrimOut,
  };
}

/**
 * Helper: Create test track
 */
function createTestTrack(clips: Clip[], trackNumber = 1): Track {
  return {
    id: `track-${trackNumber}`,
    trackNumber,
    clips,
    trackType: 'video',
  };
}

describe('VideoPlayer - Gap Handling Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset stores
    usePlayerStore.getState().reset?.();
    useTimelineStore.getState().resetTimeline?.();
    useCompositionStore.getState().reset();

    // Set default player mode to timeline
    usePlayerStore.setState({ mode: 'timeline' });
  });

  describe('Gap Detection (AC #1)', () => {
    it('should detect gaps at timeline start', () => {
      // Timeline with gap at start: [GAP 0-1000], clip 1000-2000
      const track = createTestTrack([createTestClip(1000, 1000, 0, 1000)]);
      useTimelineStore.setState({
        tracks: [track],
        totalDuration: 2000,
      });

      // Render player
      render(<VideoPlayer src="/test/video.mp4" />);

      // At time 500ms, should be in gap
      const compositionStore = useCompositionStore.getState();
      const activeClips = compositionStore.getActiveClipsAtTime(500);
      expect(activeClips).toHaveLength(0); // No clips at 500ms = gap
    });

    it('should detect gaps in middle of timeline', () => {
      // Timeline: clip 0-1000, [GAP 1000-1500], clip 1500-2500
      const track = createTestTrack([
        createTestClip(0, 1000, 0, 1000),
        createTestClip(1500, 1000, 0, 1000),
      ]);
      useTimelineStore.setState({
        tracks: [track],
        totalDuration: 2500,
      });

      render(<VideoPlayer src="/test/video.mp4" />);

      const compositionStore = useCompositionStore.getState();

      // At 500ms: should be in clip
      const activeClips500 = compositionStore.getActiveClipsAtTime(500);
      expect(activeClips500).toHaveLength(1);

      // At 1250ms: should be in gap
      const activeClips1250 = compositionStore.getActiveClipsAtTime(1250);
      expect(activeClips1250).toHaveLength(0); // Gap

      // At 2000ms: should be in second clip
      const activeClips2000 = compositionStore.getActiveClipsAtTime(2000);
      expect(activeClips2000).toHaveLength(1);
    });

    it('should detect gaps at timeline end', () => {
      // Timeline: clip 0-1000, [GAP 1000-2000]
      const track = createTestTrack([createTestClip(0, 1000, 0, 1000)]);
      useTimelineStore.setState({
        tracks: [track],
        totalDuration: 2000,
      });

      render(<VideoPlayer src="/test/video.mp4" />);

      const compositionStore = useCompositionStore.getState();

      // At 1500ms: should be in gap at end
      const activeClips = compositionStore.getActiveClipsAtTime(1500);
      expect(activeClips).toHaveLength(0); // Gap
    });

    it('should detect multiple consecutive gaps', () => {
      // Timeline: clip 0-500, [GAP 500-1000], clip 1000-1500, [GAP 1500-2000], clip 2000-2500
      const track = createTestTrack([
        createTestClip(0, 500, 0, 500),
        createTestClip(1000, 500, 0, 500),
        createTestClip(2000, 500, 0, 500),
      ]);
      useTimelineStore.setState({
        tracks: [track],
        totalDuration: 2500,
      });

      render(<VideoPlayer src="/test/video.mp4" />);

      const compositionStore = useCompositionStore.getState();

      // Check each region
      expect(compositionStore.getActiveClipsAtTime(250)).toHaveLength(1); // Clip
      expect(compositionStore.getActiveClipsAtTime(750)).toHaveLength(0); // Gap 1
      expect(compositionStore.getActiveClipsAtTime(1250)).toHaveLength(1); // Clip
      expect(compositionStore.getActiveClipsAtTime(1750)).toHaveLength(0); // Gap 2
      expect(compositionStore.getActiveClipsAtTime(2250)).toHaveLength(1); // Clip
    });
  });

  describe('Black Frame Rendering (AC #2)', () => {
    it('should render canvas element for video playback', async () => {
      const track = createTestTrack([createTestClip(0, 1000, 0, 1000)]);
      useTimelineStore.setState({
        tracks: [track],
        totalDuration: 1000,
      });

      render(<VideoPlayer src="/test/video.mp4" />);

      // Wait for MPV initialization and canvas rendering
      await waitFor(() => {
        const canvas = document.querySelector('canvas');
        expect(canvas).toBeInTheDocument();
      });
    });

    it('should maintain canvas dimensions during gaps', async () => {
      const track = createTestTrack([createTestClip(1000, 1000, 0, 1000)]);
      useTimelineStore.setState({
        tracks: [track],
        totalDuration: 2000,
      });

      render(<VideoPlayer src="/test/video.mp4" />);

      await waitFor(() => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        expect(canvas).toBeInTheDocument();

        // Canvas should have default dimensions (1920x1080) or video dimensions
        expect(canvas.width).toBeGreaterThan(0);
        expect(canvas.height).toBeGreaterThan(0);
      });
    });
  });

  describe('Playhead Advancement (AC #5)', () => {
    it('should track composition time during clip playback', () => {
      const track = createTestTrack([createTestClip(0, 2000, 0, 2000)]);
      useTimelineStore.setState({
        tracks: [track],
        totalDuration: 2000,
      });

      render(<VideoPlayer src="/test/video.mp4" />);

      const compositionStore = useCompositionStore.getState();

      // Update composition time
      compositionStore.setCompositionTime(500);
      expect(compositionStore.currentCompositionTime).toBe(500);

      compositionStore.setCompositionTime(1500);
      expect(compositionStore.currentCompositionTime).toBe(1500);
    });

    it('should track composition time during gaps', () => {
      // Timeline: [GAP 0-1000], clip 1000-2000
      const track = createTestTrack([createTestClip(1000, 1000, 0, 1000)]);
      useTimelineStore.setState({
        tracks: [track],
        totalDuration: 2000,
      });

      render(<VideoPlayer src="/test/video.mp4" />);

      const compositionStore = useCompositionStore.getState();

      // Playhead should be trackable even in gap
      compositionStore.setCompositionTime(500); // In gap
      expect(compositionStore.currentCompositionTime).toBe(500);

      compositionStore.setCompositionTime(1500); // In clip
      expect(compositionStore.currentCompositionTime).toBe(1500);
    });
  });

  describe('Edge Cases (AC #1, #7)', () => {
    it('should handle empty timeline', () => {
      useTimelineStore.setState({
        tracks: [],
        totalDuration: 0,
      });

      render(<VideoPlayer src="/test/video.mp4" />);

      const compositionStore = useCompositionStore.getState();
      const activeClips = compositionStore.getActiveClipsAtTime(500);
      expect(activeClips).toHaveLength(0); // No clips = gap
    });

    it('should handle timeline with single clip and no gaps', () => {
      const track = createTestTrack([createTestClip(0, 2000, 0, 2000)]);
      useTimelineStore.setState({
        tracks: [track],
        totalDuration: 2000,
      });

      render(<VideoPlayer src="/test/video.mp4" />);

      const compositionStore = useCompositionStore.getState();

      // All times within clip should have active clip
      expect(compositionStore.getActiveClipsAtTime(0)).toHaveLength(1);
      expect(compositionStore.getActiveClipsAtTime(1000)).toHaveLength(1);
      expect(compositionStore.getActiveClipsAtTime(1999)).toHaveLength(1);

      // Time at or after clip end should be gap (if timeline extends beyond)
      expect(compositionStore.getActiveClipsAtTime(2000)).toHaveLength(0);
    });

    it('should handle gaps with trimmed clips', () => {
      // Clip with trim: duration 2000ms, but trimmed to 500ms (trimIn=0, trimOut=500)
      // Gap will be 500-1000 even though file duration is 2000ms
      const track = createTestTrack([
        createTestClip(0, 2000, 0, 500), // Effective duration: 500ms
        createTestClip(1000, 1000, 0, 1000),
      ]);
      useTimelineStore.setState({
        tracks: [track],
        totalDuration: 2000,
      });

      render(<VideoPlayer src="/test/video.mp4" />);

      const compositionStore = useCompositionStore.getState();

      // Clip 1 ends at 500ms (not 2000ms due to trim)
      expect(compositionStore.getActiveClipsAtTime(250)).toHaveLength(1);
      expect(compositionStore.getActiveClipsAtTime(499)).toHaveLength(1);

      // Gap from 500-1000
      expect(compositionStore.getActiveClipsAtTime(750)).toHaveLength(0);

      // Clip 2 starts at 1000ms
      expect(compositionStore.getActiveClipsAtTime(1500)).toHaveLength(1);
    });

    it('should handle zero-duration gaps (clips back-to-back)', () => {
      // Clips with no gap: 0-1000, 1000-2000
      const track = createTestTrack([
        createTestClip(0, 1000, 0, 1000),
        createTestClip(1000, 1000, 0, 1000),
      ]);
      useTimelineStore.setState({
        tracks: [track],
        totalDuration: 2000,
      });

      render(<VideoPlayer src="/test/video.mp4" />);

      const compositionStore = useCompositionStore.getState();

      // At boundary (1000ms), should be in second clip (inclusive start, exclusive end)
      expect(compositionStore.getActiveClipsAtTime(999)).toHaveLength(1); // First clip
      expect(compositionStore.getActiveClipsAtTime(1000)).toHaveLength(1); // Second clip
      expect(compositionStore.getActiveClipsAtTime(1001)).toHaveLength(1); // Second clip
    });
  });

  describe('Performance (AC #8)', () => {
    it('should update composition time within 16ms (60 FPS)', () => {
      const track = createTestTrack([createTestClip(0, 5000, 0, 5000)]);
      useTimelineStore.setState({
        tracks: [track],
        totalDuration: 5000,
      });

      render(<VideoPlayer src="/test/video.mp4" />);

      const compositionStore = useCompositionStore.getState();

      // Measure composition time update performance
      const startTime = performance.now();
      compositionStore.setCompositionTime(2500);
      const endTime = performance.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(16); // Should complete within 16ms (60 FPS target)
    });

    it('should handle large number of gaps efficiently', () => {
      // Create timeline with 50 clips and 49 gaps
      const clips: Clip[] = [];
      for (let i = 0; i < 50; i++) {
        clips.push(createTestClip(i * 200, 100, 0, 100)); // 100ms clips with 100ms gaps
      }

      const track = createTestTrack(clips);
      useTimelineStore.setState({
        tracks: [track],
        totalDuration: 10000,
      });

      render(<VideoPlayer src="/test/video.mp4" />);

      const compositionStore = useCompositionStore.getState();

      // Performance test: update composition time multiple times
      const startTime = performance.now();
      for (let i = 0; i < 100; i++) {
        compositionStore.setCompositionTime(i * 100);
      }
      const endTime = performance.now();

      const totalDuration = endTime - startTime;
      const avgDuration = totalDuration / 100;

      // Each update should be < 16ms on average
      expect(avgDuration).toBeLessThan(16);
    });
  });
});
