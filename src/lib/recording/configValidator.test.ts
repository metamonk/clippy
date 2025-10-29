/**
 * Config Validator Tests (Story 4.2)
 */

import { describe, it, expect } from 'vitest';
import { validateRecordingConfig, canStartRecording, getConfigError } from './configValidator';

describe('configValidator', () => {
  describe('validateRecordingConfig', () => {
    it('should accept valid configuration with 30 FPS', () => {
      const config = {
        frameRate: 30 as const,
        resolution: '1080p' as const,
        audioSources: { systemAudio: true, microphone: false },
      };

      const result = validateRecordingConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should accept valid configuration with 60 FPS', () => {
      const config = {
        frameRate: 60 as const,
        resolution: '720p' as const,
        audioSources: { systemAudio: false, microphone: true },
      };

      const result = validateRecordingConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should accept source resolution', () => {
      const config = {
        frameRate: 30 as const,
        resolution: 'source' as const,
        audioSources: { systemAudio: true, microphone: true },
      };

      const result = validateRecordingConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should accept configuration with no audio sources', () => {
      // Per story requirements, silent recordings are valid
      const config = {
        frameRate: 30 as const,
        resolution: '1080p' as const,
        audioSources: { systemAudio: false, microphone: false },
      };

      const result = validateRecordingConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should accept configuration with both audio sources', () => {
      const config = {
        frameRate: 30 as const,
        resolution: '1080p' as const,
        audioSources: { systemAudio: true, microphone: true },
      };

      const result = validateRecordingConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reject invalid frame rate', () => {
      const config = {
        frameRate: 45 as any,
        resolution: '1080p' as const,
        audioSources: { systemAudio: true, microphone: false },
      };

      const result = validateRecordingConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Frame rate');
    });

    it('should reject invalid resolution', () => {
      const config = {
        frameRate: 30 as const,
        resolution: '4K' as any,
        audioSources: { systemAudio: true, microphone: false },
      };

      const result = validateRecordingConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Resolution');
    });
  });

  describe('canStartRecording', () => {
    it('should return true for valid configuration', () => {
      const config = {
        frameRate: 30 as const,
        resolution: '1080p' as const,
        audioSources: { systemAudio: true, microphone: false },
      };

      expect(canStartRecording(config)).toBe(true);
    });

    it('should return false for invalid configuration', () => {
      const config = {
        frameRate: 90 as any,
        resolution: '1080p' as const,
        audioSources: { systemAudio: true, microphone: false },
      };

      expect(canStartRecording(config)).toBe(false);
    });
  });

  describe('getConfigError', () => {
    it('should return null for valid configuration', () => {
      const config = {
        frameRate: 30 as const,
        resolution: '1080p' as const,
        audioSources: { systemAudio: true, microphone: false },
      };

      expect(getConfigError(config)).toBeNull();
    });

    it('should return error message for invalid configuration', () => {
      const config = {
        frameRate: 120 as any,
        resolution: '1080p' as const,
        audioSources: { systemAudio: true, microphone: false },
      };

      const error = getConfigError(config);
      expect(error).not.toBeNull();
      expect(error).toContain('Frame rate');
    });
  });
});
