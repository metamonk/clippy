/**
 * File Size Estimator Tests (Story 4.2)
 */

import { describe, it, expect } from 'vitest';
import { estimateFileSize, formatFileSizeEstimate, getDetailedEstimate } from './fileSizeEstimator';

describe('fileSizeEstimator', () => {
  describe('estimateFileSize', () => {
    it('should return correct estimate for 720p @ 30 FPS', () => {
      expect(estimateFileSize('720p', 30)).toBe(3);
    });

    it('should return correct estimate for 720p @ 60 FPS', () => {
      expect(estimateFileSize('720p', 60)).toBe(5);
    });

    it('should return correct estimate for 1080p @ 30 FPS', () => {
      expect(estimateFileSize('1080p', 30)).toBe(5);
    });

    it('should return correct estimate for 1080p @ 60 FPS', () => {
      expect(estimateFileSize('1080p', 60)).toBe(8);
    });

    it('should return correct estimate for source @ 30 FPS', () => {
      expect(estimateFileSize('source', 30)).toBe(8);
    });

    it('should return correct estimate for source @ 60 FPS', () => {
      expect(estimateFileSize('source', 60)).toBe(12);
    });
  });

  describe('formatFileSizeEstimate', () => {
    it('should format file size with ~MB/min', () => {
      expect(formatFileSizeEstimate(5)).toBe('~5 MB/min');
    });

    it('should format file size for large values', () => {
      expect(formatFileSizeEstimate(12)).toBe('~12 MB/min');
    });
  });

  describe('getDetailedEstimate', () => {
    it('should return detailed estimate for 1080p @ 30 FPS', () => {
      const result = getDetailedEstimate('1080p', 30);

      expect(result.mbPerMin).toBe(5);
      expect(result.mbPerHour).toBe(300);
      expect(result.gbPerHour).toBeCloseTo(0.3, 1);
      expect(result.formatted).toBe('~5 MB/min');
      expect(result.description).toContain('1080p');
      expect(result.description).toContain('30 FPS');
      expect(result.hourlyEstimate).toContain('GB/hour');
    });

    it('should return detailed estimate for 720p @ 60 FPS', () => {
      const result = getDetailedEstimate('720p', 60);

      expect(result.mbPerMin).toBe(5);
      expect(result.mbPerHour).toBe(300);
      expect(result.formatted).toBe('~5 MB/min');
    });

    it('should calculate hourly estimates correctly', () => {
      const result = getDetailedEstimate('1080p', 60);

      expect(result.mbPerMin).toBe(8);
      expect(result.mbPerHour).toBe(480);
      expect(result.gbPerHour).toBeCloseTo(0.5, 1);
    });
  });
});
