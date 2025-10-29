/**
 * RecordingPanel Component Tests
 *
 * Tests for the RecordingPanel component using Vitest and React Testing Library
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordingPanel } from './RecordingPanel';
import { useRecordingStore } from '@/stores/recordingStore';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock recording lib
vi.mock('@/lib/tauri/recording', async () => {
  const actual = await vi.importActual('@/lib/tauri/recording');
  return {
    ...actual,
    checkDiskSpace: vi.fn().mockResolvedValue(10000000000), // 10GB available
  };
});

// Import mocked invoke after mock setup
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

describe('RecordingPanel', () => {
  const mockOnOpenChange = vi.fn();
  const mockWindows = [
    {
      windowId: 1,
      ownerName: 'Chrome',
      title: 'Google Chrome - Test Window',
      isOnScreen: true,
    },
    {
      windowId: 2,
      ownerName: 'VSCode',
      title: 'Visual Studio Code',
      isOnScreen: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useRecordingStore.getState().reset();

    // Default mock for all invoke calls
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      // console.log('invoke called with:', cmd); // Uncomment for debugging
      if (cmd === 'cmd_get_available_windows') {
        return Promise.resolve(mockWindows);
      }
      if (cmd === 'cmd_check_screen_recording_permission') {
        return Promise.resolve(true);
      }
      if (cmd === 'cmd_check_camera_permission') {
        return Promise.resolve(true);
      }
      // Default for unknown commands
      return Promise.resolve(null);
    });
  });

  it('should render when open', () => {
    render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText('Recording')).toBeInTheDocument();
    expect(screen.getByText('Record your screen or webcam for demonstrations and tutorials')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(<RecordingPanel open={false} onOpenChange={mockOnOpenChange} />);

    expect(screen.queryByText('Recording')).not.toBeInTheDocument();
  });

  it('should check permission when panel opens', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true);

    render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('cmd_check_screen_recording_permission');
    });
  });

  it('should show permission prompt if permission not granted', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(false);

    render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

    await waitFor(() => {
      // PermissionPrompt should be shown (it has its own dialog)
      expect(invoke).toHaveBeenCalledWith('cmd_check_screen_recording_permission');
    });
  });

  describe('Recording Controls', () => {
    it('should show "Record Screen" button when idle', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(true);

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('Record Screen')).toBeInTheDocument();
      });
    });

    it('should start recording when "Record Screen" clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(true) // 1. permission check when panel opens
        .mockResolvedValueOnce('/Users/test') // 2. cmd_get_home_dir for disk space check
        .mockResolvedValueOnce(true) // 3. permission check before start
        .mockResolvedValueOnce('test-recording-id'); // 4. start recording

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      // Wait for initial permission check
      await waitFor(() => {
        expect(screen.getByText('Record Screen')).toBeInTheDocument();
      });

      // Click record button
      const recordButton = screen.getByText('Record Screen');
      await user.click(recordButton);

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('cmd_start_screen_recording', expect.any(Object));
        expect(toast.success).toHaveBeenCalledWith('Recording Started', {
          description: 'Screen recording is now active',
        });
      });
    });

    it('should show recording indicator when recording', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(true) // 1. permission check when panel opens
        .mockResolvedValueOnce('/Users/test') // 2. cmd_get_home_dir
        .mockResolvedValueOnce(true) // 3. permission check before start
        .mockResolvedValueOnce('test-recording-id'); // 4. start recording

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('Record Screen')).toBeInTheDocument();
      });

      const recordButton = screen.getByText('Record Screen');
      await user.click(recordButton);

      await waitFor(() => {
        expect(screen.getByText('Recording...')).toBeInTheDocument();
        expect(screen.getByText('Stop Recording')).toBeInTheDocument();
      });
    });

    it('should show duration timer when recording', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(true) // 1. permission check when panel opens
        .mockResolvedValueOnce('/Users/test') // 2. cmd_get_home_dir
        .mockResolvedValueOnce(true) // 3. permission check before start
        .mockResolvedValueOnce('test-recording-id'); // 4. start recording

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('Record Screen')).toBeInTheDocument();
      });

      const recordButton = screen.getByText('Record Screen');
      await user.click(recordButton);

      await waitFor(() => {
        // Should show 00:00 initially
        expect(screen.getByText(/00:00/)).toBeInTheDocument();
      });
    });

    it('should stop recording when "Stop Recording" clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(true) // 1. permission check when panel opens
        .mockResolvedValueOnce('/Users/test') // 2. cmd_get_home_dir
        .mockResolvedValueOnce(true) // 3. permission check before start
        .mockResolvedValueOnce('test-recording-id') // 4. start recording
        .mockResolvedValueOnce('/path/to/recording.raw'); // 5. stop recording

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('Record Screen')).toBeInTheDocument();
      });

      // Start recording
      const recordButton = screen.getByText('Record Screen');
      await user.click(recordButton);

      await waitFor(() => {
        expect(screen.getByText('Stop Recording')).toBeInTheDocument();
      });

      // Stop recording
      const stopButton = screen.getByText('Stop Recording');
      await user.click(stopButton);

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('cmd_stop_recording', {
          recordingId: 'test-recording-id',
        });
        expect(toast.success).toHaveBeenCalledWith('Recording Saved', {
          description: 'Recording saved to /path/to/recording.raw',
          duration: 5000,
        });
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('should show error toast if start recording fails', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(true) // 1. permission check when panel opens
        .mockResolvedValueOnce('/Users/test') // 2. cmd_get_home_dir
        .mockResolvedValueOnce(true) // 3. permission check before start
        .mockRejectedValueOnce(new Error('Device not available')); // 4. start recording fails

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('Record Screen')).toBeInTheDocument();
      });

      const recordButton = screen.getByText('Record Screen');
      await user.click(recordButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to Start Recording', {
          description: 'Device not available',
        });
      });
    });

    it('should show error toast if stop recording fails', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(true) // 1. permission check when panel opens
        .mockResolvedValueOnce('/Users/test') // 2. cmd_get_home_dir
        .mockResolvedValueOnce(true) // 3. permission check before start
        .mockResolvedValueOnce('test-recording-id') // 4. start recording
        .mockRejectedValueOnce(new Error('Failed to save file')); // 5. stop recording fails

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('Record Screen')).toBeInTheDocument();
      });

      // Start recording
      const recordButton = screen.getByText('Record Screen');
      await user.click(recordButton);

      await waitFor(() => {
        expect(screen.getByText('Stop Recording')).toBeInTheDocument();
      });

      // Stop recording
      const stopButton = screen.getByText('Stop Recording');
      await user.click(stopButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to Stop Recording', {
          description: 'Failed to save file',
        });
      });
    });
  });

  describe('Permission Handling', () => {
    it('should show permission prompt if permission denied on start', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(true) // initial check
        .mockResolvedValueOnce(false); // check before start

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByText('Record Screen')).toBeInTheDocument();
      });

      const recordButton = screen.getByText('Record Screen');
      await user.click(recordButton);

      // PermissionPrompt should be triggered (tested in PermissionPrompt.test.tsx)
      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('cmd_check_screen_recording_permission');
      });
    });
  });

  describe('Screen Recording Mode Toggle (Story 4.1)', () => {
    /**
     * Test ID: 4.1-CT-001
     * AC: #1 - Recording panel shows "Full Screen" vs "Window" toggle
     */
    it('should show screen recording mode toggle with both options', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(true);

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Full Screen' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Window' })).toBeInTheDocument();
      });
    });

    /**
     * Test ID: 4.1-CT-002
     * AC: #1 - Full Screen mode is selected by default
     */
    it('should have Full Screen mode selected by default', async () => {
      // Uses default mock implementation from beforeEach

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        const fullScreenTab = screen.getByRole('tab', { name: 'Full Screen' });
        expect(fullScreenTab).toHaveAttribute('data-state', 'active');
      });
    });

    /**
     * Test ID: 4.1-CT-003
     * AC: #1, #2 - Switching to Window mode updates store and shows WindowSelector
     */
    it('should switch to window mode and show window selector', async () => {
      const user = userEvent.setup();
      // Uses default mock implementation from beforeEach

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Window' })).toBeInTheDocument();
      });

      // Click Window tab
      const windowTab = screen.getByRole('tab', { name: 'Window' });
      await user.click(windowTab);

      await waitFor(() => {
        // Window selector should be visible
        expect(screen.getByText('Select Window')).toBeInTheDocument();
        // Window mode should be active
        expect(windowTab).toHaveAttribute('data-state', 'active');
      });
    });

    /**
     * Test ID: 4.1-CT-004
     * AC: #2 - Window selector is hidden in Full Screen mode
     */
    it('should hide window selector in full screen mode', async () => {
      const user = userEvent.setup();
      // Uses default mock implementation from beforeEach

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Window' })).toBeInTheDocument();
      });

      // Switch to Window mode first
      await user.click(screen.getByRole('tab', { name: 'Window' }));

      await waitFor(() => {
        expect(screen.getByText('Select Window')).toBeInTheDocument();
      });

      // Switch back to Full Screen
      await user.click(screen.getByRole('tab', { name: 'Full Screen' }));

      await waitFor(() => {
        // Window selector should not be visible
        expect(screen.queryByText('Select Window')).not.toBeInTheDocument();
      });
    });

    /**
     * Test ID: 4.1-CT-005
     * AC: #2 - Recording validation requires window selection in window mode
     */
    it('should show error if recording in window mode without window selection', async () => {
      const user = userEvent.setup();
      // Uses default mock implementation from beforeEach for cmd_get_available_windows

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Window' })).toBeInTheDocument();
      });

      // Switch to Window mode
      await user.click(screen.getByRole('tab', { name: 'Window' }));

      await waitFor(() => {
        expect(screen.getByText('Select Window')).toBeInTheDocument();
      });

      // Try to start recording without selecting a window
      const recordButton = screen.getByText('Record Screen');
      await user.click(recordButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('No Window Selected', {
          description: 'Please select a window to record in window mode.',
        });
      });
    });
  });
});
