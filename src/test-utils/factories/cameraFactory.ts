/**
 * Camera Data Factory
 *
 * Factory functions for creating Camera test data with realistic defaults.
 * Follows data factory pattern from TEA knowledge base.
 */

import type { Camera } from '@/types/recording';

/**
 * Create a single camera with optional overrides
 */
export function createCamera(overrides?: Partial<Camera>): Camera {
  const defaultCamera: Camera = {
    id: 0,
    name: 'FaceTime HD Camera',
    resolution: '1280x720',
    fps: 30,
  };

  return {
    ...defaultCamera,
    ...overrides,
  };
}

/**
 * Create a list of cameras with sequential IDs
 */
export function createCameraList(count = 2): Camera[] {
  const cameraNames = [
    'FaceTime HD Camera',
    'External Webcam',
    'Logitech C920',
    'Built-in Camera',
    'USB Camera',
  ];

  const resolutions = ['1280x720', '1920x1080', '3840x2160'];
  const fpsOptions = [30, 60];

  return Array.from({ length: count }, (_, index) => ({
    id: index,
    name: cameraNames[index % cameraNames.length],
    resolution: resolutions[index % resolutions.length],
    fps: fpsOptions[index % fpsOptions.length],
  }));
}

/**
 * Create a 4K camera (high resolution)
 */
export function create4KCamera(overrides?: Partial<Camera>): Camera {
  return createCamera({
    id: 0,
    name: 'Logitech 4K Pro',
    resolution: '3840x2160',
    fps: 30,
    ...overrides,
  });
}

/**
 * Create a 60 FPS camera (high frame rate)
 */
export function create60FPSCamera(overrides?: Partial<Camera>): Camera {
  return createCamera({
    id: 0,
    name: 'High-Speed Webcam',
    resolution: '1920x1080',
    fps: 60,
    ...overrides,
  });
}

/**
 * Create a basic webcam (720p, 30fps)
 */
export function createBasicWebcam(overrides?: Partial<Camera>): Camera {
  return createCamera({
    id: 0,
    name: 'Built-in Camera',
    resolution: '1280x720',
    fps: 30,
    ...overrides,
  });
}
