/**
 * Tests for DeleteClipDialog component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteClipDialog } from './DeleteClipDialog';

describe('DeleteClipDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnConfirm = vi.fn();

  beforeEach(() => {
    mockOnOpenChange.mockClear();
    mockOnConfirm.mockClear();
    localStorage.clear();
  });

  it('renders when open', () => {
    render(
      <DeleteClipDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );

    expect(screen.getByText('Delete clip?')).toBeInTheDocument();
    expect(screen.getByText(/This action can be undone/)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <DeleteClipDialog
        open={false}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );

    expect(screen.queryByText('Delete clip?')).not.toBeInTheDocument();
  });

  it('shows ripple delete checkbox', () => {
    render(
      <DeleteClipDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );

    expect(screen.getByLabelText(/Ripple delete/)).toBeInTheDocument();
  });

  it('calls onConfirm with ripple=false when unchecked', async () => {
    const user = userEvent.setup();

    render(
      <DeleteClipDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    await user.click(deleteButton);

    expect(mockOnConfirm).toHaveBeenCalledWith(false);
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onConfirm with ripple=true when checked', async () => {
    const user = userEvent.setup();

    render(
      <DeleteClipDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    await user.click(deleteButton);

    expect(mockOnConfirm).toHaveBeenCalledWith(true);
  });

  it('calls onOpenChange when cancel is clicked', async () => {
    const user = userEvent.setup();

    render(
      <DeleteClipDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    expect(mockOnConfirm).not.toHaveBeenCalled();
  });

  it('saves ripple preference to localStorage', async () => {
    const user = userEvent.setup();

    render(
      <DeleteClipDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);

    expect(localStorage.getItem('preferRippleDelete')).toBe('true');

    await user.click(checkbox);

    expect(localStorage.getItem('preferRippleDelete')).toBe('false');
  });

  it('loads ripple preference from localStorage', () => {
    localStorage.setItem('preferRippleDelete', 'true');

    render(
      <DeleteClipDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('defaults to false when no preference in localStorage', () => {
    render(
      <DeleteClipDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('handles localStorage errors gracefully', () => {
    // Mock localStorage to throw errors
    const originalGetItem = localStorage.getItem;
    const originalSetItem = localStorage.setItem;

    localStorage.getItem = vi.fn(() => {
      throw new Error('localStorage unavailable');
    });
    localStorage.setItem = vi.fn(() => {
      throw new Error('localStorage unavailable');
    });

    // Should not crash when localStorage is unavailable
    expect(() => {
      render(
        <DeleteClipDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          onConfirm={mockOnConfirm}
        />
      );
    }).not.toThrow();

    // Restore original localStorage
    localStorage.getItem = originalGetItem;
    localStorage.setItem = originalSetItem;
  });

  it('shows destructive styling for delete button', () => {
    render(
      <DeleteClipDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
      />
    );

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton.className).toContain('bg-red-600');
  });
});
