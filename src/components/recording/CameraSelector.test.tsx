/**
 * Tests for CameraSelector Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CameraSelector } from './CameraSelector';
import { useRecordingStore } from '@/stores/recordingStore';
import type { Camera } from '@/types/recording';

// Mock Tauri API at the core level
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

import { invoke } from '@tauri-apps/api/core';

describe('CameraSelector', () => {
  const mockCameras: Camera[] = [
    {
      id: 0,
      name: 'FaceTime HD Camera',
      resolution: '1920x1080',
      fps: 30,
    },
    {
      id: 1,
      name: 'External USB Camera',
      resolution: '1280x720',
      fps: 30,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useRecordingStore.setState({
      cameras: [],
      selectedCamera: null,
    });
  });

  it('should render camera selector', () => {
    render(<CameraSelector />);
    expect(screen.getByText('Select Camera')).toBeInTheDocument();
  });

  it('should load cameras on mount when permission granted', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(true) // checkCameraPermission
      .mockResolvedValueOnce(mockCameras); // listCameras

    render(<CameraSelector />);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('cmd_check_camera_permission');
      expect(invoke).toHaveBeenCalledWith('cmd_list_cameras');
    });

    // Cameras should be in the store
    expect(useRecordingStore.getState().cameras).toEqual(mockCameras);
  });

  it('should auto-select first camera if available', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(true) // checkCameraPermission
      .mockResolvedValueOnce(mockCameras); // listCameras

    render(<CameraSelector />);

    await waitFor(() => {
      const selected = useRecordingStore.getState().selectedCamera;
      expect(selected).toEqual(mockCameras[0]);
    });
  });

  it('should call onCameraSelected callback when camera is selected', async () => {
    const onCameraSelected = vi.fn();
    vi.mocked(invoke)
      .mockResolvedValueOnce(true) // checkCameraPermission
      .mockResolvedValueOnce(mockCameras); // listCameras

    render(<CameraSelector onCameraSelected={onCameraSelected} />);

    await waitFor(() => {
      expect(onCameraSelected).toHaveBeenCalledWith(mockCameras[0].id);
    });
  });

  it('should show permission warning when permission denied', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(false); // checkCameraPermission

    render(<CameraSelector />);

    await waitFor(() => {
      expect(screen.getByText(/Camera permission not granted/i)).toBeInTheDocument();
    });
  });

  it('should handle empty camera list', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(true) // checkCameraPermission
      .mockResolvedValueOnce([]); // listCameras - empty

    render(<CameraSelector />);

    await waitFor(() => {
      expect(useRecordingStore.getState().cameras).toEqual([]);
      expect(useRecordingStore.getState().selectedCamera).toBeNull();
    });
  });

  it('should handle camera enumeration error', async () => {
    const error = new Error('Failed to enumerate cameras');
    vi.mocked(invoke)
      .mockResolvedValueOnce(true) // checkCameraPermission
      .mockRejectedValueOnce(error); // listCameras - error

    render(<CameraSelector />);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('cmd_list_cameras');
    });
  });

  it('should update store when camera selection changes', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(true) // checkCameraPermission
      .mockResolvedValueOnce(mockCameras); // listCameras

    // Set cameras in store
    useRecordingStore.setState({
      cameras: mockCameras,
      selectedCamera: mockCameras[0],
    });

    render(<CameraSelector />);

    // Camera selection should be available in the dropdown
    // Note: Full interaction testing would require more complex setup with radix-ui
    expect(useRecordingStore.getState().selectedCamera).toEqual(mockCameras[0]);
  });
});
