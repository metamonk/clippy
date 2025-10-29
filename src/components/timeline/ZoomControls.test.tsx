import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZoomControls } from './ZoomControls';
import { useTimelineStore } from '@/stores/timelineStore';

describe('ZoomControls', () => {
  beforeEach(() => {
    // Reset store to clean state
    useTimelineStore.setState({
      tracks: [
        {
          id: 'track-1',
          trackNumber: 1,
          clips: [],
          trackType: 'video',
        },
      ],
      totalDuration: 0,
      viewConfig: {
        pixelsPerSecond: 50,
        trackHeight: 80,
        rulerHeight: 30,
        zoomLevel: 1.0,
      },
      history: [],
      historyIndex: -1,
      selectedClipId: null,
      hoveredTrackState: null,
    });
  });

  it('renders zoom controls with default zoom level', () => {
    render(<ZoomControls />);

    // Should show 100% (1.0x zoom)
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('displays zoom level percentage correctly', () => {
    // Set zoom to 2.5x
    useTimelineStore.setState({
      viewConfig: {
        ...useTimelineStore.getState().viewConfig,
        zoomLevel: 2.5,
      },
    });

    render(<ZoomControls />);

    // Should show 250%
    expect(screen.getByText('250%')).toBeInTheDocument();
  });

  it('displays zoom level percentage for fractional zoom', () => {
    // Set zoom to 0.5x
    useTimelineStore.setState({
      viewConfig: {
        ...useTimelineStore.getState().viewConfig,
        zoomLevel: 0.5,
      },
    });

    render(<ZoomControls />);

    // Should show 50%
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders zoom in button', () => {
    render(<ZoomControls />);

    const zoomInButton = screen.getByTitle('Zoom in (Cmd+=)');
    expect(zoomInButton).toBeInTheDocument();
  });

  it('renders zoom out button', () => {
    render(<ZoomControls />);

    const zoomOutButton = screen.getByTitle('Zoom out (Cmd+-)');
    expect(zoomOutButton).toBeInTheDocument();
  });

  it('renders fit to window button', () => {
    render(<ZoomControls />);

    const fitButton = screen.getByTitle('Fit timeline to window');
    expect(fitButton).toBeInTheDocument();
  });

  it('calls zoomIn action when zoom in button is clicked', async () => {
    const user = userEvent.setup();
    render(<ZoomControls />);

    const initialZoom = useTimelineStore.getState().viewConfig.zoomLevel;
    expect(initialZoom).toBe(1.0);

    const zoomInButton = screen.getByTitle('Zoom in (Cmd+=)');
    await user.click(zoomInButton);

    const newZoom = useTimelineStore.getState().viewConfig.zoomLevel;
    expect(newZoom).toBeCloseTo(1.2, 5);
  });

  it('calls zoomOut action when zoom out button is clicked', async () => {
    const user = userEvent.setup();

    // Set initial zoom to 2.0x
    useTimelineStore.setState({
      viewConfig: {
        ...useTimelineStore.getState().viewConfig,
        zoomLevel: 2.0,
      },
    });

    render(<ZoomControls />);

    const zoomOutButton = screen.getByTitle('Zoom out (Cmd+-)');
    await user.click(zoomOutButton);

    const newZoom = useTimelineStore.getState().viewConfig.zoomLevel;
    expect(newZoom).toBeCloseTo(1.667, 2); // 2.0 / 1.2
  });

  it('updates zoom level display after zoom in', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ZoomControls />);

    const zoomInButton = screen.getByTitle('Zoom in (Cmd+=)');
    await user.click(zoomInButton);

    // Re-render to see updated zoom level
    rerender(<ZoomControls />);

    // Should show ~120%
    expect(screen.getByText('120%')).toBeInTheDocument();
  });

  it('fits timeline to window when no clips', async () => {
    const user = userEvent.setup();
    render(<ZoomControls />);

    const fitButton = screen.getByTitle('Fit timeline to window');
    await user.click(fitButton);

    // Should default to 1.0x zoom when no clips
    const newZoom = useTimelineStore.getState().viewConfig.zoomLevel;
    expect(newZoom).toBe(1.0);
  });

  it('calculates fit-to-window zoom level when clips exist', async () => {
    const user = userEvent.setup();

    // Add a 30-second clip
    const trackId = useTimelineStore.getState().tracks[0]?.id;
    if (trackId) {
      useTimelineStore.getState().addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 30000,
        trimIn: 0,
        trimOut: 30000,
      });
    }

    render(<ZoomControls />);

    const fitButton = screen.getByTitle('Fit timeline to window');
    await user.click(fitButton);

    const newZoom = useTimelineStore.getState().viewConfig.zoomLevel;

    // Container width = 1200px, clip duration = 30s
    // Required pixels per second = 1200 / 30 = 40 px/s
    // Zoom level = 40 / 100 (BASE_PIXELS_PER_SECOND) = 0.4x
    expect(newZoom).toBeCloseTo(0.4, 2);
  });

  it('renders zoom slider with correct range', () => {
    render(<ZoomControls />);

    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();

    // Check min/max attributes
    expect(slider).toHaveAttribute('aria-valuemin', '0.1');
    expect(slider).toHaveAttribute('aria-valuemax', '10');
  });

  it('displays correct zoom percentage at minimum zoom (0.1x)', () => {
    useTimelineStore.setState({
      viewConfig: {
        ...useTimelineStore.getState().viewConfig,
        zoomLevel: 0.1,
      },
    });

    render(<ZoomControls />);

    expect(screen.getByText('10%')).toBeInTheDocument();
  });

  it('displays correct zoom percentage at maximum zoom (10.0x)', () => {
    useTimelineStore.setState({
      viewConfig: {
        ...useTimelineStore.getState().viewConfig,
        zoomLevel: 10.0,
      },
    });

    render(<ZoomControls />);

    expect(screen.getByText('1000%')).toBeInTheDocument();
  });

  it('multiple zoom in clicks increase zoom level progressively', async () => {
    const user = userEvent.setup();
    render(<ZoomControls />);

    const zoomInButton = screen.getByTitle('Zoom in (Cmd+=)');

    // Initial zoom: 1.0x
    expect(useTimelineStore.getState().viewConfig.zoomLevel).toBe(1.0);

    // First click: 1.2x
    await user.click(zoomInButton);
    expect(useTimelineStore.getState().viewConfig.zoomLevel).toBeCloseTo(1.2, 5);

    // Second click: 1.44x
    await user.click(zoomInButton);
    expect(useTimelineStore.getState().viewConfig.zoomLevel).toBeCloseTo(1.44, 5);
  });

  it('handles fit-to-window with multiple clips across tracks', async () => {
    const user = userEvent.setup();

    // Add second track
    useTimelineStore.getState().addTrack('video');

    const trackIds = useTimelineStore.getState().tracks.map((t) => t.id);

    // Add clip to track 1 ending at 20s
    if (trackIds[0]) {
      useTimelineStore.getState().addClip(trackIds[0], {
        filePath: '/path/to/video1.mp4',
        startTime: 0,
        duration: 20000,
        trimIn: 0,
        trimOut: 20000,
      });
    }

    // Add clip to track 2 ending at 40s (longer)
    if (trackIds[1]) {
      useTimelineStore.getState().addClip(trackIds[1], {
        filePath: '/path/to/video2.mp4',
        startTime: 0,
        duration: 40000,
        trimIn: 0,
        trimOut: 40000,
      });
    }

    render(<ZoomControls />);

    const fitButton = screen.getByTitle('Fit timeline to window');
    await user.click(fitButton);

    const newZoom = useTimelineStore.getState().viewConfig.zoomLevel;

    // Should fit to longest clip (40s)
    // Container width = 1200px, max duration = 40s
    // Required pixels per second = 1200 / 40 = 30 px/s
    // Zoom level = 30 / 100 = 0.3x
    expect(newZoom).toBeCloseTo(0.3, 2);
  });
});
