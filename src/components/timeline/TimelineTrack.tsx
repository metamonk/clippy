import React from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import type { Track } from '@/types/timeline';
import { TIMELINE_DEFAULTS } from '@/types/timeline';
import { TimelineClip } from './TimelineClip';
import { useTimelineStore } from '@/stores/timelineStore';

interface TimelineTrackProps {
  track: Track;
  yPosition: number;
  width: number;
  trackHeight?: number;
  pixelsPerSecond?: number;
  selectedClipId?: string;
  onClipSelect?: (clipId: string) => void;
}

/**
 * TimelineTrack Component
 *
 * Renders a single track on the timeline, including all clips on that track.
 * Provides a visual container for clips with a background and border.
 *
 * @param track - The track data containing clips
 * @param yPosition - Vertical position of the track
 * @param width - Width of the track in pixels
 * @param trackHeight - Height of the track (default: TIMELINE_DEFAULTS.TRACK_HEIGHT)
 * @param pixelsPerSecond - Zoom level (default: TIMELINE_DEFAULTS.PIXELS_PER_SECOND)
 * @param selectedClipId - ID of the currently selected clip
 * @param onClipSelect - Callback when a clip is selected
 */
export const TimelineTrack: React.FC<TimelineTrackProps> = ({
  track,
  yPosition,
  width,
  trackHeight = TIMELINE_DEFAULTS.TRACK_HEIGHT,
  pixelsPerSecond = TIMELINE_DEFAULTS.PIXELS_PER_SECOND,
  selectedClipId,
  onClipSelect,
}) => {
  // Story 3.3: Subscribe to hover state for visual feedback
  const hoveredTrackState = useTimelineStore((state) => state.hoveredTrackState);
  const isHovered = hoveredTrackState?.trackId === track.id;
  const canDrop = hoveredTrackState?.canDrop ?? false;

  // Visual feedback colors
  const backgroundColor = isHovered ? (canDrop ? '#fef3c7' : '#fee2e2') : '#1a1a1a';
  const borderColor = isHovered ? (canDrop ? '#f59e0b' : '#ef4444') : '#333333';
  const borderWidth = isHovered ? 3 : 1;

  return (
    <Group y={yPosition}>
      {/* Track background with hover feedback */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={trackHeight}
        fill={backgroundColor}
        stroke={borderColor}
        strokeWidth={borderWidth}
      />

      {/* Story 3.1 AC#6: Track label to identify each track */}
      <Text
        x={8}
        y={8}
        text={`Track ${track.trackNumber}`}
        fill="#888888"
        fontSize={11}
        fontFamily="Arial"
        fontStyle="bold"
        listening={false}
      />

      {/* Track border (bottom) */}
      <Line points={[0, trackHeight, width, trackHeight]} stroke={borderColor} strokeWidth={1} />

      {/* Drop zone indicator text (Story 3.3 AC#2) */}
      {isHovered && canDrop && (
        <Text
          x={10}
          y={trackHeight / 2 - 8}
          text="Drop here"
          fill="#f59e0b"
          fontSize={14}
          fontFamily="Arial"
          fontStyle="bold"
          listening={false}
        />
      )}

      {/* Cannot drop indicator text (Story 3.3 Review M-1) */}
      {isHovered && !canDrop && (
        <Text
          x={10}
          y={trackHeight / 2 - 8}
          text="Cannot drop here (collision)"
          fill="#ef4444"
          fontSize={14}
          fontFamily="Arial"
          fontStyle="bold"
          listening={false}
        />
      )}

      {/* Render all clips on this track */}
      {track.clips.map((clip) => (
        <TimelineClip
          key={clip.id}
          clip={clip}
          trackId={track.id}
          trackHeight={trackHeight}
          pixelsPerSecond={pixelsPerSecond}
          yPosition={0}
          onSelect={onClipSelect}
          isSelected={clip.id === selectedClipId}
        />
      ))}
    </Group>
  );
};
