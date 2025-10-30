/**
 * Gap Analyzer Tests
 * Story 5.4 Task 1.4: Unit tests for gap detection
 *
 * Test cases cover:
 * - Single gap in middle of track
 * - Multiple consecutive gaps
 * - Gap at timeline start/end
 * - Multi-track with overlapping gaps
 * - Edge cases (empty timeline, no gaps, zero-duration clips)
 */

import { describe, it, expect } from 'vitest';
import type { Track, Timeline, Clip } from '@/types/timeline';
import {
  analyzeTimelineGaps,
  analyzeTrackGaps,
  isTimeInGap,
  getGapsAtTime,
  areAllTracksInGap,
  getNextGapBoundary,
  type GapSegment,
} from './gapAnalyzer';

/**
 * Helper: Create test clip with minimal properties
 */
function createClip(
  startTime: number,
  duration: number,
  trimIn = 0,
  trimOut?: number
): Clip {
  const finalTrimOut = trimOut !== undefined ? trimOut : duration;
  return {
    id: `clip-${Math.random()}`,
    filePath: '/test/video.mp4',
    startTime,
    duration,
    trimIn,
    trimOut: finalTrimOut,
  };
}

/**
 * Helper: Create test track with clips
 */
function createTrack(
  clips: Clip[],
  trackType: 'video' | 'audio' = 'video',
  trackNumber = 1
): Track {
  return {
    id: `track-${Math.random()}`,
    trackNumber,
    clips,
    trackType,
  };
}

