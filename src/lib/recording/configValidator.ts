/**
 * Recording Configuration Validator (Story 4.2)
 *
 * Validates recording configuration to prevent invalid states.
 */

import type { AudioSourceConfig } from '@/stores/recordingStore';
import type { FrameRate, Resolution } from '@/types/recording';

export interface ValidationResult {
  isValid: boolean;
  error: string | null;
}

/**
 * Validate recording configuration
 *
 * @param config - Configuration to validate
 * @returns Validation result with error message if invalid
 */
export function validateRecordingConfig(config: {
  frameRate: FrameRate;
  resolution: Resolution;
  audioSources: AudioSourceConfig;
}): ValidationResult {
  // Validate frame rate
  if (config.frameRate !== 30 && config.frameRate !== 60) {
    return {
      isValid: false,
      error: 'Frame rate must be 30 or 60 FPS',
    };
  }

  // Validate resolution
  const validResolutions: Resolution[] = ['source', '1080p', '720p'];
  if (!validResolutions.includes(config.resolution)) {
    return {
      isValid: false,
      error: 'Resolution must be source, 1080p, or 720p',
    };
  }

  // Note: Audio validation removed as per story requirements
  // All audio combinations are valid: system only, mic only, both, or none
  // Silent recordings are valid for visual-only content

  return {
    isValid: true,
    error: null,
  };
}

/**
 * Check if recording can start with current configuration
 *
 * @param config - Configuration to validate
 * @returns True if recording can start
 */
export function canStartRecording(config: {
  frameRate: FrameRate;
  resolution: Resolution;
  audioSources: AudioSourceConfig;
}): boolean {
  return validateRecordingConfig(config).isValid;
}

/**
 * Get user-friendly error message for invalid configuration
 *
 * @param config - Configuration to validate
 * @returns Error message or null if valid
 */
export function getConfigError(config: {
  frameRate: FrameRate;
  resolution: Resolution;
  audioSources: AudioSourceConfig;
}): string | null {
  return validateRecordingConfig(config).error;
}
