import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AudioSourceSelector } from './AudioSourceSelector';
import { useRecordingStore } from '@/stores/recordingStore';

describe('AudioSourceSelector', () => {
  beforeEach(() => {
    // Reset store before each test
    useRecordingStore.getState().reset();
  });

  it('renders audio source checkboxes', () => {
    render(<AudioSourceSelector />);

    expect(screen.getByTestId('system-audio-checkbox')).toBeInTheDocument();
    expect(screen.getByTestId('microphone-checkbox')).toBeInTheDocument();
    expect(screen.getByText('System Audio')).toBeInTheDocument();
    expect(screen.getByText('Microphone')).toBeInTheDocument();
  });

  it('shows correct help text when no audio sources selected', () => {
    render(<AudioSourceSelector />);

    expect(screen.getByText('No audio will be recorded (video only)')).toBeInTheDocument();
  });

  it('updates store when system audio checkbox is toggled', async () => {
    const user = userEvent.setup();
    render(<AudioSourceSelector />);

    const checkbox = screen.getByTestId('system-audio-checkbox');

    // Initially unchecked
    expect(checkbox).not.toBeChecked();

    // Click to enable
    await user.click(checkbox);

    // Check store state
    expect(useRecordingStore.getState().audioSources.systemAudio).toBe(true);
    expect(screen.getByText('Recording computer output audio')).toBeInTheDocument();
  });

  it('updates store when microphone checkbox is toggled', async () => {
    const user = userEvent.setup();
    render(<AudioSourceSelector />);

    const checkbox = screen.getByTestId('microphone-checkbox');

    // Initially unchecked
    expect(checkbox).not.toBeChecked();

    // Click to enable
    await user.click(checkbox);

    // Check store state
    expect(useRecordingStore.getState().audioSources.microphone).toBe(true);
    expect(screen.getByText('Recording microphone audio')).toBeInTheDocument();
  });

  it('shows correct help text when both sources selected', async () => {
    const user = userEvent.setup();
    render(<AudioSourceSelector />);

    const systemAudioCheckbox = screen.getByTestId('system-audio-checkbox');
    const microphoneCheckbox = screen.getByTestId('microphone-checkbox');

    // Enable both
    await user.click(systemAudioCheckbox);
    await user.click(microphoneCheckbox);

    expect(screen.getByText('Recording both system and microphone audio')).toBeInTheDocument();
  });

  it('disables checkboxes when recording is active', () => {
    // Set recording state
    useRecordingStore.setState({ status: 'recording' });

    render(<AudioSourceSelector />);

    const systemAudioCheckbox = screen.getByTestId('system-audio-checkbox');
    const microphoneCheckbox = screen.getByTestId('microphone-checkbox');

    expect(systemAudioCheckbox).toBeDisabled();
    expect(microphoneCheckbox).toBeDisabled();
  });

  it('disables checkboxes when stopping recording', () => {
    // Set stopping state
    useRecordingStore.setState({ status: 'stopping' });

    render(<AudioSourceSelector />);

    const systemAudioCheckbox = screen.getByTestId('system-audio-checkbox');
    const microphoneCheckbox = screen.getByTestId('microphone-checkbox');

    expect(systemAudioCheckbox).toBeDisabled();
    expect(microphoneCheckbox).toBeDisabled();
  });

  it('enables checkboxes when idle', () => {
    // Ensure idle state
    useRecordingStore.setState({ status: 'idle' });

    render(<AudioSourceSelector />);

    const systemAudioCheckbox = screen.getByTestId('system-audio-checkbox');
    const microphoneCheckbox = screen.getByTestId('microphone-checkbox');

    expect(systemAudioCheckbox).not.toBeDisabled();
    expect(microphoneCheckbox).not.toBeDisabled();
  });

  it('reflects initial state from store', () => {
    // Set initial state
    useRecordingStore.setState({
      audioSources: {
        systemAudio: true,
        microphone: false,
      },
    });

    render(<AudioSourceSelector />);

    const systemAudioCheckbox = screen.getByTestId('system-audio-checkbox');
    const microphoneCheckbox = screen.getByTestId('microphone-checkbox');

    expect(systemAudioCheckbox).toBeChecked();
    expect(microphoneCheckbox).not.toBeChecked();
    expect(screen.getByText('Recording computer output audio')).toBeInTheDocument();
  });
});
