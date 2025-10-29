/**
 * PiP Position and Size Utility Functions (Story 4.5)
 *
 * Provides utilities for calculating PiP positions, validating bounds,
 * and converting between percentage and pixel values.
 */

import type { PipPosition, PipSize, PipPreset } from '@/types/recording';

/**
 * Screen dimensions interface
 */
export interface ScreenDimensions {
  width: number;
  height: number;
}

/**
 * Validate that PiP overlay stays within screen bounds
 *
 * @param position - PiP position in pixels
 * @param size - PiP size in pixels
 * @param screenDimensions - Screen dimensions
 * @returns true if PiP is within bounds, false otherwise
 */
export function validatePipBounds(
  position: PipPosition,
  size: PipSize,
  screenDimensions: ScreenDimensions
): boolean {
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.x + size.width <= screenDimensions.width &&
    position.y + size.height <= screenDimensions.height
  );
}

/**
 * Calculate PiP size from percentage of screen width (maintaining 16:9 aspect ratio)
 *
 * @param percentage - Size as percentage of screen width (10-40)
 * @param screenWidth - Screen width in pixels
 * @returns PiP size in pixels with 16:9 aspect ratio
 */
export function calculatePipSize(percentage: number, screenWidth: number): PipSize {
  const width = Math.round((screenWidth * percentage) / 100);
  const height = Math.round(width / (16 / 9)); // Maintain 16:9 aspect ratio
  return { width, height };
}

/**
 * Calculate PiP position from preset
 *
 * @param preset - Position preset (top-left, top-right, bottom-left, bottom-right)
 * @param pipSize - PiP size in pixels
 * @param screenDimensions - Screen dimensions
 * @param padding - Padding from screen edges (default: 20px)
 * @returns PiP position in pixels
 */
export function calculatePresetPosition(
  preset: PipPreset,
  pipSize: PipSize,
  screenDimensions: ScreenDimensions,
  padding: number = 20
): PipPosition {
  switch (preset) {
    case 'top-left':
      return { x: padding, y: padding };
    case 'top-right':
      return {
        x: screenDimensions.width - pipSize.width - padding,
        y: padding,
      };
    case 'bottom-left':
      return {
        x: padding,
        y: screenDimensions.height - pipSize.height - padding,
      };
    case 'bottom-right':
      return {
        x: screenDimensions.width - pipSize.width - padding,
        y: screenDimensions.height - pipSize.height - padding,
      };
    case 'custom':
      // Custom positions should be set manually, return center as fallback
      return {
        x: Math.round((screenDimensions.width - pipSize.width) / 2),
        y: Math.round((screenDimensions.height - pipSize.height) / 2),
      };
  }
}

/**
 * Constrain PiP position to stay within screen bounds
 *
 * @param position - Desired PiP position
 * @param size - PiP size
 * @param screenDimensions - Screen dimensions
 * @returns Constrained position within bounds
 */
export function constrainPipPosition(
  position: PipPosition,
  size: PipSize,
  screenDimensions: ScreenDimensions
): PipPosition {
  return {
    x: Math.max(0, Math.min(position.x, screenDimensions.width - size.width)),
    y: Math.max(0, Math.min(position.y, screenDimensions.height - size.height)),
  };
}

/**
 * Get default screen dimensions (1920x1080)
 * Used as fallback when actual dimensions cannot be retrieved
 */
export function getDefaultScreenDimensions(): ScreenDimensions {
  return { width: 1920, height: 1080 };
}

/**
 * Get actual screen dimensions from the system using Tauri OS plugin
 * Falls back to 1920x1080 if retrieval fails
 *
 * @returns Promise resolving to actual screen dimensions
 */
export async function getScreenDimensions(): Promise<ScreenDimensions> {
  try {
    // Dynamically import to avoid issues in test environment
    const { primaryDisplay } = await import('@tauri-apps/plugin-os');
    const display = await primaryDisplay();

    if (display && display.size) {
      return {
        width: display.size.width,
        height: display.size.height,
      };
    }

    console.warn('Failed to get screen dimensions from OS, using default');
    return getDefaultScreenDimensions();
  } catch (error) {
    console.warn('Failed to get screen dimensions, using default:', error);
    return getDefaultScreenDimensions();
  }
}

/**
 * Calculate percentage from PiP width and screen width
 *
 * @param pipWidth - PiP width in pixels
 * @param screenWidth - Screen width in pixels
 * @returns Percentage of screen width
 */
export function calculatePercentageFromWidth(
  pipWidth: number,
  screenWidth: number
): number {
  return Math.round((pipWidth / screenWidth) * 100);
}
