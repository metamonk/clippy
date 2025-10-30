/**
 * Window Selector Component Tests (Story 4.1)
 *
 * Test ID: 4.1-UT-001 to 4.1-UT-003
 * ACs: #2 (Window selection UI)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WindowSelector } from './WindowSelector';
import { useRecordingStore } from '@/stores/recordingStore';
import type { WindowInfo } from '@/types/recording';

// Mock the recording store
vi.mock('@/stores/recordingStore');

// Mock Tauri recording API
vi.mock('@/lib/tauri/recording', () => ({
  getAvailableWindows: vi.fn(),
}));

describe('WindowSelector', () => {
  const mockWindows: WindowInfo[] = [
    { windowId: 1, ownerName: 'Safari', title: 'Test Page', isOnScreen: true },
    { windowId: 2, ownerName: 'Chrome', title: 'Google', isOnScreen: true },
    { windowId: 3, ownerName: 'VSCode', title: 'index.ts', isOnScreen: true },
    { windowId: 4, ownerName: 'Terminal', title: 'bash', isOnScreen: false },
  ];

  const mockSetSelectedWindow = vi.fn();
  const mockRefreshWindows = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup store mock
    vi.mocked(useRecordingStore).mockReturnValue({
      availableWindows: mockWindows,
      selectedWindowId: null,
      setSelectedWindow: mockSetSelectedWindow,
      refreshWindows: mockRefreshWindows,
    } as any);
  });

  /**
   * Test ID: 4.1-UT-001
   * AC: #2 - Window list renders correctly
   */
  it('renders window list with application names and titles', async () => {
    render(<WindowSelector />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    // Click to open dropdown
    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    // Verify windows are displayed
    await waitFor(() => {
      expect(screen.getByText(/Safari/)).toBeInTheDocument();
      expect(screen.getByText(/Test Page/)).toBeInTheDocument();
      expect(screen.getByText(/Chrome/)).toBeInTheDocument();
    });
  });

  /**
   * Test ID: 4.1-UT-002
   * AC: #2 - Window selection works correctly
   */
  it('handles window selection', async () => {
    render(<WindowSelector />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    // Open dropdown
    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    // Select a window
    await waitFor(async () => {
      const safariOption = screen.getByText(/Test Page/);
      await userEvent.click(safariOption);
    });

    // Verify store was updated
    await waitFor(() => {
      expect(mockSetSelectedWindow).toHaveBeenCalledWith(1);
    });
  });

  /**
   * Test ID: 4.1-UT-003
   * AC: #2 - Shows "No windows available" message when list is empty
   */
  it('displays "No windows available" message when list is empty', () => {
    vi.mocked(useRecordingStore).mockReturnValue({
      availableWindows: [],
      selectedWindowId: null,
      setSelectedWindow: mockSetSelectedWindow,
      refreshWindows: mockRefreshWindows,
    } as any);

    render(<WindowSelector />);

    expect(screen.getByText('No windows available for recording')).toBeInTheDocument();
  });

  /**
   * Test ID: 4.1-UT-004
   * AC: #2 - Refresh button works
   */
  it('refresh button calls refreshWindows', async () => {
    render(<WindowSelector />);

    const refreshButton = screen.getByTitle('Refresh window list');
    await userEvent.click(refreshButton);

    expect(mockRefreshWindows).toHaveBeenCalled();
  });

  /**
   * Test ID: 4.1-UT-006
   * AC: #2 - Hidden windows are disabled
   */
  it('disables hidden/off-screen windows', async () => {
    render(<WindowSelector />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    // Open dropdown
    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    // The Terminal window (isOnScreen: false) should be marked as hidden
    await waitFor(() => {
      const terminalOption = screen.getByText(/bash/);
      const parent = terminalOption.closest('[role="option"]');
      expect(parent).toHaveAttribute('aria-disabled', 'true');
    });
  });
});
