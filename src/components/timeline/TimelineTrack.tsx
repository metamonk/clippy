import React from 'react';
import { Group, Line, Rect } from 'react-konva';
import type { Track } from '@/types/timeline';
import { TIMELINE_DEFAULTS } from '@/types/timeline';
import { TimelineClip } from './TimelineClip';

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
  return (
    <Group y={yPosition}>
      {/* Track background */}
      <Rect x={0} y={0} width={width} height={trackHeight} fill="#1a1a1a" />

      {/* Track border (bottom) */}
      <Line points={[0, trackHeight, width, trackHeight]} stroke="#333333" strokeWidth={1} />

      {/* Render all clips on this track */}
      {track.clips.map((clip) => (
        <TimelineClip
          key={clip.id}
          clip={clip}
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
