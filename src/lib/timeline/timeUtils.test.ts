import { describe, it, expect } from 'vitest';
import {
  msToPixels,
  pixelsToMs,
  formatTimelineTime,
  formatTimeSimple,
  calculateTimelineWidth,
  calculateClipPosition,
  snapToSecond,
  generateTimeMarkers,
} from './timeUtils';
import { TIMELINE_DEFAULTS } from '@/types/timeline';

describe('timeUtils', () => {
  describe('msToPixels', () => {
    it('converts milliseconds to pixels with default zoom', () => {
      // 1 second = 50 pixels (default)
      expect(msToPixels(1000)).toBe(50);
      expect(msToPixels(2000)).toBe(100);
      expect(msToPixels(500)).toBe(25);
    });

    it('converts milliseconds to pixels with custom zoom', () => {
      expect(msToPixels(1000, 100)).toBe(100); // 100 pixels per second
      expect(msToPixels(1000, 25)).toBe(25); // 25 pixels per second
    });

    it('handles zero correctly', () => {
      expect(msToPixels(0)).toBe(0);
    });
  });

  describe('pixelsToMs', () => {
    it('converts pixels to milliseconds with default zoom', () => {
      expect(pixelsToMs(50)).toBe(1000); // 50 pixels = 1 second
      expect(pixelsToMs(100)).toBe(2000);
      expect(pixelsToMs(25)).toBe(500);
    });

    it('converts pixels to milliseconds with custom zoom', () => {
      expect(pixelsToMs(100, 100)).toBe(1000); // 100 pixels/sec
      expect(pixelsToMs(25, 25)).toBe(1000); // 25 pixels/sec
    });

    it('handles zero correctly', () => {
      expect(pixelsToMs(0)).toBe(0);
    });
  });

  describe('formatTimelineTime', () => {
    it('formats milliseconds to MM:SS.ms', () => {
      expect(formatTimelineTime(0)).toBe('00:00.000');
      expect(formatTimelineTime(1000)).toBe('00:01.000');
      expect(formatTimelineTime(61000)).toBe('01:01.000');
      expect(formatTimelineTime(61500)).toBe('01:01.500');
      expect(formatTimelineTime(150750)).toBe('02:30.750');
    });

    it('handles large values correctly', () => {
      expect(formatTimelineTime(600000)).toBe('10:00.000'); // 10 minutes
      expect(formatTimelineTime(3600000)).toBe('60:00.000'); // 60 minutes
    });
  });

  describe('formatTimeSimple', () => {
    it('formats milliseconds to MM:SS', () => {
      expect(formatTimeSimple(0)).toBe('00:00');
      expect(formatTimeSimple(1000)).toBe('00:01');
      expect(formatTimeSimple(61000)).toBe('01:01');
      expect(formatTimeSimple(61500)).toBe('01:01'); // Rounds down
      expect(formatTimeSimple(150750)).toBe('02:30');
    });
  });

  describe('calculateTimelineWidth', () => {
    it('calculates timeline width from duration', () => {
      // 60 seconds * 50 pixels/second = 3000 pixels
      expect(calculateTimelineWidth(60000)).toBe(3000);
      expect(calculateTimelineWidth(120000)).toBe(6000);
    });

    it('calculates with custom zoom', () => {
      expect(calculateTimelineWidth(60000, 100)).toBe(6000);
      expect(calculateTimelineWidth(60000, 25)).toBe(1500);
    });
  });

  describe('calculateClipPosition', () => {
    it('calculates clip position and width', () => {
      const result = calculateClipPosition(5000, 10000);
      expect(result.x).toBe(250); // 5 seconds * 50 pixels/sec
      expect(result.width).toBe(500); // 10 seconds * 50 pixels/sec
    });

    it('enforces minimum clip width', () => {
      const result = calculateClipPosition(0, 100); // Very short clip
      expect(result.x).toBe(0);
      expect(result.width).toBe(TIMELINE_DEFAULTS.MIN_CLIP_WIDTH);
    });

    it('calculates with custom zoom', () => {
      const result = calculateClipPosition(1000, 2000, 100);
      expect(result.x).toBe(100); // 1 second * 100 pixels/sec
      expect(result.width).toBe(200); // 2 seconds * 100 pixels/sec
    });
  });

  describe('snapToSecond', () => {
    it('snaps to nearest second when within threshold', () => {
      // 50 pixels per second (default)
      expect(snapToSecond(52, 50, 5)).toBe(50); // Within threshold, snap to 50
      expect(snapToSecond(103, 50, 5)).toBe(100); // Within threshold, snap to 100
    });

    it('does not snap when outside threshold', () => {
      expect(snapToSecond(60, 50, 5)).toBe(60); // Too far from 50 or 100
      expect(snapToSecond(75, 50, 5)).toBe(75); // Too far from either
    });

    it('handles exact second marks', () => {
      expect(snapToSecond(50, 50, 5)).toBe(50);
      expect(snapToSecond(100, 50, 5)).toBe(100);
    });
  });

  describe('generateTimeMarkers', () => {
    it('generates markers at correct intervals', () => {
      const markers = generateTimeMarkers(30000, 50, 10);

      // Should have markers at 0, 10, 20, 30 seconds
      expect(markers).toHaveLength(4);
      expect(markers[0]).toEqual({ position: 0, time: 0, label: '00:00' });
      expect(markers[1]).toEqual({ position: 500, time: 10000, label: '00:10' });
      expect(markers[2]).toEqual({ position: 1000, time: 20000, label: '00:20' });
      expect(markers[3]).toEqual({ position: 1500, time: 30000, label: '00:30' });
    });

    it('generates markers with custom interval', () => {
      const markers = generateTimeMarkers(60000, 50, 5);

      // Should have markers every 5 seconds
      expect(markers).toHaveLength(13); // 0, 5, 10, ..., 60
      expect(markers[0].time).toBe(0);
      expect(markers[1].time).toBe(5000);
      expect(markers[2].time).toBe(10000);
    });

    it('handles zero duration', () => {
      const markers = generateTimeMarkers(0, 50, 10);
      expect(markers).toHaveLength(1); // Just the 0 marker
      expect(markers[0]).toEqual({ position: 0, time: 0, label: '00:00' });
    });
  });
});
