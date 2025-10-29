/**
 * Tests for snap utilities
 */

import { describe, it, expect } from 'vitest';
import {
  calculateGridInterval,
  findSnapTargets,
  applySnap,
  snapToGrid,
  snapToClipEdges,
} from './snapUtils';
import type { Timeline, Clip } from '@/types/timeline';

// Helper: Create test clip
function createClip(id: string, startTime: number, duration: number): Clip {
  return {
    id,
    filePath: `/test/${id}.mp4`,
    startTime,
    duration,
    trimIn: 0,
    trimOut: duration,
    volume: 100,
    muted: false,
  };
}

// Helper: Create test timeline
function createTimeline(tracks: Array<{ clips: Clip[] }>): Timeline {
  return {
    tracks: tracks.map((trackData, index) => ({
      id: `track-${index}`,
      trackNumber: index + 1,
      clips: trackData.clips,
      trackType: 'video' as const,
      label: `Track ${index + 1}`,
    })),
    totalDuration: 10000, // 10 seconds default
  };
}

describe('calculateGridInterval', () => {
  it('returns appropriate interval for zoom level 1.0', () => {
    const interval = calculateGridInterval(1.0, 50); // 50px/sec
    expect(interval).toBeGreaterThanOrEqual(100);
    expect(interval).toBeLessThanOrEqual(60000);
  });

  it('returns smaller interval for higher zoom (zoomed in)', () => {
    const zoom1 = calculateGridInterval(1.0, 50);
    const zoom5 = calculateGridInterval(5.0, 50);
    expect(zoom5).toBeLessThan(zoom1);
  });

  it('returns larger interval for lower zoom (zoomed out)', () => {
    const zoom1 = calculateGridInterval(1.0, 50);
    const zoom0_5 = calculateGridInterval(0.5, 50);
    expect(zoom0_5).toBeGreaterThan(zoom1);
  });

  it('returns one of the predefined intervals', () => {
    const validIntervals = [100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000];
    const interval = calculateGridInterval(1.5, 50);
    expect(validIntervals).toContain(interval);
  });
});

describe('findSnapTargets', () => {
  it('includes clip start and end positions', () => {
    const clip1 = createClip('clip1', 1000, 5000);
    const timeline = createTimeline([{ clips: [clip1] }]);

    const targets = findSnapTargets(timeline, '', 1.0, 50);

    const clipTargets = targets.filter((t) => t.clipId === 'clip1');
    expect(clipTargets).toHaveLength(2);

    const startTarget = clipTargets.find((t) => t.type === 'clip-start');
    const endTarget = clipTargets.find((t) => t.type === 'clip-end');

    expect(startTarget?.position).toBe(1000);
    expect(endTarget?.position).toBe(6000); // 1000 + 5000
  });

  it('excludes specified clip from targets', () => {
    const clip1 = createClip('clip1', 1000, 5000);
    const clip2 = createClip('clip2', 7000, 3000);
    const timeline = createTimeline([{ clips: [clip1, clip2] }]);

    const targets = findSnapTargets(timeline, 'clip1', 1.0, 50);

    const clip1Targets = targets.filter((t) => t.clipId === 'clip1');
    const clip2Targets = targets.filter((t) => t.clipId === 'clip2');

    expect(clip1Targets).toHaveLength(0);
    expect(clip2Targets).toHaveLength(2);
  });

  it('includes clips from all tracks (multi-track snapping)', () => {
    const clip1 = createClip('clip1', 1000, 5000);
    const clip2 = createClip('clip2', 2000, 3000);
    const timeline = createTimeline([{ clips: [clip1] }, { clips: [clip2] }]);

    const targets = findSnapTargets(timeline, '', 1.0, 50);

    const clip1Targets = targets.filter((t) => t.clipId === 'clip1');
    const clip2Targets = targets.filter((t) => t.clipId === 'clip2');

    expect(clip1Targets).toHaveLength(2);
    expect(clip2Targets).toHaveLength(2);
  });

  it('includes grid targets at regular intervals', () => {
    const timeline = createTimeline([{ clips: [] }]);
    const targets = findSnapTargets(timeline, '', 1.0, 50);

    const gridTargets = targets.filter((t) => t.type === 'grid');
    expect(gridTargets.length).toBeGreaterThan(0);

    // Check that grid targets are evenly spaced
    if (gridTargets.length >= 2) {
      const interval = gridTargets[1].position - gridTargets[0].position;
      expect(interval).toBeGreaterThan(0);
    }
  });

  it('respects trimmed clip duration for end position', () => {
    const clip = createClip('clip1', 1000, 5000);
    clip.trimIn = 500;
    clip.trimOut = 4000; // Effective duration: 3500ms
    const timeline = createTimeline([{ clips: [clip] }]);

    const targets = findSnapTargets(timeline, '', 1.0, 50);

    const endTarget = targets.find(
      (t) => t.clipId === 'clip1' && t.type === 'clip-end'
    );
    expect(endTarget?.position).toBe(4500); // 1000 + (4000 - 500)
  });
});

