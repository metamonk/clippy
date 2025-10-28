import React from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import { generateTimeMarkers } from '@/lib/timeline/timeUtils';
import { TIMELINE_DEFAULTS } from '@/types/timeline';

interface TimeRulerProps {
  width: number;
  height?: number;
  durationMs: number;
  pixelsPerSecond?: number;
  intervalSeconds?: number;
}

/**
 * TimeRuler Component
 *
 * Renders a time ruler with second markers and labels at the top of the timeline.
 * Shows time in MM:SS format at regular intervals.
 *
 * @param width - Width of the ruler in pixels
 * @param height - Height of the ruler in pixels (default: TIMELINE_DEFAULTS.RULER_HEIGHT)
 * @param durationMs - Total timeline duration in milliseconds
 * @param pixelsPerSecond - Zoom level (default: TIMELINE_DEFAULTS.PIXELS_PER_SECOND)
 * @param intervalSeconds - Interval between markers in seconds (default: 10)
 */
export const TimeRuler: React.FC<TimeRulerProps> = ({
  width,
  height = TIMELINE_DEFAULTS.RULER_HEIGHT,
  durationMs,
  pixelsPerSecond = TIMELINE_DEFAULTS.PIXELS_PER_SECOND,
  intervalSeconds = 10,
}) => {
  const markers = generateTimeMarkers(durationMs, pixelsPerSecond, intervalSeconds);

  return (
    <Group>
      {/* Ruler background */}
      <Rect x={0} y={0} width={width} height={height} fill="#2a2a2a" />

      {/* Bottom border line */}
      <Line points={[0, height, width, height]} stroke="#404040" strokeWidth={1} />

      {/* Time markers */}
      {markers.map((marker) => (
        <Group key={marker.time}>
          {/* Marker tick */}
          <Line
            points={[marker.position, height - 10, marker.position, height]}
            stroke="#888888"
            strokeWidth={1}
          />

          {/* Time label */}
          <Text
            x={marker.position + 4}
            y={4}
            text={marker.label}
            fontSize={11}
            fill="#cccccc"
            fontFamily="monospace"
          />
        </Group>
      ))}
    </Group>
  );
};
