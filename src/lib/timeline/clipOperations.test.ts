/**
 * Tests for clip operations utilities
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSequentialPosition,
  detectGaps,
  detectClipOverlap,
  validateClipPosition,
  findClipAtTime,
  getEffectiveDuration,
  splitClipAtTime,
  calculateRippleShift,
  deleteClip,
  validateFadeDuration,
  MAX_FADE_DURATION_MS,
} from './clipOperations';
import type { Clip, Track } from '@/types/timeline';

// Helper to create test clips
const createClip = (
  id: string,
  startTime: number,
  duration: number,
  trimIn = 0,
  trimOut?: number
): Clip => ({
  id,
  filePath: `/test/${id}.mp4`,
  startTime,
  duration,
  trimIn,
  trimOut: trimOut ?? duration,
  volume: 100,
  muted: false,
});

// Helper to create test track
const createTrack = (clips: Clip[]): Track => ({
  id: 'track-1',
  trackNumber: 1,
  clips,
  trackType: 'video',
});

describe('calculateSequentialPosition', () => {
  it('returns 0 for empty track', () => {
    const track = createTrack([]);
    expect(calculateSequentialPosition(track)).toBe(0);
  });

  it('returns end time of single clip', () => {
    const clip = createClip('clip1', 0, 5000); // 5 seconds
    const track = createTrack([clip]);

    expect(calculateSequentialPosition(track)).toBe(5000);
  });

  it('returns end time of last clip with multiple clips', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 5000, 3000),
      createClip('clip3', 8000, 2000),
    ];
    const track = createTrack(clips);

    expect(calculateSequentialPosition(track)).toBe(10000); // 8000 + 2000
  });

  it('accounts for trimmed duration', () => {
    const clip = createClip('clip1', 0, 10000, 2000, 8000); // 10s clip trimmed to 6s
    const track = createTrack([clip]);

    expect(calculateSequentialPosition(track)).toBe(6000); // trimOut - trimIn
  });

  it('handles unsorted clips correctly', () => {
    const clips = [
      createClip('clip2', 5000, 3000),
      createClip('clip1', 0, 5000),
      createClip('clip3', 8000, 2000),
    ];
    const track = createTrack(clips);

    expect(calculateSequentialPosition(track)).toBe(10000); // Last clip ends at 10000
  });
});

describe('detectGaps', () => {
  it('returns empty array for track with no clips', () => {
    const track = createTrack([]);
    expect(detectGaps(track)).toEqual([]);
  });

  it('returns empty array for track with single clip', () => {
    const clip = createClip('clip1', 0, 5000);
    const track = createTrack([clip]);
    expect(detectGaps(track)).toEqual([]);
  });

  it('returns empty array for sequential clips (no gaps)', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 5000, 3000),
      createClip('clip3', 8000, 2000),
    ];
    const track = createTrack(clips);

    expect(detectGaps(track)).toEqual([]);
  });

  it('detects single gap between clips', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 7000, 3000), // 2000ms gap
    ];
    const track = createTrack(clips);

    const gaps = detectGaps(track);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({
      startTime: 5000,
      endTime: 7000,
      duration: 2000,
    });
  });

  it('detects multiple gaps', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 7000, 3000), // Gap: 5000-7000 (2000ms)
      createClip('clip3', 11000, 2000), // Gap: 10000-11000 (1000ms)
    ];
    const track = createTrack(clips);

    const gaps = detectGaps(track);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toEqual({
      startTime: 5000,
      endTime: 7000,
      duration: 2000,
    });
    expect(gaps[1]).toEqual({
      startTime: 10000,
      endTime: 11000,
      duration: 1000,
    });
  });

  it('accounts for trim when detecting gaps', () => {
    const clips = [
      createClip('clip1', 0, 10000, 0, 5000), // Effective duration: 5000ms
      createClip('clip2', 8000, 5000), // Gap: 5000-8000 (3000ms)
    ];
    const track = createTrack(clips);

    const gaps = detectGaps(track);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({
      startTime: 5000,
      endTime: 8000,
      duration: 3000,
    });
  });

  it('handles unsorted clips correctly', () => {
    const clips = [
      createClip('clip2', 7000, 3000),
      createClip('clip1', 0, 5000),
    ];
    const track = createTrack(clips);

    const gaps = detectGaps(track);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].duration).toBe(2000);
  });
});

describe('detectClipOverlap', () => {
  it('returns false when no clips exist', () => {
    const clip = createClip('new-clip', 1000, 2000);
    const track = createTrack([]);

    expect(detectClipOverlap(clip, track)).toBe(false);
  });

  it('returns false when clip does not overlap', () => {
    const existingClip = createClip('clip1', 0, 5000);
    const newClip = createClip('new-clip', 5000, 2000);
    const track = createTrack([existingClip]);

    expect(detectClipOverlap(newClip, track)).toBe(false);
  });

  it('detects overlap when clip starts before existing ends', () => {
    const existingClip = createClip('clip1', 0, 5000);
    const newClip = createClip('new-clip', 3000, 3000); // Overlaps 3000-5000
    const track = createTrack([existingClip]);

    expect(detectClipOverlap(newClip, track)).toBe(true);
  });

  it('detects overlap when clip completely contains existing', () => {
    const existingClip = createClip('clip1', 2000, 2000);
    const newClip = createClip('new-clip', 0, 6000); // Contains clip1
    const track = createTrack([existingClip]);

    expect(detectClipOverlap(newClip, track)).toBe(true);
  });

  it('detects overlap when clip is completely contained by existing', () => {
    const existingClip = createClip('clip1', 0, 10000);
    const newClip = createClip('new-clip', 3000, 2000); // Inside clip1
    const track = createTrack([existingClip]);

    expect(detectClipOverlap(newClip, track)).toBe(true);
  });

  it('excludes specified clip from overlap check', () => {
    const existingClip = createClip('clip1', 0, 5000);
    const track = createTrack([existingClip]);

    // Same clip (repositioning itself)
    expect(detectClipOverlap(existingClip, track, 'clip1')).toBe(false);
  });

  it('accounts for trim when detecting overlap', () => {
    const existingClip = createClip('clip1', 0, 10000, 0, 5000); // Effective: 0-5000
    const newClip = createClip('new-clip', 4000, 2000); // 4000-6000
    const track = createTrack([existingClip]);

    expect(detectClipOverlap(newClip, track)).toBe(true);
  });
});

describe('validateClipPosition', () => {
  it('returns true for valid position with no overlap', () => {
    const existingClip = createClip('clip1', 0, 5000);
    const newClip = createClip('new-clip', 5000, 2000);
    const track = createTrack([existingClip]);

    expect(validateClipPosition(newClip, track)).toBe(true);
  });

  it('returns false for negative start time', () => {
    const clip = createClip('clip1', -1000, 2000);
    const track = createTrack([]);

    expect(validateClipPosition(clip, track)).toBe(false);
  });

  it('returns false for overlapping position', () => {
    const existingClip = createClip('clip1', 0, 5000);
    const newClip = createClip('new-clip', 3000, 3000);
    const track = createTrack([existingClip]);

    expect(validateClipPosition(newClip, track)).toBe(false);
  });

  it('allows repositioning existing clip to valid position', () => {
    const clip1 = createClip('clip1', 0, 5000);
    const clip2 = createClip('clip2', 5000, 3000);
    const track = createTrack([clip1, clip2]);

    // Move clip2 to later position (no overlap)
    const movedClip2 = { ...clip2, startTime: 8000 };
    expect(validateClipPosition(movedClip2, track, 'clip2')).toBe(true);
  });
});

describe('findClipAtTime', () => {
  it('returns null for empty track', () => {
    const track = createTrack([]);
    expect(findClipAtTime(track, 1000)).toBe(null);
  });

  it('returns null when time is before first clip', () => {
    const clip = createClip('clip1', 1000, 5000);
    const track = createTrack([clip]);

    expect(findClipAtTime(track, 500)).toBe(null);
  });

  it('returns null when time is after last clip', () => {
    const clip = createClip('clip1', 0, 5000);
    const track = createTrack([clip]);

    expect(findClipAtTime(track, 6000)).toBe(null);
  });

  it('returns clip when time is at start', () => {
    const clip = createClip('clip1', 0, 5000);
    const track = createTrack([clip]);

    expect(findClipAtTime(track, 0)).toBe(clip);
  });

  it('returns clip when time is within range', () => {
    const clip = createClip('clip1', 0, 5000);
    const track = createTrack([clip]);

    expect(findClipAtTime(track, 2500)).toBe(clip);
  });

  it('returns correct clip from multiple clips', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 5000, 3000),
      createClip('clip3', 8000, 2000),
    ];
    const track = createTrack(clips);

    expect(findClipAtTime(track, 1000)).toBe(clips[0]);
    expect(findClipAtTime(track, 6000)).toBe(clips[1]);
    expect(findClipAtTime(track, 9000)).toBe(clips[2]);
  });

  it('returns null when time falls in gap', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 7000, 3000), // Gap: 5000-7000
    ];
    const track = createTrack(clips);

    expect(findClipAtTime(track, 6000)).toBe(null);
  });

  it('accounts for trim when finding clip', () => {
    const clip = createClip('clip1', 0, 10000, 2000, 8000); // Effective: 0-6000
    const track = createTrack([clip]);

    expect(findClipAtTime(track, 3000)).toBe(clip);
    expect(findClipAtTime(track, 7000)).toBe(null); // Beyond trimOut
  });
});

describe('getEffectiveDuration', () => {
  it('returns full duration for untrimmed clip', () => {
    const clip = createClip('clip1', 0, 5000);
    expect(getEffectiveDuration(clip)).toBe(5000);
  });

  it('returns trimmed duration', () => {
    const clip = createClip('clip1', 0, 10000, 2000, 8000);
    expect(getEffectiveDuration(clip)).toBe(6000); // 8000 - 2000
  });

  it('handles zero trim correctly', () => {
    const clip = createClip('clip1', 0, 5000, 0, 5000);
    expect(getEffectiveDuration(clip)).toBe(5000);
  });
});

describe('splitClipAtTime', () => {
  it('returns null when split time is before clip start', () => {
    const clip = createClip('clip1', 5000, 10000);
    const result = splitClipAtTime(clip, 3000);

    expect(result).toBe(null);
  });

  it('returns null when split time is after clip end', () => {
    const clip = createClip('clip1', 0, 5000);
    const result = splitClipAtTime(clip, 6000);

    expect(result).toBe(null);
  });

  it('returns null when split time equals clip start', () => {
    const clip = createClip('clip1', 5000, 10000);
    const result = splitClipAtTime(clip, 5000);

    expect(result).toBe(null);
  });

  it('returns null when split time equals clip end', () => {
    const clip = createClip('clip1', 0, 5000);
    const result = splitClipAtTime(clip, 5000);

    expect(result).toBe(null);
  });

  it('splits clip at middle position', () => {
    const clip = createClip('clip1', 5000, 10000); // 5000-15000 on timeline
    const result = splitClipAtTime(clip, 10000); // Split at middle

    expect(result).not.toBe(null);
    const [firstClip, secondClip] = result!;

    // First clip: starts at original position, ends at split point
    expect(firstClip.startTime).toBe(5000);
    expect(firstClip.trimIn).toBe(0);
    expect(firstClip.trimOut).toBe(5000);
    expect(firstClip.duration).toBe(10000);
    expect(firstClip.filePath).toBe(clip.filePath);
    expect(firstClip.id).not.toBe(clip.id); // New UUID

    // Second clip: starts at split point, ends at original end
    expect(secondClip.startTime).toBe(10000);
    expect(secondClip.trimIn).toBe(5000);
    expect(secondClip.trimOut).toBe(10000);
    expect(secondClip.duration).toBe(10000);
    expect(secondClip.filePath).toBe(clip.filePath);
    expect(secondClip.id).not.toBe(clip.id); // New UUID

    // Both clips have unique IDs
    expect(firstClip.id).not.toBe(secondClip.id);
  });

  it('splits clip with existing trim points', () => {
    const clip = createClip('clip1', 5000, 30000, 2000, 20000); // Effective: 18s (2000-20000)
    // Timeline: 5000 to 23000 (5000 + 18000)
    const result = splitClipAtTime(clip, 10000); // Split 5s into effective range

    expect(result).not.toBe(null);
    const [firstClip, secondClip] = result!;

    // First clip: 5000-10000 on timeline (5s duration)
    expect(firstClip.startTime).toBe(5000);
    expect(firstClip.trimIn).toBe(2000);
    expect(firstClip.trimOut).toBe(7000); // 2000 + 5000 offset
    expect(getEffectiveDuration(firstClip)).toBe(5000);

    // Second clip: 10000-23000 on timeline (13s duration)
    expect(secondClip.startTime).toBe(10000);
    expect(secondClip.trimIn).toBe(7000);
    expect(secondClip.trimOut).toBe(20000);
    expect(getEffectiveDuration(secondClip)).toBe(13000);

    // Total effective duration preserved
    expect(getEffectiveDuration(firstClip) + getEffectiveDuration(secondClip))
      .toBe(getEffectiveDuration(clip));
  });

  it('creates clips with unique UUIDs', () => {
    const clip = createClip('clip1', 0, 10000);
    const result = splitClipAtTime(clip, 5000);

    expect(result).not.toBe(null);
    const [firstClip, secondClip] = result!;

    expect(firstClip.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(secondClip.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(firstClip.id).not.toBe(secondClip.id);
  });

  it('preserves original file path and duration', () => {
    const clip = createClip('clip1', 0, 10000);
    const result = splitClipAtTime(clip, 5000);

    expect(result).not.toBe(null);
    const [firstClip, secondClip] = result!;

    expect(firstClip.filePath).toBe(clip.filePath);
    expect(secondClip.filePath).toBe(clip.filePath);
    expect(firstClip.duration).toBe(clip.duration);
    expect(secondClip.duration).toBe(clip.duration);
  });

  it('splits near beginning of clip', () => {
    const clip = createClip('clip1', 0, 10000);
    const result = splitClipAtTime(clip, 100); // 100ms from start

    expect(result).not.toBe(null);
    const [firstClip, secondClip] = result!;

    expect(getEffectiveDuration(firstClip)).toBe(100);
    expect(getEffectiveDuration(secondClip)).toBe(9900);
  });

  it('splits near end of clip', () => {
    const clip = createClip('clip1', 0, 10000);
    const result = splitClipAtTime(clip, 9900); // 100ms from end

    expect(result).not.toBe(null);
    const [firstClip, secondClip] = result!;

    expect(getEffectiveDuration(firstClip)).toBe(9900);
    expect(getEffectiveDuration(secondClip)).toBe(100);
  });

  it('ensures no gap between split clips', () => {
    const clip = createClip('clip1', 5000, 10000);
    const result = splitClipAtTime(clip, 10000);

    expect(result).not.toBe(null);
    const [firstClip, secondClip] = result!;

    // First clip end = second clip start
    const firstClipEnd = firstClip.startTime + getEffectiveDuration(firstClip);
    expect(firstClipEnd).toBe(secondClip.startTime);
  });

  it('maintains total effective duration after split', () => {
    const clip = createClip('clip1', 5000, 10000, 1000, 9000);
    const originalDuration = getEffectiveDuration(clip);

    const result = splitClipAtTime(clip, 8000);

    expect(result).not.toBe(null);
    const [firstClip, secondClip] = result!;

    const combinedDuration = getEffectiveDuration(firstClip) + getEffectiveDuration(secondClip);
    expect(combinedDuration).toBe(originalDuration);
  });
});

describe('calculateRippleShift', () => {
  it('returns effective duration of clip', () => {
    const clip = createClip('clip1', 0, 10000, 2000, 8000);
    expect(calculateRippleShift(clip)).toBe(6000); // trimOut - trimIn
  });

  it('returns full duration for untrimmed clip', () => {
    const clip = createClip('clip1', 0, 5000);
    expect(calculateRippleShift(clip)).toBe(5000);
  });

  it('handles zero-duration trim correctly', () => {
    const clip = createClip('clip1', 0, 10000, 5000, 5000);
    expect(calculateRippleShift(clip)).toBe(0);
  });
});

describe('deleteClip', () => {
  it('returns unchanged array when clip not found', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 5000, 3000),
    ];

    const result = deleteClip(clips, 'nonexistent', false);
    expect(result).toEqual(clips);
  });

  it('removes clip from array (gap delete)', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 5000, 3000),
      createClip('clip3', 8000, 2000),
    ];

    const result = deleteClip(clips, 'clip2', false);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('clip1');
    expect(result[1].id).toBe('clip3');
  });

  it('leaves gap when ripple=false', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 5000, 3000),
      createClip('clip3', 8000, 2000),
    ];

    const result = deleteClip(clips, 'clip2', false);

    // Clip 3 remains at original position (gap delete)
    expect(result[1].startTime).toBe(8000);
  });

  it('shifts subsequent clips left when ripple=true', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 5000, 3000),
      createClip('clip3', 8000, 2000),
    ];

    const result = deleteClip(clips, 'clip2', true);

    // Clip 3 shifted left by 3000ms (clip2 duration)
    expect(result[1].startTime).toBe(5000); // 8000 - 3000
  });

  it('does not shift clips before deleted clip', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 5000, 3000),
      createClip('clip3', 8000, 2000),
    ];

    const result = deleteClip(clips, 'clip2', true);

    // Clip 1 remains at original position
    expect(result[0].startTime).toBe(0);
  });

  it('handles deleting first clip with ripple', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 5000, 3000),
      createClip('clip3', 8000, 2000),
    ];

    const result = deleteClip(clips, 'clip1', true);

    expect(result).toHaveLength(2);
    // Clip 2 shifted left by 5000ms
    expect(result[0].startTime).toBe(0); // 5000 - 5000
    // Clip 3 shifted left by 5000ms
    expect(result[1].startTime).toBe(3000); // 8000 - 5000
  });

  it('handles deleting last clip with ripple', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 5000, 3000),
      createClip('clip3', 8000, 2000),
    ];

    const result = deleteClip(clips, 'clip3', true);

    expect(result).toHaveLength(2);
    // No clips to shift
    expect(result[0].startTime).toBe(0);
    expect(result[1].startTime).toBe(5000);
  });

  it('accounts for trim when calculating ripple shift', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 5000, 10000, 2000, 8000), // Effective: 6000ms
      createClip('clip3', 11000, 2000),
    ];

    const result = deleteClip(clips, 'clip2', true);

    // Clip 3 shifted left by effective duration of clip2 (6000ms)
    expect(result[1].startTime).toBe(5000); // 11000 - 6000
  });

  it('handles deleting only clip on track', () => {
    const clips = [createClip('clip1', 0, 5000)];

    const result = deleteClip(clips, 'clip1', true);

    expect(result).toHaveLength(0);
  });

  it('preserves clip properties except startTime on ripple', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 5000, 3000),
      createClip('clip3', 8000, 2000, 500, 2000),
    ];

    const result = deleteClip(clips, 'clip2', true);

    // Clip 3 properties preserved (except startTime)
    expect(result[1].id).toBe('clip3');
    expect(result[1].filePath).toBe('/test/clip3.mp4');
    expect(result[1].duration).toBe(2000);
    expect(result[1].trimIn).toBe(500);
    expect(result[1].trimOut).toBe(2000);
    expect(result[1].startTime).toBe(5000); // Only startTime changed
  });

  it('shifts multiple subsequent clips correctly', () => {
    const clips = [
      createClip('clip1', 0, 5000),
      createClip('clip2', 5000, 3000),
      createClip('clip3', 8000, 2000),
      createClip('clip4', 10000, 4000),
      createClip('clip5', 14000, 1000),
    ];

    const result = deleteClip(clips, 'clip2', true);

    expect(result).toHaveLength(4);
    expect(result[0].startTime).toBe(0); // clip1 unchanged
    expect(result[1].startTime).toBe(5000); // clip3: 8000 - 3000
    expect(result[2].startTime).toBe(7000); // clip4: 10000 - 3000
    expect(result[3].startTime).toBe(11000); // clip5: 14000 - 3000
  });
});

describe('validateFadeDuration', () => {
  const createClipWithFades = (
    id: string,
    duration: number,
    fadeIn: number = 0,
    fadeOut: number = 0
  ): Clip => ({
    id,
    filePath: `/test/${id}.mp4`,
    startTime: 0,
    duration,
    trimIn: 0,
    trimOut: duration,
    fadeIn,
    fadeOut,
    volume: 100,
    muted: false,
  });

  describe('valid fade configurations', () => {
    it('accepts zero fades (no fade)', () => {
      const clip = createClipWithFades('clip1', 10000, 0, 0);
      expect(validateFadeDuration(clip)).toBe(true);
    });

    it('accepts valid fade-in only', () => {
      const clip = createClipWithFades('clip1', 10000, 2000, 0);
      expect(validateFadeDuration(clip)).toBe(true);
    });

    it('accepts valid fade-out only', () => {
      const clip = createClipWithFades('clip1', 10000, 0, 2000);
      expect(validateFadeDuration(clip)).toBe(true);
    });

    it('accepts valid fade-in and fade-out', () => {
      const clip = createClipWithFades('clip1', 10000, 2000, 2000);
      expect(validateFadeDuration(clip)).toBe(true);
    });

    it('accepts maximum fade duration (5 seconds)', () => {
      const clip = createClipWithFades('clip1', 20000, 5000, 5000);
      expect(validateFadeDuration(clip)).toBe(true);
    });

    it('accepts fade-in at max duration (5s)', () => {
      const clip = createClipWithFades('clip1', 10000, MAX_FADE_DURATION_MS, 0);
      expect(validateFadeDuration(clip)).toBe(true);
    });

    it('accepts fade-out at max duration (5s)', () => {
      const clip = createClipWithFades('clip1', 10000, 0, MAX_FADE_DURATION_MS);
      expect(validateFadeDuration(clip)).toBe(true);
    });

    it('accepts combined fades equal to clip duration', () => {
      const clip = createClipWithFades('clip1', 10000, 5000, 5000);
      expect(validateFadeDuration(clip)).toBe(true);
    });
  });

  describe('negative fade durations', () => {
    it('rejects negative fade-in', () => {
      const clip = createClipWithFades('clip1', 10000);
      expect(validateFadeDuration(clip, -100, 0)).toBe(false);
    });

    it('rejects negative fade-out', () => {
      const clip = createClipWithFades('clip1', 10000);
      expect(validateFadeDuration(clip, 0, -100)).toBe(false);
    });

    it('rejects both negative fades', () => {
      const clip = createClipWithFades('clip1', 10000);
      expect(validateFadeDuration(clip, -100, -200)).toBe(false);
    });
  });

  describe('maximum fade duration validation', () => {
    it('rejects fade-in exceeding 5 seconds', () => {
      const clip = createClipWithFades('clip1', 20000);
      expect(validateFadeDuration(clip, 5001, 0)).toBe(false);
    });

    it('rejects fade-out exceeding 5 seconds', () => {
      const clip = createClipWithFades('clip1', 20000);
      expect(validateFadeDuration(clip, 0, 5001)).toBe(false);
    });

    it('rejects both fades exceeding 5 seconds', () => {
      const clip = createClipWithFades('clip1', 30000);
      expect(validateFadeDuration(clip, 6000, 7000)).toBe(false);
    });

    it('verifies MAX_FADE_DURATION_MS constant is 5000', () => {
      expect(MAX_FADE_DURATION_MS).toBe(5000);
    });
  });

  describe('combined fade duration validation', () => {
    it('rejects combined fade exceeding clip duration', () => {
      const clip = createClipWithFades('clip1', 10000);
      expect(validateFadeDuration(clip, 6000, 5000)).toBe(false); // 11s fade for 10s clip
    });

    it('rejects symmetric fades exceeding clip duration', () => {
      const clip = createClipWithFades('clip1', 8000);
      expect(validateFadeDuration(clip, 5000, 5000)).toBe(false); // 10s fade for 8s clip
    });

    it('accepts combined fades at clip boundary', () => {
      const clip = createClipWithFades('clip1', 10000);
      expect(validateFadeDuration(clip, 5000, 5000)).toBe(true); // 10s fade for 10s clip (max fades)
    });
  });

  describe('very short clips', () => {
    it('accepts valid fades for 1-second clip', () => {
      const clip = createClipWithFades('clip1', 1000, 500, 500);
      expect(validateFadeDuration(clip)).toBe(true);
    });

    it('rejects fades exceeding 1-second clip duration', () => {
      const clip = createClipWithFades('clip1', 1000);
      expect(validateFadeDuration(clip, 600, 600)).toBe(false); // 1.2s fade for 1s clip
    });

    it('accepts maximum allowed fade for very short clip', () => {
      const clip = createClipWithFades('clip1', 500, 250, 250);
      expect(validateFadeDuration(clip)).toBe(true);
    });
  });

  describe('trimmed clips', () => {
    it('validates based on effective duration (trimmed)', () => {
      const clip: Clip = {
        id: 'clip1',
        filePath: '/test/clip1.mp4',
        startTime: 0,
        duration: 20000,
        trimIn: 5000,
        trimOut: 15000, // Effective duration: 10000ms
        fadeIn: 3000,
        fadeOut: 3000,
        volume: 100,
        muted: false,
      };

      expect(validateFadeDuration(clip)).toBe(true); // 6s fade for 10s effective duration
    });

    it('rejects fades exceeding effective duration', () => {
      const clip: Clip = {
        id: 'clip1',
        filePath: '/test/clip1.mp4',
        startTime: 0,
        duration: 20000,
        trimIn: 5000,
        trimOut: 10000, // Effective duration: 5000ms
        fadeIn: 3000,
        fadeOut: 3000,
        volume: 100,
        muted: false,
      };

      expect(validateFadeDuration(clip)).toBe(false); // 6s fade for 5s effective duration
    });
  });

  describe('proposed fade validation', () => {
    it('validates proposed fadeIn against current fadeOut', () => {
      const clip = createClipWithFades('clip1', 10000, 0, 3000);
      expect(validateFadeDuration(clip, 5000)).toBe(true); // 5s + 3s = 8s (within limits)
      expect(validateFadeDuration(clip, 8000)).toBe(false); // 8s exceeds 5s max per fade
    });

    it('validates proposed fadeOut against current fadeIn', () => {
      const clip = createClipWithFades('clip1', 10000, 3000, 0);
      expect(validateFadeDuration(clip, undefined, 5000)).toBe(true); // 3s + 5s = 8s (within limits)
      expect(validateFadeDuration(clip, undefined, 8000)).toBe(false); // 8s exceeds 5s max per fade
    });

    it('validates both proposed fades', () => {
      const clip = createClipWithFades('clip1', 10000, 2000, 2000);
      expect(validateFadeDuration(clip, 3000, 3000)).toBe(true); // 3s + 3s = 6s (within limits)
      expect(validateFadeDuration(clip, 5000, 6000)).toBe(false); // 6s exceeds 5s max per fade
    });

    it('uses clip fades when not provided', () => {
      const clip = createClipWithFades('clip1', 10000, 3000, 3000);
      expect(validateFadeDuration(clip)).toBe(true); // Uses existing 3s + 3s
    });
  });

  describe('edge cases', () => {
    it('handles clips with undefined fadeIn/fadeOut', () => {
      const clip: Clip = {
        id: 'clip1',
        filePath: '/test/clip1.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      };

      expect(validateFadeDuration(clip)).toBe(true); // Treats undefined as 0
    });

    it('accepts zero fade with proposed non-zero fade', () => {
      const clip = createClipWithFades('clip1', 10000, 0, 0);
      expect(validateFadeDuration(clip, 2000, 2000)).toBe(true);
    });

    it('rejects fade at exactly max + 1ms', () => {
      const clip = createClipWithFades('clip1', 20000);
      expect(validateFadeDuration(clip, MAX_FADE_DURATION_MS + 1, 0)).toBe(false);
    });

    it('accepts fade at exactly max duration', () => {
      const clip = createClipWithFades('clip1', 20000);
      expect(validateFadeDuration(clip, MAX_FADE_DURATION_MS, 0)).toBe(true);
    });
  });
});