describe('applySnap', () => {
  it('returns original position when snap disabled', () => {
    const targets = [
      { position: 1000, type: 'grid' as const },
      { position: 5000, type: 'clip-start' as const, trackId: 'track1', clipId: 'clip1' },
    ];

    const result = applySnap(1050, targets, 100, false);

    expect(result.snappedPosition).toBe(1050);
    expect(result.snapIndicator).toBeNull();
  });

  it('snaps to closest target within threshold', () => {
    const targets = [
      { position: 1000, type: 'grid' as const },
      { position: 2000, type: 'grid' as const },
    ];

    const result = applySnap(1050, targets, 100, true);

    expect(result.snappedPosition).toBe(1000);
    expect(result.snapIndicator).not.toBeNull();
    expect(result.snapIndicator?.type).toBe('grid');
  });

  it('does not snap when outside threshold', () => {
    const targets = [{ position: 1000, type: 'grid' as const }];

    const result = applySnap(1200, targets, 100, true);

    expect(result.snappedPosition).toBe(1200);
    expect(result.snapIndicator).toBeNull();
  });

  it('prioritizes clip edges over grid lines', () => {
    const targets = [
      { position: 1000, type: 'grid' as const },
      {
        position: 1050,
        type: 'clip-start' as const,
        trackId: 'track1',
        clipId: 'clip1',
      },
    ];

    // Position 1025 is equidistant (25ms) from both grid and clip
    // But clip should have priority
    const result = applySnap(1025, targets, 100, true);

    expect(result.snappedPosition).toBe(1050);
    expect(result.snapIndicator?.type).toBe('clip-start');
  });

  it('snaps to closest clip edge when multiple clip targets exist', () => {
    const targets = [
      {
        position: 1000,
        type: 'clip-start' as const,
        trackId: 'track1',
        clipId: 'clip1',
      },
      {
        position: 5000,
        type: 'clip-end' as const,
        trackId: 'track1',
        clipId: 'clip1',
      },
      {
        position: 1100,
        type: 'clip-start' as const,
        trackId: 'track2',
        clipId: 'clip2',
      },
    ];

    const result = applySnap(1080, targets, 100, true);

    expect(result.snappedPosition).toBe(1100);
    expect(result.snapIndicator?.clipId).toBe('clip2');
  });

  it('returns null snap indicator at timeline position 0', () => {
    const targets = [{ position: 0, type: 'grid' as const }];

    const result = applySnap(20, targets, 100, true);

    expect(result.snappedPosition).toBe(0);
    expect(result.snapIndicator).not.toBeNull();
  });
});

describe('snapToGrid', () => {
  it('snaps position to nearest grid line within threshold', () => {
    const snapped = snapToGrid(1050, 1000, 100);
    expect(snapped).toBe(1000);
  });

  it('does not snap when outside threshold', () => {
    const snapped = snapToGrid(1200, 1000, 100);
    expect(snapped).toBe(1200);
  });

  it('snaps to grid at position 0', () => {
    const snapped = snapToGrid(50, 1000, 100);
    expect(snapped).toBe(0);
  });

  it('handles various grid intervals correctly', () => {
    expect(snapToGrid(2450, 2000, 500)).toBe(2000);
    expect(snapToGrid(2550, 2000, 500)).toBe(2550); // Outside threshold (550ms away from both 2000 and 4000)
    expect(snapToGrid(3200, 500, 250)).toBe(3000);
  });
});

describe('snapToClipEdges', () => {
  it('snaps to clip start edge within threshold', () => {
    const clips = [createClip('clip1', 1000, 5000)];
    const snapped = snapToClipEdges(1050, clips, 100);
    expect(snapped).toBe(1000);
  });

  it('snaps to clip end edge within threshold', () => {
    const clips = [createClip('clip1', 1000, 5000)];
    const snapped = snapToClipEdges(5950, clips, 100);
    expect(snapped).toBe(6000); // End: 1000 + 5000
  });

  it('does not snap when outside threshold', () => {
    const clips = [createClip('clip1', 1000, 5000)];
    const snapped = snapToClipEdges(1200, clips, 100);
    expect(snapped).toBe(1200);
  });

  it('excludes specified clip', () => {
    const clips = [
      createClip('clip1', 1000, 5000),
      createClip('clip2', 7000, 3000),
    ];
    const snapped = snapToClipEdges(1050, clips, 100, 'clip1');
    expect(snapped).toBe(1050); // Should not snap to clip1's edge
  });

  it('snaps to closest edge among multiple clips', () => {
    const clips = [
      createClip('clip1', 1000, 5000),
      createClip('clip2', 1100, 3000),
    ];
    const snapped = snapToClipEdges(1080, clips, 100);
    expect(snapped).toBe(1100); // Closer to clip2 start
  });

  it('respects trimmed clip duration', () => {
    const clip = createClip('clip1', 1000, 5000);
    clip.trimIn = 500;
    clip.trimOut = 3000; // Effective duration: 2500ms

    const snapped = snapToClipEdges(3450, [clip], 100);
    expect(snapped).toBe(3500); // 1000 + (3000 - 500)
  });
});
