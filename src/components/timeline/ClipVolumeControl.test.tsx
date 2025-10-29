import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ClipVolumeControl } from './ClipVolumeControl';
import { useTimelineStore } from '@/stores/timelineStore';

describe('ClipVolumeControl (Story 3.9)', () => {
  beforeEach(() => {
    // Reset store
    useTimelineStore.setState({
      tracks: [
        {
          id: 'track-1',
          trackNumber: 1,
          clips: [],
          trackType: 'video',
          label: 'Track 1',
        },
      ],
      totalDuration: 0,
      viewConfig: {
        pixelsPerSecond: 50,
        trackHeight: 80,
        rulerHeight: 30,
        zoomLevel: 1.0,
        scrollPosition: 0,
      },
      history: [],
      historyIndex: -1,
      selectedClipId: null,
      hoveredTrackState: null,
      snapEnabled: true,
      snapThreshold: 100,
    });
  });

  it('should render volume control for clip', () => {
    const state = useTimelineStore.getState();
    state.addClip('track-1', {
      filePath: '/path/to/video.mp4',
      startTime: 0,
      duration: 10000,
      trimIn: 0,
      trimOut: 10000,
      volume: 100,
      muted: false,
    });

    const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

    render(<ClipVolumeControl clipId={clipId} />);

    // Check that volume percentage is displayed (AC #4)
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('should show muted icon when clip is muted (AC #5)', () => {
    const state = useTimelineStore.getState();
    state.addClip('track-1', {
      filePath: '/path/to/video.mp4',
      startTime: 0,
      duration: 10000,
      trimIn: 0,
      trimOut: 10000,
      volume: 100,
      muted: true,
    });

    const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

    render(<ClipVolumeControl clipId={clipId} />);

    // Check that muted state shows 0%
    expect(screen.getByText('0%')).toBeInTheDocument();

    // Check for mute button with title
    const muteButton = screen.getByTitle('Unmute');
    expect(muteButton).toBeInTheDocument();
  });

  it('should toggle mute state when mute button is clicked', async () => {
    const user = userEvent.setup();
    const state = useTimelineStore.getState();
    state.addClip('track-1', {
      filePath: '/path/to/video.mp4',
      startTime: 0,
      duration: 10000,
      trimIn: 0,
      trimOut: 10000,
      volume: 100,
      muted: false,
    });

    const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

    render(<ClipVolumeControl clipId={clipId} />);

    // Click mute button
    const muteButton = screen.getByTitle('Mute');
    await user.click(muteButton);

    // Check that clip is now muted
    const clip = useTimelineStore.getState().getClip(clipId);
    expect(clip?.muted).toBe(true);
  });

  it('should display volume percentage correctly (AC #1, #4)', () => {
    const state = useTimelineStore.getState();
    state.addClip('track-1', {
      filePath: '/path/to/video.mp4',
      startTime: 0,
      duration: 10000,
      trimIn: 0,
      trimOut: 10000,
      volume: 150,
      muted: false,
    });

    const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

    render(<ClipVolumeControl clipId={clipId} />);

    // Check that 150% volume is displayed
    expect(screen.getByText('150%')).toBeInTheDocument();
  });

  it('should disable slider when clip is muted', () => {
    const state = useTimelineStore.getState();
    state.addClip('track-1', {
      filePath: '/path/to/video.mp4',
      startTime: 0,
      duration: 10000,
      trimIn: 0,
      trimOut: 10000,
      volume: 100,
      muted: true,
    });

    const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

    render(<ClipVolumeControl clipId={clipId} />);

    // Find slider by aria-label - Radix UI uses aria-disabled
    const slider = screen.getByLabelText('Clip volume');
    expect(slider).toHaveAttribute('aria-disabled', 'true');
  });

  it('should return null if clip not found', () => {
    const { container } = render(<ClipVolumeControl clipId="nonexistent-clip" />);
    expect(container.firstChild).toBeNull();
  });
});
