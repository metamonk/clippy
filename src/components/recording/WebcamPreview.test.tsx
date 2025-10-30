/**
 * WebcamPreview Component Tests
 *
 * Comprehensive test coverage for WebcamPreview component including:
 * - Rendering and visibility
 * - Camera frame event handling
 * - Base64 frame decoding and canvas rendering
 * - Error handling
 * - Cleanup and unmounting
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import WebcamPreview from './WebcamPreview';

// Mock Tauri API - use factory functions to avoid hoisting issues
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('@/lib/tauri/recording', () => ({
  startCameraPreview: vi.fn(),
  stopCameraPreview: vi.fn(),
}));

// Import mocked functions after vi.mock() to get the mocked instances
import { listen as mockListen } from '@tauri-apps/api/event';
import {
  startCameraPreview as mockStartCameraPreview,
  stopCameraPreview as mockStopCameraPreview
} from '@/lib/tauri/recording';

describe('WebcamPreview', () => {
  const mockOnError = vi.fn();
  let mockUnlisten: Mock;
  let mockErrorUnlisten: Mock;

  // Cast imported mocks to Mock type for type safety
  const listenMock = mockListen as unknown as Mock;
  const startPreviewMock = mockStartCameraPreview as unknown as Mock;
  const stopPreviewMock = mockStopCameraPreview as unknown as Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock unlisten functions
    mockUnlisten = vi.fn();
    mockErrorUnlisten = vi.fn();

    // Setup default mock behavior
    listenMock.mockImplementation((eventName: string) => {
      if (eventName === 'camera-frame') {
        return Promise.resolve(mockUnlisten);
      }
      if (eventName === 'camera-error') {
        return Promise.resolve(mockErrorUnlisten);
      }
      return Promise.resolve(vi.fn());
    });

    startPreviewMock.mockResolvedValue(undefined);
    stopPreviewMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render canvas when active', async () => {
      render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        const canvas = document.querySelector('canvas');
        expect(canvas).toBeInTheDocument();
      });
    });

    it('should not render anything when not active', () => {
      render(<WebcamPreview cameraIndex={0} active={false} />);

      const canvas = document.querySelector('canvas');
      expect(canvas).not.toBeInTheDocument();
    });

    it('should show loading state when starting camera', async () => {
      // Delay the startCameraPreview to keep loading state visible
      startPreviewMock.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      render(<WebcamPreview cameraIndex={0} active={true} />);

      expect(screen.getByText('Starting camera...')).toBeInTheDocument();
    });

    it('should hide loading state after camera starts', async () => {
      render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(screen.queryByText('Starting camera...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Camera Initialization', () => {
    it('should listen for camera-frame events when active', async () => {
      render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(listenMock).toHaveBeenCalledWith('camera-frame', expect.any(Function));
      });
    });

    it('should listen for camera-error events when active', async () => {
      render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(listenMock).toHaveBeenCalledWith('camera-error', expect.any(Function));
      });
    });

    it('should start camera preview with correct index', async () => {
      render(<WebcamPreview cameraIndex={2} active={true} />);

      await waitFor(() => {
        expect(startPreviewMock).toHaveBeenCalledWith(2);
      });
    });

    it('should not start camera preview when not active', () => {
      render(<WebcamPreview cameraIndex={0} active={false} />);

      expect(startPreviewMock).not.toHaveBeenCalled();
    });

    it('should restart camera when cameraIndex changes', async () => {
      const { rerender } = render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(startPreviewMock).toHaveBeenCalledWith(0);
      });

      // Change camera index
      rerender(<WebcamPreview cameraIndex={1} active={true} />);

      await waitFor(() => {
        expect(startPreviewMock).toHaveBeenCalledWith(1);
      });
    });
  });

  describe('Camera Frame Handling', () => {
    it('should decode and render base64 frames to canvas', async () => {
      let frameHandler: ((event: { payload: { camera_index: number; frame_data: string; width: number; height: number; timestamp: number } }) => void) | null = null;

      listenMock.mockImplementation((eventName: string, handler: (event: any) => void) => {
        if (eventName === 'camera-frame') {
          frameHandler = handler as (event: { payload: { camera_index: number; frame_data: string; width: number; height: number; timestamp: number } }) => void;
          return Promise.resolve(mockUnlisten);
        }
        if (eventName === 'camera-error') {
          return Promise.resolve(mockErrorUnlisten);
        }
        return Promise.resolve(vi.fn());
      });

      render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(frameHandler).not.toBeNull();
      });

      // Create a simple 2x2 red image (RGB format, 12 bytes - 3 bytes per pixel)
      const imageData = new Uint8ClampedArray([
        255, 0, 0, // Red pixel 1
        255, 0, 0, // Red pixel 2
        255, 0, 0, // Red pixel 3
        255, 0, 0, // Red pixel 4
      ]);

      // Convert to base64
      const base64Data = btoa(String.fromCharCode(...imageData));

      // Simulate frame event
      frameHandler!({
        payload: {
          camera_index: 0,
          frame_data: base64Data,
          width: 2,
          height: 2,
          timestamp: Date.now(),
        },
      });

      // Verify canvas was updated
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas).toBeTruthy();
      expect(canvas!.width).toBe(2);
      expect(canvas!.height).toBe(2);
    });

    it('should handle invalid base64 data gracefully', async () => {
      let frameHandler: ((event: { payload: { camera_index: number; frame_data: string; width: number; height: number; timestamp: number } }) => void) | null = null;
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      listenMock.mockImplementation((eventName: string, handler: (event: any) => void) => {
        if (eventName === 'camera-frame') {
          frameHandler = handler as (event: { payload: { camera_index: number; frame_data: string; width: number; height: number; timestamp: number } }) => void;
          return Promise.resolve(mockUnlisten);
        }
        if (eventName === 'camera-error') {
          return Promise.resolve(mockErrorUnlisten);
        }
        return Promise.resolve(vi.fn());
      });

      render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(frameHandler).not.toBeNull();
      });

      // Send invalid base64
      frameHandler!({
        payload: {
          camera_index: 0,
          frame_data: 'invalid-base64!!!',
          width: 100,
          height: 100,
          timestamp: Date.now(),
        },
      });

      // Should log error but not crash
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to decode frame:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });

    it('should update canvas dimensions when frame size changes', async () => {
      let frameHandler: ((event: { payload: { camera_index: number; frame_data: string; width: number; height: number; timestamp: number } }) => void) | null = null;

      listenMock.mockImplementation((eventName: string, handler: (event: any) => void) => {
        if (eventName === 'camera-frame') {
          frameHandler = handler as (event: { payload: { camera_index: number; frame_data: string; width: number; height: number; timestamp: number } }) => void;
          return Promise.resolve(mockUnlisten);
        }
        if (eventName === 'camera-error') {
          return Promise.resolve(mockErrorUnlisten);
        }
        return Promise.resolve(vi.fn());
      });

      render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(frameHandler).not.toBeNull();
      });

      const canvas = document.querySelector('canvas') as HTMLCanvasElement;

      // Send first frame (10x10 RGB - 3 bytes per pixel)
      const smallFrame = new Uint8ClampedArray(10 * 10 * 3).fill(255);
      frameHandler!({
        payload: {
          camera_index: 0,
          frame_data: btoa(String.fromCharCode(...smallFrame)),
          width: 10,
          height: 10,
          timestamp: Date.now(),
        },
      });

      expect(canvas!.width).toBe(10);
      expect(canvas!.height).toBe(10);

      // Send second frame (20x20 RGB - 3 bytes per pixel)
      const largeFrame = new Uint8ClampedArray(20 * 20 * 3).fill(255);
      frameHandler!({
        payload: {
          camera_index: 0,
          frame_data: btoa(String.fromCharCode(...largeFrame)),
          width: 20,
          height: 20,
          timestamp: Date.now(),
        },
      });

      expect(canvas!.width).toBe(20);
      expect(canvas!.height).toBe(20);
    });
  });

  describe('Error Handling', () => {
    it('should display error message when camera fails to start', async () => {
      startPreviewMock.mockRejectedValueOnce(new Error('Camera unavailable'));

      render(<WebcamPreview cameraIndex={0} active={true} onError={mockOnError} />);

      await waitFor(() => {
        expect(screen.getByText('Camera Error')).toBeInTheDocument();
        expect(screen.getByText('Camera unavailable')).toBeInTheDocument();
      });
    });

    it('should call onError callback when camera fails', async () => {
      startPreviewMock.mockRejectedValueOnce(new Error('Permission denied'));

      render(<WebcamPreview cameraIndex={0} active={true} onError={mockOnError} />);

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith('Permission denied');
      });
    });

    it('should handle camera-error events', async () => {
      let errorHandler: ((event: { payload: string }) => void) | null = null;

      listenMock.mockImplementation((eventName: string, handler: (event: any) => void) => {
        if (eventName === 'camera-frame') {
          return Promise.resolve(mockUnlisten);
        }
        if (eventName === 'camera-error') {
          errorHandler = handler as (event: { payload: string }) => void;
          return Promise.resolve(mockErrorUnlisten);
        }
        return Promise.resolve(vi.fn());
      });

      render(<WebcamPreview cameraIndex={0} active={true} onError={mockOnError} />);

      await waitFor(() => {
        expect(errorHandler).not.toBeNull();
      });

      // Simulate camera error event
      errorHandler!({
        payload: 'Camera disconnected',
      });

      await waitFor(() => {
        expect(screen.getByText('Camera Error')).toBeInTheDocument();
        expect(screen.getByText('Camera disconnected')).toBeInTheDocument();
        expect(mockOnError).toHaveBeenCalledWith('Camera disconnected');
      });
    });

    it('should hide loading state when error occurs', async () => {
      startPreviewMock.mockRejectedValueOnce(new Error('Camera error'));

      render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(screen.queryByText('Starting camera...')).not.toBeInTheDocument();
        expect(screen.getByText('Camera Error')).toBeInTheDocument();
      });
    });

    it('should handle string errors', async () => {
      startPreviewMock.mockRejectedValueOnce('String error message');

      render(<WebcamPreview cameraIndex={0} active={true} onError={mockOnError} />);

      await waitFor(() => {
        expect(screen.getByText('String error message')).toBeInTheDocument();
        expect(mockOnError).toHaveBeenCalledWith('String error message');
      });
    });
  });

  describe('Cleanup and Unmounting', () => {
    it('should stop camera preview when unmounted', async () => {
      const { unmount } = render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(startPreviewMock).toHaveBeenCalled();
      });

      unmount();

      await waitFor(() => {
        expect(stopPreviewMock).toHaveBeenCalled();
      });
    });

    it('should remove event listeners when unmounted', async () => {
      const { unmount } = render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(listenMock).toHaveBeenCalled();
      });

      unmount();

      await waitFor(() => {
        expect(mockUnlisten).toHaveBeenCalled();
      });
    });

    it('should stop camera when active changes to false', async () => {
      const { rerender } = render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(startPreviewMock).toHaveBeenCalled();
      });

      vi.clearAllMocks();

      // Deactivate
      rerender(<WebcamPreview cameraIndex={0} active={false} />);

      await waitFor(() => {
        expect(stopPreviewMock).toHaveBeenCalled();
      });
    });

    it('should handle stop errors gracefully on unmount', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      stopPreviewMock.mockRejectedValueOnce(new Error('Already stopped'));

      const { unmount } = render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(startPreviewMock).toHaveBeenCalled();
      });

      unmount();

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to stop camera preview:', expect.any(Error));
      });

      consoleWarnSpy.mockRestore();
    });

    it('should ignore stop errors when switching to inactive', async () => {
      stopPreviewMock.mockRejectedValueOnce(new Error('Not running'));

      const { rerender } = render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(startPreviewMock).toHaveBeenCalled();
      });

      // Should not throw
      rerender(<WebcamPreview cameraIndex={0} active={false} />);

      await waitFor(() => {
        expect(stopPreviewMock).toHaveBeenCalled();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid active/inactive toggling', async () => {
      const { rerender } = render(<WebcamPreview cameraIndex={0} active={true} />);

      // Toggle rapidly
      rerender(<WebcamPreview cameraIndex={0} active={false} />);
      rerender(<WebcamPreview cameraIndex={0} active={true} />);
      rerender(<WebcamPreview cameraIndex={0} active={false} />);

      // Should eventually settle
      await waitFor(() => {
        expect(stopPreviewMock).toHaveBeenCalled();
      });
    });

    it('should handle missing canvas ref gracefully', async () => {
      let frameHandler: ((event: { payload: { camera_index: number; frame_data: string; width: number; height: number; timestamp: number } }) => void) | null = null;

      listenMock.mockImplementation((eventName: string, handler: (event: any) => void) => {
        if (eventName === 'camera-frame') {
          frameHandler = handler as (event: { payload: { camera_index: number; frame_data: string; width: number; height: number; timestamp: number } }) => void;
          return Promise.resolve(mockUnlisten);
        }
        if (eventName === 'camera-error') {
          return Promise.resolve(mockErrorUnlisten);
        }
        return Promise.resolve(vi.fn());
      });

      const { unmount } = render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(frameHandler).not.toBeNull();
      });

      // Unmount to clear canvas ref
      unmount();

      // Try to send frame (should not crash) - RGB format (3 bytes per pixel)
      const frame = new Uint8ClampedArray(100 * 100 * 3).fill(255);
      frameHandler!({
        payload: {
          camera_index: 0,
          frame_data: btoa(String.fromCharCode(...frame)),
          width: 100,
          height: 100,
          timestamp: Date.now(),
        },
      });

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle missing onError callback gracefully', async () => {
      startPreviewMock.mockRejectedValueOnce(new Error('Test error'));

      // Render without onError prop
      render(<WebcamPreview cameraIndex={0} active={true} />);

      await waitFor(() => {
        expect(screen.getByText('Camera Error')).toBeInTheDocument();
      });

      // Should not crash
      expect(true).toBe(true);
    });
  });
});
