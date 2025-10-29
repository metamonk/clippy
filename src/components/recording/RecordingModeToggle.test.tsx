/**
 * Recording Mode Toggle Component Tests (Story 4.4)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { RecordingModeToggle } from './RecordingModeToggle';
import { useRecordingStore } from '@/stores/recordingStore';

describe('RecordingModeToggle', () => {
  beforeEach(() => {
    // Reset store to default state
    useRecordingStore.setState({
      recordingMode: 'screen',
    });
  });

  it('renders all three mode options', () => {
    render(<RecordingModeToggle />);

    // Use more specific queries to avoid ambiguity
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);

    // Verify each tab by its text content
    expect(screen.getByText(/^screen$/i)).toBeInTheDocument();
    expect(screen.getByText(/^webcam$/i)).toBeInTheDocument();
    expect(screen.getByText(/screen \+ webcam/i)).toBeInTheDocument();
  });

  it('shows screen mode as selected by default', () => {
    render(<RecordingModeToggle />);
    
    const screenTab = screen.getByRole('tab', { name: /^screen$/i });
    expect(screenTab).toHaveAttribute('data-state', 'active');
  });

  it('switches to webcam mode when clicked', async () => {
    const user = userEvent.setup();
    render(<RecordingModeToggle />);
    
    const webcamTab = screen.getByRole('tab', { name: /^webcam$/i });
    await user.click(webcamTab);
    
    expect(useRecordingStore.getState().recordingMode).toBe('webcam');
    expect(webcamTab).toHaveAttribute('data-state', 'active');
  });

  it('switches to pip mode when clicked', async () => {
    const user = userEvent.setup();
    render(<RecordingModeToggle />);
    
    const pipTab = screen.getByRole('tab', { name: /screen \+ webcam/i });
    await user.click(pipTab);
    
    expect(useRecordingStore.getState().recordingMode).toBe('pip');
    expect(pipTab).toHaveAttribute('data-state', 'active');
  });

  it('persists selected mode in store', async () => {
    const user = userEvent.setup();
    render(<RecordingModeToggle />);
    
    // Switch to pip
    await user.click(screen.getByRole('tab', { name: /screen \+ webcam/i }));
    expect(useRecordingStore.getState().recordingMode).toBe('pip');
    
    // Switch to webcam
    await user.click(screen.getByRole('tab', { name: /^webcam$/i }));
    expect(useRecordingStore.getState().recordingMode).toBe('webcam');
    
    // Switch back to screen
    await user.click(screen.getByRole('tab', { name: /^screen$/i }));
    expect(useRecordingStore.getState().recordingMode).toBe('screen');
  });
});