describe('gapAnalyzer', () => {
  describe('analyzeTrackGaps', () => {
    it('should detect no gaps when clips are consecutive', () => {
      // Three clips back-to-back: 0-1000, 1000-2000, 2000-3000
      const track = createTrack([
        createClip(0, 1000, 0, 1000),
        createClip(1000, 1000, 0, 1000),
        createClip(2000, 1000, 0, 1000),
      ]);

      const gaps = analyzeTrackGaps(track, 3000);
      expect(gaps).toHaveLength(0);
    });

    it('should detect single gap in middle of track', () => {
      // Two clips with gap: 0-1000, [GAP 1000-1500], 1500-2500
      const track = createTrack([
        createClip(0, 1000, 0, 1000),
        createClip(1500, 1000, 0, 1000), // Starts at 1500, gap from 1000-1500
      ]);

      const gaps = analyzeTrackGaps(track, 2500);
      expect(gaps).toHaveLength(1);
      expect(gaps[0]).toMatchObject({
        trackId: track.id,
        trackType: 'video',
        startTime: 1000,
        endTime: 1500,
        duration: 500,
        position: 'middle',
      });
    });

    it('should detect multiple consecutive gaps', () => {
      // Clips at: 0-1000, [GAP 1000-1500], 1500-2000, [GAP 2000-2500], 2500-3000
      const track = createTrack([
        createClip(0, 1000, 0, 1000),
        createClip(1500, 500, 0, 500),
        createClip(2500, 500, 0, 500),
      ]);

      const gaps = analyzeTrackGaps(track, 3000);
      expect(gaps).toHaveLength(2);

      // First gap
      expect(gaps[0]).toMatchObject({
        startTime: 1000,
        endTime: 1500,
        duration: 500,
        position: 'middle',
      });

      // Second gap
      expect(gaps[1]).toMatchObject({
        startTime: 2000,
        endTime: 2500,
        duration: 500,
        position: 'middle',
      });
    });

    it('should detect gap at timeline start', () => {
      // Gap at start: [GAP 0-1000], clip at 1000-2000
      const track = createTrack([createClip(1000, 1000, 0, 1000)]);

      const gaps = analyzeTrackGaps(track, 2000);
      expect(gaps).toHaveLength(1);
      expect(gaps[0]).toMatchObject({
        startTime: 0,
        endTime: 1000,
        duration: 1000,
        position: 'start',
      });
    });

    it('should detect gap at timeline end', () => {
      // Clip at 0-1000, [GAP 1000-2000]
      const track = createTrack([createClip(0, 1000, 0, 1000)]);

      const gaps = analyzeTrackGaps(track, 2000);
      expect(gaps).toHaveLength(1);
      expect(gaps[0]).toMatchObject({
        startTime: 1000,
        endTime: 2000,
        duration: 1000,
        position: 'end',
      });
    });

    it('should detect gaps at start, middle, and end', () => {
      // [GAP 0-500], clip 500-1000, [GAP 1000-1500], clip 1500-2000, [GAP 2000-3000]
      const track = createTrack([
        createClip(500, 500, 0, 500),
        createClip(1500, 500, 0, 500),
      ]);

      const gaps = analyzeTrackGaps(track, 3000);
      expect(gaps).toHaveLength(3);

      expect(gaps[0].position).toBe('start');
      expect(gaps[0]).toMatchObject({ startTime: 0, endTime: 500, duration: 500 });

      expect(gaps[1].position).toBe('middle');
      expect(gaps[1]).toMatchObject({ startTime: 1000, endTime: 1500, duration: 500 });

      expect(gaps[2].position).toBe('end');
      expect(gaps[2]).toMatchObject({ startTime: 2000, endTime: 3000, duration: 1000 });
    });

    it('should handle empty track as single gap', () => {
      const track = createTrack([]);

      const gaps = analyzeTrackGaps(track, 5000);
      expect(gaps).toHaveLength(1);
      expect(gaps[0]).toMatchObject({
        startTime: 0,
        endTime: 5000,
        duration: 5000,
        position: 'start',
      });
    });

    it('should handle track with zero timeline duration', () => {
      const track = createTrack([]);

      const gaps = analyzeTrackGaps(track, 0);
      expect(gaps).toHaveLength(0); // No gap if timeline duration is 0
    });

    it('should correctly calculate gap with trimmed clips', () => {
      // Clip 1: File duration 2000ms, but trimmed to 500ms (trimIn=0, trimOut=500)
      // Clip 2: Starts at 1000ms
      // Expected gap: 500-1000 (500ms duration)
      const track = createTrack([
        createClip(0, 2000, 0, 500), // Effective duration: 500ms
        createClip(1000, 1000, 0, 1000),
      ]);

      const gaps = analyzeTrackGaps(track, 2000);
      expect(gaps).toHaveLength(1);
      expect(gaps[0]).toMatchObject({
        startTime: 500,
        endTime: 1000,
        duration: 500,
        position: 'middle',
      });
    });

    it('should handle unsorted clips by sorting them', () => {
      // Clips added in non-chronological order
      const track = createTrack([
        createClip(2000, 1000, 0, 1000),
        createClip(0, 1000, 0, 1000),
        createClip(3500, 500, 0, 500),
      ]);

      const gaps = analyzeTrackGaps(track, 4000);
      // Gap 1: 1000-2000 (middle)
      // Gap 2: 3000-3500 (middle)
      expect(gaps).toHaveLength(2);
      expect(gaps[0]).toMatchObject({ startTime: 1000, endTime: 2000 });
      expect(gaps[1]).toMatchObject({ startTime: 3000, endTime: 3500 });
    });
  });

  describe('analyzeTimelineGaps', () => {
    it('should analyze multi-track timeline with no gaps', () => {
      const timeline: Timeline = {
        tracks: [
          createTrack([createClip(0, 1000, 0, 1000)], 'video', 1),
          createTrack([createClip(0, 1000, 0, 1000)], 'audio', 2),
        ],
        totalDuration: 1000,
      };

      const analysis = analyzeTimelineGaps(timeline);
      expect(analysis.hasGaps).toBe(false);
      expect(analysis.totalGaps).toBe(0);
      expect(analysis.gaps).toHaveLength(0);
      expect(analysis.tracksWithGaps).toHaveLength(0);
    });

    it('should detect gaps on multiple tracks', () => {
      const timeline: Timeline = {
        tracks: [
          createTrack([createClip(0, 500, 0, 500), createClip(1000, 500, 0, 500)], 'video', 1),
          createTrack([createClip(500, 500, 0, 500), createClip(1500, 500, 0, 500)], 'audio', 2),
        ],
        totalDuration: 2000,
      };

      const analysis = analyzeTimelineGaps(timeline);
      expect(analysis.hasGaps).toBe(true);
      // Track 1: Gap at 500-1000 (middle) + 1500-2000 (end) = 2 gaps
      // Track 2: Gap at 0-500 (start) + 1000-1500 (middle) = 2 gaps
      // Total: 4 gaps
      expect(analysis.totalGaps).toBe(4);

      // Track 1: Gap at 500-1000 (middle) and 1500-2000 (end)
      const track1Gaps = analysis.gaps.filter(g => g.trackType === 'video');
      expect(track1Gaps).toHaveLength(2);
      expect(track1Gaps[0]).toMatchObject({ startTime: 500, endTime: 1000 });
      expect(track1Gaps[1]).toMatchObject({ startTime: 1500, endTime: 2000 });

      // Track 2: Gap at 0-500 (start) and 1000-1500 (middle)
      const track2Gaps = analysis.gaps.filter(g => g.trackType === 'audio');
      expect(track2Gaps).toHaveLength(2);
      expect(track2Gaps[0]).toMatchObject({ startTime: 0, endTime: 500 });
      expect(track2Gaps[1]).toMatchObject({ startTime: 1000, endTime: 1500 });

      expect(analysis.tracksWithGaps).toHaveLength(2);
    });

    it('should handle timeline with overlapping gaps', () => {
      // Both tracks have gap at 1000-2000
      const timeline: Timeline = {
        tracks: [
          createTrack([createClip(0, 1000, 0, 1000)], 'video', 1),
          createTrack([createClip(0, 1000, 0, 1000)], 'audio', 2),
        ],
        totalDuration: 3000,
      };

      const analysis = analyzeTimelineGaps(timeline);
      expect(analysis.totalGaps).toBe(2); // One gap per track

      // Both gaps at same position (1000-3000)
      expect(analysis.gaps[0]).toMatchObject({ startTime: 1000, endTime: 3000 });
      expect(analysis.gaps[1]).toMatchObject({ startTime: 1000, endTime: 3000 });
    });

    it('should handle empty timeline', () => {
      const timeline: Timeline = {
        tracks: [],
        totalDuration: 5000,
      };

      const analysis = analyzeTimelineGaps(timeline);
      expect(analysis.hasGaps).toBe(false);
      expect(analysis.totalGaps).toBe(0);
    });
  });

  describe('isTimeInGap', () => {
    const gaps: GapSegment[] = [
      {
        trackId: 'track-1',
        trackType: 'video',
        startTime: 1000,
        endTime: 2000,
        duration: 1000,
        position: 'middle',
      },
      {
        trackId: 'track-1',
        trackType: 'video',
        startTime: 3000,
        endTime: 4000,
        duration: 1000,
        position: 'end',
      },
    ];

    it('should return gap when time is within gap', () => {
      const result = isTimeInGap(1500, gaps);
      expect(result).not.toBeNull();
      expect(result?.startTime).toBe(1000);
      expect(result?.endTime).toBe(2000);
    });

    it('should return null when time is not in any gap', () => {
      const result = isTimeInGap(500, gaps);
      expect(result).toBeNull();
    });

    it('should handle time at gap start boundary (inclusive)', () => {
      const result = isTimeInGap(1000, gaps);
      expect(result).not.toBeNull();
      expect(result?.startTime).toBe(1000);
    });

    it('should handle time at gap end boundary (exclusive)', () => {
      const result = isTimeInGap(2000, gaps);
      expect(result).toBeNull(); // End is exclusive
    });

    it('should return correct gap when multiple gaps exist', () => {
      const result = isTimeInGap(3500, gaps);
      expect(result).not.toBeNull();
      expect(result?.startTime).toBe(3000);
      expect(result?.endTime).toBe(4000);
    });
  });

  describe('getGapsAtTime', () => {
    it('should return all gaps at specific time across tracks', () => {
      const gaps: GapSegment[] = [
        {
          trackId: 'track-1',
          trackType: 'video',
          startTime: 1000,
          endTime: 2000,
          duration: 1000,
          position: 'middle',
        },
        {
          trackId: 'track-2',
          trackType: 'audio',
          startTime: 1000,
          endTime: 2000,
          duration: 1000,
          position: 'middle',
        },
        {
          trackId: 'track-3',
          trackType: 'video',
          startTime: 3000,
          endTime: 4000,
          duration: 1000,
          position: 'end',
        },
      ];

      const gapsAt1500 = getGapsAtTime(1500, gaps);
      expect(gapsAt1500).toHaveLength(2);
      expect(gapsAt1500[0].trackId).toBe('track-1');
      expect(gapsAt1500[1].trackId).toBe('track-2');

      const gapsAt3500 = getGapsAtTime(3500, gaps);
      expect(gapsAt3500).toHaveLength(1);
      expect(gapsAt3500[0].trackId).toBe('track-3');
    });

    it('should return empty array when no gaps at time', () => {
      const gaps: GapSegment[] = [
        {
          trackId: 'track-1',
          trackType: 'video',
          startTime: 1000,
          endTime: 2000,
          duration: 1000,
          position: 'middle',
        },
      ];

      const result = getGapsAtTime(500, gaps);
      expect(result).toHaveLength(0);
    });
  });

  describe('areAllTracksInGap', () => {
    it('should return true when all tracks have gaps at time', () => {
      const timeline: Timeline = {
        tracks: [
          createTrack([createClip(0, 500, 0, 500)], 'video', 1),
          createTrack([createClip(0, 500, 0, 500)], 'audio', 2),
        ],
        totalDuration: 2000,
      };

      // At time 1000ms, both tracks are in gap (500-2000)
      const result = areAllTracksInGap(1000, timeline);
      expect(result).toBe(true);
    });

    it('should return false when only some tracks have gaps', () => {
      const timeline: Timeline = {
        tracks: [
          createTrack([createClip(0, 1000, 0, 1000)], 'video', 1), // Active at 500ms
          createTrack([createClip(1000, 1000, 0, 1000)], 'audio', 2), // Gap at 500ms
        ],
        totalDuration: 2000,
      };

      const result = areAllTracksInGap(500, timeline);
      expect(result).toBe(false);
    });

    it('should return true for empty timeline', () => {
      const timeline: Timeline = {
        tracks: [],
        totalDuration: 1000,
      };

      const result = areAllTracksInGap(500, timeline);
      expect(result).toBe(true);
    });

    it('should return false when all tracks have active clips', () => {
      const timeline: Timeline = {
        tracks: [
          createTrack([createClip(0, 1000, 0, 1000)], 'video', 1),
          createTrack([createClip(0, 1000, 0, 1000)], 'audio', 2),
        ],
        totalDuration: 1000,
      };

      const result = areAllTracksInGap(500, timeline);
      expect(result).toBe(false);
    });
  });

  describe('getNextGapBoundary', () => {
    const gaps: GapSegment[] = [
      {
        trackId: 'track-1',
        trackType: 'video',
        startTime: 1000,
        endTime: 2000,
        duration: 1000,
        position: 'middle',
      },
      {
        trackId: 'track-1',
        trackType: 'video',
        startTime: 3000,
        endTime: 4000,
        duration: 1000,
        position: 'end',
      },
    ];

    it('should return next gap start boundary', () => {
      const result = getNextGapBoundary(500, gaps);
      expect(result).toBe(1000); // Next boundary is gap start at 1000
    });

    it('should return next gap end boundary when inside gap', () => {
      const result = getNextGapBoundary(1500, gaps);
      expect(result).toBe(2000); // Inside first gap, next boundary is end at 2000
    });

    it('should return earliest boundary when multiple options exist', () => {
      const result = getNextGapBoundary(2500, gaps);
      expect(result).toBe(3000); // Next boundary is second gap start at 3000
    });

    it('should return null when no future gaps', () => {
      const result = getNextGapBoundary(5000, gaps);
      expect(result).toBeNull();
    });

    it('should return gap start even if gap end is closer', () => {
      const result = getNextGapBoundary(950, gaps);
      expect(result).toBe(1000); // Gap start at 1000 is next boundary
    });
  });

  describe('Edge cases and performance', () => {
    it('should handle timeline with 100+ clips efficiently', () => {
      // Create 100 clips with small gaps
      const clips: Clip[] = [];
      for (let i = 0; i < 100; i++) {
        clips.push(createClip(i * 1100, 1000, 0, 1000)); // 100ms gap between each
      }

      const track = createTrack(clips);
      const startTime = performance.now();
      // Timeline duration exactly matches last clip end (no gap at end)
      const lastClipEnd = 99 * 1100 + 1000; // 109900 + 1000 = 109900
      const gaps = analyzeTrackGaps(track, lastClipEnd);
      const endTime = performance.now();

      expect(gaps).toHaveLength(99); // 99 gaps between 100 clips
      expect(endTime - startTime).toBeLessThan(10); // Should complete in < 10ms
    });

    it('should handle clips with minimal duration (1ms)', () => {
      const track = createTrack([
        createClip(0, 1, 0, 1),
        createClip(10, 1, 0, 1),
      ]);

      const gaps = analyzeTrackGaps(track, 20);
      expect(gaps).toHaveLength(2);
      expect(gaps[0]).toMatchObject({ startTime: 1, endTime: 10, duration: 9 });
      expect(gaps[1]).toMatchObject({ startTime: 11, endTime: 20, duration: 9 });
    });

    it('should handle zero-duration gaps (clips back-to-back)', () => {
      const track = createTrack([
        createClip(0, 1000, 0, 1000),
        createClip(1000, 1000, 0, 1000), // Exactly at end of previous clip
      ]);

      const gaps = analyzeTrackGaps(track, 2000);
      expect(gaps).toHaveLength(0); // No gaps
    });
  });
});
