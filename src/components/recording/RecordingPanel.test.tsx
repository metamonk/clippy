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
  },
}));

// Import mocked invoke after mock setup
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

describe('RecordingPanel', () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useRecordingStore.getState().reset();
  });

  it('should render when open', () => {
    render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText('Screen Recording')).toBeInTheDocument();
    expect(screen.getByText('Record your screen for demonstrations and tutorials')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(<RecordingPanel open={false} onOpenChange={mockOnOpenChange} />);

    expect(screen.queryByText('Screen Recording')).not.toBeInTheDocument();
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
        .mockResolvedValueOnce(true) // permission check
        .mockResolvedValueOnce(true) // permission check before start
        .mockResolvedValueOnce('test-recording-id'); // start recording

      render(<RecordingPanel open={true} onOpenChange={mockOnOpenChange} />);

      // Wait for initial permission check
      await waitFor(() => {
        expect(screen.getByText('Record Screen')).toBeInTheDocument();
      });

      // Click record button
      const recordButton = screen.getByText('Record Screen');
      await user.click(recordButton);

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('cmd_start_screen_recording');
        expect(toast.success).toHaveBeenCalledWith('Recording Started', {
          description: 'Screen recording is now active',
        });
      });
    });

    it('should show recording indicator when recording', async () => {
      const user = userEvent.setup();
      vi.mocked(invoke)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('test-recording-id');

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
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('test-recording-id');

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
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('test-recording-id')
        .mockResolvedValueOnce('/path/to/recording.raw'); // stop recording

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
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Device not available'));

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
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('test-recording-id')
        .mockRejectedValueOnce(new Error('Failed to save file'));

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
});
