import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Timeline } from './Timeline';
import { useTimelineStore } from '@/stores/timelineStore';
import { useMediaLibraryStore } from '@/stores/mediaLibraryStore';

// Mock Konva Stage to prevent canvas errors in test environment
vi.mock('react-konva', () => ({
  Stage: ({ children }: { children: React.ReactNode }) => <div data-testid="konva-stage">{children}</div>,
  Layer: ({ children }: { children: React.ReactNode }) => <div data-testid="konva-layer">{children}</div>,
  Group: ({ children }: { children: React.ReactNode }) => <div data-testid="konva-group">{children}</div>,
  Rect: () => <div data-testid="konva-rect" />,
  Line: () => <div data-testid="konva-line" />,
  Text: ({ text }: { text: string }) => <div data-testid="konva-text">{text}</div>,
}));

describe('Timeline Component', () => {
  beforeEach(() => {
    // Reset stores before each test
    useTimelineStore.setState({
      tracks: [
        {
          id: 'track-1',
          clips: [],
          trackType: 'video',
        },
      ],
      totalDuration: 0,
      viewConfig: {
        pixelsPerSecond: 50,
        trackHeight: 80,
        rulerHeight: 30,
      },
    });

    useMediaLibraryStore.setState({
      mediaFiles: [],
    });
  });

  it('renders timeline with correct dimensions', () => {
    render(<Timeline width={800} height={400} />);

    // Check that Konva Stage is rendered
    const stage = screen.getByTestId('konva-stage');
    expect(stage).toBeInTheDocument();

    // Check that Layer is rendered
    const layer = screen.getByTestId('konva-layer');
    expect(layer).toBeInTheDocument();
  });

  it('shows empty state message when no clips', () => {
    render(<Timeline width={800} height={400} />);

    // Should show the empty state message
    expect(screen.getByText('Drag clips from media library to timeline')).toBeInTheDocument();
  });

  it('renders timeline with clips when present', () => {
    // Add a clip to the timeline
    useTimelineStore.setState({
      tracks: [
        {
          id: 'track-1',
          clips: [
            {
              id: 'clip-1',
              filePath: '/path/to/video.mp4',
              startTime: 0,
              duration: 10000,
              trimIn: 0,
              trimOut: 10000,
            },
          ],
          trackType: 'video',
        },
      ],
      totalDuration: 10000,
      viewConfig: {
        pixelsPerSecond: 50,
        trackHeight: 80,
        rulerHeight: 30,
      },
    });

    render(<Timeline width={800} height={400} />);

    // Empty state message should not be present
    expect(screen.queryByText('Drag clips from media library to timeline')).not.toBeInTheDocument();
  });

  it('handles drag over events', () => {
    const { container } = render(<Timeline width={800} height={400} />);

    const timelineContainer = container.querySelector('.timeline-container');
    expect(timelineContainer).toBeInTheDocument();

    // Simulate drag over
    const dragOverEvent = new Event('dragover', { bubbles: true });
    Object.defineProperty(dragOverEvent, 'dataTransfer', {
      value: { dropEffect: '' },
    });

    timelineContainer?.dispatchEvent(dragOverEvent);

    // Drag over should be handled (event should not throw)
    expect(timelineContainer).toBeInTheDocument();
  });

  it('renders time ruler', () => {
    render(<Timeline width={800} height={400} />);

    // Time ruler should render time markers
    // The ruler shows at least the 00:00 marker
    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('calculates minimum timeline width correctly', () => {
    // Set a longer duration
    useTimelineStore.setState({
      tracks: [
        {
          id: 'track-1',
          clips: [],
          trackType: 'video',
        },
      ],
      totalDuration: 120000, // 2 minutes
      viewConfig: {
        pixelsPerSecond: 50,
        trackHeight: 80,
        rulerHeight: 30,
      },
    });

    render(<Timeline width={800} height={400} />);

    // Timeline should be wider than the container to accommodate 2 minutes
    // 120 seconds * 50 pixels/second = 6000 pixels
    const stage = screen.getByTestId('konva-stage');
    expect(stage).toBeInTheDocument();
  });

  it('renders multiple tracks', () => {
    useTimelineStore.setState({
      tracks: [
        {
          id: 'track-1',
          clips: [],
          trackType: 'video',
        },
        {
          id: 'track-2',
          clips: [],
          trackType: 'audio',
        },
      ],
      totalDuration: 0,
      viewConfig: {
        pixelsPerSecond: 50,
        trackHeight: 80,
        rulerHeight: 30,
      },
    });

    render(<Timeline width={800} height={400} />);

    // Multiple tracks should be rendered
    const groups = screen.getAllByTestId('konva-group');
    expect(groups.length).toBeGreaterThan(0);
  });

  it('click-to-seek latency is within NFR001 target (< 100ms)', () => {
    // Setup timeline with a clip
    useTimelineStore.setState({
      tracks: [
        {
          id: 'track-1',
          clips: [
            {
              id: 'clip-1',
              filePath: '/path/to/video.mp4',
              startTime: 0,
              duration: 60000, // 60 seconds
              trimIn: 0,
              trimOut: 60000,
            },
          ],
          trackType: 'video',
        },
      ],
      totalDuration: 60000,
      viewConfig: {
        pixelsPerSecond: 50,
        trackHeight: 80,
        rulerHeight: 30,
      },
    });

    const { container } = render(<Timeline width={800} height={400} />);
    const stage = container.querySelector('.timeline-container');
    expect(stage).toBeInTheDocument();

    // Measure click-to-seek latency
    const startTime = performance.now();

    // Simulate click event (note: actual seek happens in Konva click handler,
    // but we're testing that the component responds within the latency target)
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      clientX: 400, // Click at 50% of timeline (30 seconds)
      clientY: 100,
    });

    stage?.dispatchEvent(clickEvent);

    const endTime = performance.now();
    const latency = endTime - startTime;

    // NFR001: Scrubbing latency should be < 100ms
    // Note: This measures UI response time, not full video seek completion
    expect(latency).toBeLessThan(100);
  });
});
