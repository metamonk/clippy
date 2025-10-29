/**
 * PiP Utility Functions Tests (Story 4.5)
 */

import { describe, it, expect } from 'vitest';
import {
  validatePipBounds,
  calculatePipSize,
  calculatePresetPosition,
  constrainPipPosition,
  getDefaultScreenDimensions,
  calculatePercentageFromWidth,
} from './pipUtils';

describe('pipUtils', () => {
  const screenDimensions = { width: 1920, height: 1080 };

  describe('validatePipBounds', () => {
    it('should validate position within bounds', () => {
      const position = { x: 100, y: 100 };
      const size = { width: 384, height: 216 };

      expect(validatePipBounds(position, size, screenDimensions)).toBe(true);
    });

    it('should reject position beyond right edge', () => {
      const position = { x: 1700, y: 100 };
      const size = { width: 384, height: 216 };

      expect(validatePipBounds(position, size, screenDimensions)).toBe(false);
    });

    it('should reject position beyond bottom edge', () => {
      const position = { x: 100, y: 1000 };
      const size = { width: 384, height: 216 };

      expect(validatePipBounds(position, size, screenDimensions)).toBe(false);
    });

    it('should reject negative position', () => {
      const position = { x: -10, y: 100 };
      const size = { width: 384, height: 216 };

      expect(validatePipBounds(position, size, screenDimensions)).toBe(false);
    });

    it('should validate position at exact edge', () => {
      const position = { x: 1536, y: 864 };
      const size = { width: 384, height: 216 };

      // Position + size = screen dimensions (exactly at edge)
      expect(validatePipBounds(position, size, screenDimensions)).toBe(true);
    });
  });

  describe('calculatePipSize', () => {
    it('should calculate 20% size with 16:9 aspect ratio', () => {
      const size = calculatePipSize(20, 1920);
      expect(size.width).toBe(384);
      expect(size.height).toBe(216);
    });

    it('should calculate 10% size (minimum)', () => {
      const size = calculatePipSize(10, 1920);
      expect(size.width).toBe(192);
      expect(size.height).toBe(108);
    });

    it('should calculate 40% size (maximum)', () => {
      const size = calculatePipSize(40, 1920);
      expect(size.width).toBe(768);
      expect(size.height).toBe(432);
    });

    it('should maintain 16:9 aspect ratio for various percentages', () => {
      for (let percentage = 10; percentage <= 40; percentage += 5) {
        const size = calculatePipSize(percentage, 1920);
        const aspectRatio = size.width / size.height;
        expect(aspectRatio).toBeCloseTo(16 / 9, 1);
      }
    });
  });

  describe('calculatePresetPosition', () => {
    const pipSize = { width: 384, height: 216 };
    const padding = 20;

    it('should calculate top-left position', () => {
      const position = calculatePresetPosition('top-left', pipSize, screenDimensions, padding);
      expect(position).toEqual({ x: 20, y: 20 });
    });

    it('should calculate top-right position', () => {
      const position = calculatePresetPosition('top-right', pipSize, screenDimensions, padding);
      expect(position).toEqual({ x: 1516, y: 20 });
    });

    it('should calculate bottom-left position', () => {
      const position = calculatePresetPosition('bottom-left', pipSize, screenDimensions, padding);
      expect(position).toEqual({ x: 20, y: 844 });
    });

    it('should calculate bottom-right position', () => {
      const position = calculatePresetPosition('bottom-right', pipSize, screenDimensions, padding);
      expect(position).toEqual({ x: 1516, y: 844 });
    });

    it('should calculate custom position (centered)', () => {
      const position = calculatePresetPosition('custom', pipSize, screenDimensions);
      // Custom should return center as fallback
      expect(position.x).toBe(Math.round((1920 - 384) / 2));
      expect(position.y).toBe(Math.round((1080 - 216) / 2));
    });

    it('should respect custom padding', () => {
      const customPadding = 50;
      const position = calculatePresetPosition('top-left', pipSize, screenDimensions, customPadding);
      expect(position).toEqual({ x: 50, y: 50 });
    });
  });

  describe('constrainPipPosition', () => {
    const pipSize = { width: 384, height: 216 };

    it('should not modify position already within bounds', () => {
      const position = { x: 100, y: 100 };
      const constrained = constrainPipPosition(position, pipSize, screenDimensions);
      expect(constrained).toEqual(position);
    });

    it('should constrain position beyond right edge', () => {
      const position = { x: 2000, y: 100 };
      const constrained = constrainPipPosition(position, pipSize, screenDimensions);
      expect(constrained.x).toBe(1536); // 1920 - 384
      expect(constrained.y).toBe(100);
    });

    it('should constrain position beyond bottom edge', () => {
      const position = { x: 100, y: 1500 };
      const constrained = constrainPipPosition(position, pipSize, screenDimensions);
      expect(constrained.x).toBe(100);
      expect(constrained.y).toBe(864); // 1080 - 216
    });

    it('should constrain negative position to 0', () => {
      const position = { x: -50, y: -100 };
      const constrained = constrainPipPosition(position, pipSize, screenDimensions);
      expect(constrained).toEqual({ x: 0, y: 0 });
    });

    it('should constrain both axes if needed', () => {
      const position = { x: -10, y: 2000 };
      const constrained = constrainPipPosition(position, pipSize, screenDimensions);
      expect(constrained.x).toBe(0);
      expect(constrained.y).toBe(864);
    });
  });

  describe('getDefaultScreenDimensions', () => {
    it('should return 1920x1080 as default', () => {
      const dimensions = getDefaultScreenDimensions();
      expect(dimensions).toEqual({ width: 1920, height: 1080 });
    });
  });

  describe('calculatePercentageFromWidth', () => {
    it('should calculate 20% from 384px width at 1920px screen', () => {
      const percentage = calculatePercentageFromWidth(384, 1920);
      expect(percentage).toBe(20);
    });

    it('should calculate 10% from 192px width', () => {
      const percentage = calculatePercentageFromWidth(192, 1920);
      expect(percentage).toBe(10);
    });

    it('should calculate 40% from 768px width', () => {
      const percentage = calculatePercentageFromWidth(768, 1920);
      expect(percentage).toBe(40);
    });

    it('should round to nearest integer', () => {
      const percentage = calculatePercentageFromWidth(385, 1920);
      expect(percentage).toBe(20); // Rounds down
    });
  });
});
