/**
 * Recording Config Section Component Tests (Story 4.2)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordingConfigSection } from './RecordingConfigSection';
import { useRecordingStore } from '@/stores/recordingStore';

describe('RecordingConfigSection', () => {
  // Store the initial store state to restore after each test
  const initialFrameRate = useRecordingStore.getState().frameRate;
  const initialResolution = useRecordingStore.getState().resolution;

  beforeEach(() => {
    // Reset store to default values before each test
    useRecordingStore.setState({
      frameRate: 30,
      resolution: '1080p',
    });
  });

  afterEach(() => {
    // Restore original state after each test
    useRecordingStore.setState({
      frameRate: initialFrameRate,
      resolution: initialResolution,
    });
  });

  it('should render collapsed by default', () => {
    render(<RecordingConfigSection />);

    expect(screen.getByText('Recording Quality Settings')).toBeInTheDocument();
    expect(screen.queryByText('Frame Rate')).not.toBeInTheDocument();
  });

  it('should expand when header is clicked', async () => {
    const user = userEvent.setup();
    render(<RecordingConfigSection />);

    const header = screen.getByText('Recording Quality Settings');
    await user.click(header);

    expect(screen.getByText('Frame Rate')).toBeInTheDocument();
    expect(screen.getByText('Resolution')).toBeInTheDocument();
    expect(screen.getByText('Estimated File Size')).toBeInTheDocument();
  });

  it('should display file size estimate for default configuration', async () => {
    const user = userEvent.setup();
    render(<RecordingConfigSection />);

    await user.click(screen.getByText('Recording Quality Settings'));

    // 1080p @ 30 FPS = 5 MB/min
    expect(screen.getByText('~5 MB/min')).toBeInTheDocument();
  });

  it('should display correct file size estimate for 60 FPS', async () => {
    // Set store state for this test
    useRecordingStore.setState({
      frameRate: 60,
      resolution: '1080p',
    });

    const user = userEvent.setup();
    render(<RecordingConfigSection />);

    await user.click(screen.getByText('Recording Quality Settings'));

    // 1080p @ 60 FPS = 8 MB/min
    expect(screen.getByText('~8 MB/min')).toBeInTheDocument();
  });

  it('should display correct file size estimate for 720p', async () => {
    // Set store state for this test
    useRecordingStore.setState({
      frameRate: 30,
      resolution: '720p',
    });

    const user = userEvent.setup();
    render(<RecordingConfigSection />);

    await user.click(screen.getByText('Recording Quality Settings'));

    // 720p @ 30 FPS = 3 MB/min
    expect(screen.getByText('~3 MB/min')).toBeInTheDocument();
  });

  it('should show frame rate descriptions', async () => {
    const user = userEvent.setup();
    render(<RecordingConfigSection />);

    await user.click(screen.getByText('Recording Quality Settings'));

    // Should show description for 30 FPS
    expect(screen.getByText('Good for tutorials and screencasts')).toBeInTheDocument();
  });

  it('should show resolution descriptions', async () => {
    const user = userEvent.setup();
    render(<RecordingConfigSection />);

    await user.click(screen.getByText('Recording Quality Settings'));

    // Should show description for 1080p
    expect(screen.getByText('Most common output format, good balance')).toBeInTheDocument();
  });

  it('should toggle collapsed state when clicked multiple times', async () => {
    const user = userEvent.setup();
    render(<RecordingConfigSection />);

    const header = screen.getByText('Recording Quality Settings');

    // Expand
    await user.click(header);
    expect(screen.getByText('Frame Rate')).toBeInTheDocument();

    // Collapse
    await user.click(header);
    expect(screen.queryByText('Frame Rate')).not.toBeInTheDocument();

    // Expand again
    await user.click(header);
    expect(screen.getByText('Frame Rate')).toBeInTheDocument();
  });
});
