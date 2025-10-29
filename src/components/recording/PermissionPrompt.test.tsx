import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionPrompt } from './PermissionPrompt';
import { toast } from 'sonner';

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('PermissionPrompt', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnPermissionGranted = vi.fn();
  const mockOnPermissionDenied = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    mockInvoke.mockResolvedValue(false);

    render(
      <PermissionPrompt
        open={true}
        onOpenChange={mockOnOpenChange}
        onPermissionGranted={mockOnPermissionGranted}
        onPermissionDenied={mockOnPermissionDenied}
      />,
    );

    expect(screen.getByText(/Screen Recording Permission/i)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <PermissionPrompt
        open={false}
        onOpenChange={mockOnOpenChange}
        onPermissionGranted={mockOnPermissionGranted}
        onPermissionDenied={mockOnPermissionDenied}
      />,
    );

    expect(
      screen.queryByText(/Screen Recording Permission/i),
    ).not.toBeInTheDocument();
  });

  it('checks permission on mount when open', async () => {
    mockInvoke.mockResolvedValue(false);

    render(
      <PermissionPrompt
        open={true}
        onOpenChange={mockOnOpenChange}
        onPermissionGranted={mockOnPermissionGranted}
        onPermissionDenied={mockOnPermissionDenied}
      />,
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cmd_check_screen_recording_permission');
    });
  });

  it('shows denied state when permission not granted', async () => {
    mockInvoke.mockResolvedValue(false);

    render(
      <PermissionPrompt
        open={true}
        onOpenChange={mockOnOpenChange}
        onPermissionGranted={mockOnPermissionGranted}
        onPermissionDenied={mockOnPermissionDenied}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Permission Denied/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Open System Preferences/i)).toBeInTheDocument();
  });

  it('calls onPermissionGranted and closes when permission granted', async () => {
    mockInvoke.mockResolvedValue(true);

    render(
      <PermissionPrompt
        open={true}
        onOpenChange={mockOnOpenChange}
        onPermissionGranted={mockOnPermissionGranted}
        onPermissionDenied={mockOnPermissionDenied}
      />,
    );

    await waitFor(() => {
      expect(mockOnPermissionGranted).toHaveBeenCalled();
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('requests permission when button clicked', async () => {
    mockInvoke.mockResolvedValueOnce(false); // Initial check
    mockInvoke.mockResolvedValueOnce(undefined); // Request permission
    mockInvoke.mockResolvedValueOnce(false); // Re-check after request

    const user = userEvent.setup();

    render(
      <PermissionPrompt
        open={true}
        onOpenChange={mockOnOpenChange}
        onPermissionGranted={mockOnPermissionGranted}
        onPermissionDenied={mockOnPermissionDenied}
      />,
    );

    // Wait for initial check
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cmd_check_screen_recording_permission');
    });

    // Find and click the request button (will appear when permission not granted initially)
    const requestButton = screen.getByText(/Request Permission/i);
    await user.click(requestButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cmd_request_screen_recording_permission');
    });
  });

  it('shows error toast on permission check failure', async () => {
    const errorMessage = 'Permission check failed';
    mockInvoke.mockRejectedValue(new Error(errorMessage));

    render(
      <PermissionPrompt
        open={true}
        onOpenChange={mockOnOpenChange}
        onPermissionGranted={mockOnPermissionGranted}
        onPermissionDenied={mockOnPermissionDenied}
      />,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Permission Check Failed',
        expect.objectContaining({
          description: errorMessage,
        }),
      );
    });
  });

  it('shows error toast on permission request failure', async () => {
    const user = userEvent.setup();

    mockInvoke.mockResolvedValueOnce(false); // Initial check
    mockInvoke.mockRejectedValueOnce(new Error('Request failed')); // Request permission fails

    render(
      <PermissionPrompt
        open={true}
        onOpenChange={mockOnOpenChange}
        onPermissionGranted={mockOnPermissionGranted}
        onPermissionDenied={mockOnPermissionDenied}
      />,
    );

    // Wait for initial check
    await waitFor(() => {
      expect(screen.getByText(/Request Permission/i)).toBeInTheDocument();
    });

    const requestButton = screen.getByText(/Request Permission/i);
    await user.click(requestButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Permission Request Failed',
        expect.objectContaining({
          description: 'Request failed',
        }),
      );
    });

    expect(mockOnPermissionDenied).toHaveBeenCalled();
  });

  it('shows success toast on permission request', async () => {
    const user = userEvent.setup();

    mockInvoke.mockResolvedValueOnce(false); // Initial check
    mockInvoke.mockResolvedValueOnce(undefined); // Request permission succeeds
    mockInvoke.mockResolvedValueOnce(false); // Re-check (still false until app restart)

    render(
      <PermissionPrompt
        open={true}
        onOpenChange={mockOnOpenChange}
        onPermissionGranted={mockOnPermissionGranted}
        onPermissionDenied={mockOnPermissionDenied}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Request Permission/i)).toBeInTheDocument();
    });

    const requestButton = screen.getByText(/Request Permission/i);
    await user.click(requestButton);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Permission Request Sent',
        expect.objectContaining({
          description: expect.stringContaining('System Preferences'),
        }),
      );
    });
  });
});
