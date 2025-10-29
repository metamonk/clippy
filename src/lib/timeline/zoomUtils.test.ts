import { describe, it, expect } from 'vitest';
import {
  calculatePixelsPerSecond,
  calculateVisibleDuration,
  calculateClipWidth,
  calculateClipPosition,
  clampZoomLevel,
  maintainPlayheadVisibility,
  getTimeInterval,
  BASE_PIXELS_PER_SECOND,
  MIN_ZOOM,
  MAX_ZOOM,
} from './zoomUtils';

describe('zoomUtils', () => {
  describe('calculatePixelsPerSecond', () => {
    it('should return correct pixels per second for various zoom levels', () => {
      expect(calculatePixelsPerSecond(0.1)).toBe(10);
      expect(calculatePixelsPerSecond(0.5)).toBe(50);
      expect(calculatePixelsPerSecond(1.0)).toBe(100);
      expect(calculatePixelsPerSecond(2.0)).toBe(200);
      expect(calculatePixelsPerSecond(5.0)).toBe(500);
      expect(calculatePixelsPerSecond(10.0)).toBe(1000);
    });

    it('should use BASE_PIXELS_PER_SECOND constant', () => {
      expect(calculatePixelsPerSecond(1.0)).toBe(BASE_PIXELS_PER_SECOND);
    });
  });

  describe('calculateVisibleDuration', () => {
    it('should return visible duration in milliseconds', () => {
      // 1000px container at 1.0x zoom (100 px/s) = 10 seconds = 10000ms
      expect(calculateVisibleDuration(1000, 1.0)).toBe(10000);

      // 1000px container at 0.5x zoom (50 px/s) = 20 seconds = 20000ms
      expect(calculateVisibleDuration(1000, 0.5)).toBe(20000);

      // 1000px container at 2.0x zoom (200 px/s) = 5 seconds = 5000ms
      expect(calculateVisibleDuration(1000, 2.0)).toBe(5000);
    });

    it('should handle different container widths', () => {
      expect(calculateVisibleDuration(500, 1.0)).toBe(5000); // 5 seconds
      expect(calculateVisibleDuration(2000, 1.0)).toBe(20000); // 20 seconds
    });
  });

  describe('calculateClipWidth', () => {
    it('should calculate correct clip width for 30-second clip', () => {
      const clipDuration = 30000; // 30 seconds

      // At 0.5x zoom: 30s * 50 px/s = 1500 px
      expect(calculateClipWidth(clipDuration, 0.5)).toBe(1500);

      // At 1.0x zoom: 30s * 100 px/s = 3000 px
      expect(calculateClipWidth(clipDuration, 1.0)).toBe(3000);

      // At 5.0x zoom: 30s * 500 px/s = 15000 px
      expect(calculateClipWidth(clipDuration, 5.0)).toBe(15000);
    });

    it('should handle short clips', () => {
      // 1 second clip at 1.0x zoom = 100 px
      expect(calculateClipWidth(1000, 1.0)).toBe(100);

      // 500ms clip at 1.0x zoom = 50 px
      expect(calculateClipWidth(500, 1.0)).toBe(50);
    });

    it('should scale proportionally with zoom level', () => {
      const clipDuration = 10000; // 10 seconds
      const baseWidth = calculateClipWidth(clipDuration, 1.0);

      // At 2x zoom, width should be 2x
      expect(calculateClipWidth(clipDuration, 2.0)).toBe(baseWidth * 2);

      // At 0.5x zoom, width should be 0.5x
      expect(calculateClipWidth(clipDuration, 0.5)).toBe(baseWidth * 0.5);
    });
  });

  describe('calculateClipPosition', () => {
    it('should calculate correct position for clips at different start times', () => {
      // 5 seconds at 1.0x zoom = 500 px
      expect(calculateClipPosition(5000, 1.0)).toBe(500);

      // 10 seconds at 2.0x zoom = 2000 px
      expect(calculateClipPosition(10000, 2.0)).toBe(2000);

      // 1 minute at 0.5x zoom = 3000 px
      expect(calculateClipPosition(60000, 0.5)).toBe(3000);
    });

    it('should return 0 for clip at timeline start', () => {
      expect(calculateClipPosition(0, 1.0)).toBe(0);
      expect(calculateClipPosition(0, 5.0)).toBe(0);
    });
  });

  describe('clampZoomLevel', () => {
    it('should clamp values below MIN_ZOOM to MIN_ZOOM', () => {
      expect(clampZoomLevel(-1)).toBe(MIN_ZOOM);
      expect(clampZoomLevel(0)).toBe(MIN_ZOOM);
      expect(clampZoomLevel(0.05)).toBe(MIN_ZOOM);
    });

    it('should clamp values above MAX_ZOOM to MAX_ZOOM', () => {
      expect(clampZoomLevel(15.0)).toBe(MAX_ZOOM);
      expect(clampZoomLevel(100)).toBe(MAX_ZOOM);
    });

    it('should not modify valid zoom levels', () => {
      expect(clampZoomLevel(0.1)).toBe(0.1);
      expect(clampZoomLevel(1.0)).toBe(1.0);
      expect(clampZoomLevel(5.0)).toBe(5.0);
      expect(clampZoomLevel(10.0)).toBe(10.0);
    });

    it('should accept custom min and max values', () => {
      expect(clampZoomLevel(0.5, 1.0, 5.0)).toBe(1.0); // Below custom min
      expect(clampZoomLevel(7.0, 1.0, 5.0)).toBe(5.0); // Above custom max
      expect(clampZoomLevel(3.0, 1.0, 5.0)).toBe(3.0); // Within range
    });
  });

  describe('maintainPlayheadVisibility', () => {
    const containerWidth = 1000;

    it('should center playhead when it was visible before zoom', () => {
      // Playhead at 10 seconds, visible in viewport, zooming from 1x to 2x
      const playheadPosition = 10000; // 10s
      const oldZoom = 1.0;
      const newZoom = 2.0;
      const currentScroll = 500; // Playhead at 1000px is visible (viewport 500-1500)

      const newScroll = maintainPlayheadVisibility(
        currentScroll,
        oldZoom,
        newZoom,
        playheadPosition,
        containerWidth
      );

      // At 2x zoom, playhead is at 2000px
      // Should center it: 2000 - (1000/2) = 1500px
      expect(newScroll).toBe(1500);
    });

    it('should not adjust scroll if playhead is not visible', () => {
      // Playhead at 10 seconds, NOT visible in viewport
      const playheadPosition = 10000; // 10s = 1000px at 1x zoom
      const oldZoom = 1.0;
      const newZoom = 2.0;
      const currentScroll = 2000; // Viewport is 2000-3000, playhead at 1000 is not visible

      const newScroll = maintainPlayheadVisibility(
        currentScroll,
        oldZoom,
        newZoom,
        playheadPosition,
        containerWidth
      );

      // Should not change scroll
      expect(newScroll).toBe(currentScroll);
    });

    it('should not return negative scroll positions', () => {
      // Playhead near start of timeline
      const playheadPosition = 1000; // 1s
      const oldZoom = 1.0;
      const newZoom = 2.0;
      const currentScroll = 0; // At start

      const newScroll = maintainPlayheadVisibility(
        currentScroll,
        oldZoom,
        newZoom,
        playheadPosition,
        containerWidth
      );

      // Should be clamped to 0 (can't scroll negative)
      expect(newScroll).toBeGreaterThanOrEqual(0);
    });

    it('should handle zoom out (decreasing zoom level)', () => {
      // Playhead at 10s, zooming out from 2x to 1x
      const playheadPosition = 10000; // 10s
      const oldZoom = 2.0; // Playhead at 2000px
      const newZoom = 1.0; // Playhead at 1000px
      const currentScroll = 1500; // Playhead visible at 2000px (viewport 1500-2500)

      const newScroll = maintainPlayheadVisibility(
        currentScroll,
        oldZoom,
        newZoom,
        playheadPosition,
        containerWidth
      );

      // At 1x zoom, playhead is at 1000px
      // Should center it: 1000 - (1000/2) = 500px
      expect(newScroll).toBe(500);
    });
  });

  describe('getTimeInterval', () => {
    it('should return 1 minute (60000ms) for zoomed out view (0.1-0.5x)', () => {
      expect(getTimeInterval(0.1)).toBe(60000);
      expect(getTimeInterval(0.3)).toBe(60000);
      expect(getTimeInterval(0.49)).toBe(60000);
    });

    it('should return 10 seconds (10000ms) for medium zoom (0.5-2.0x)', () => {
      expect(getTimeInterval(0.5)).toBe(10000);
      expect(getTimeInterval(1.0)).toBe(10000);
      expect(getTimeInterval(1.5)).toBe(10000);
      expect(getTimeInterval(1.99)).toBe(10000);
    });

    it('should return 1 second (1000ms) for zoomed in view (2.0-5.0x)', () => {
      expect(getTimeInterval(2.0)).toBe(1000);
      expect(getTimeInterval(3.0)).toBe(1000);
      expect(getTimeInterval(4.99)).toBe(1000);
    });

    it('should return 100ms for very zoomed in view (5.0-10x)', () => {
      expect(getTimeInterval(5.0)).toBe(100);
      expect(getTimeInterval(7.5)).toBe(100);
      expect(getTimeInterval(10.0)).toBe(100);
    });
  });
});
