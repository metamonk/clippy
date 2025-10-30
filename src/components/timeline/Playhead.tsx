import React, { useRef, useCallback } from 'react';
import { Group, Line, Rect } from 'react-konva';
import { msToPixels, pixelsToMs } from '@/lib/timeline/timeUtils';
import { TIMELINE_DEFAULTS } from '@/types/timeline';
import { usePlayerStore } from '@/stores/playerStore';
import type { KonvaEventObject } from 'konva/lib/Node';

interface PlayheadProps {
  height: number;
  pixelsPerSecond?: number;
}

/**
 * Playhead Component
 *
 * Renders a vertical line indicating the current playback position on the timeline.
 * Synchronized with the playerStore.playheadPosition state.
 * Supports dragging to scrub through the video.
 *
 * @param height - Total height of the playhead line in pixels
 * @param pixelsPerSecond - Zoom level (default: TIMELINE_DEFAULTS.PIXELS_PER_SECOND)
 */
export const Playhead: React.FC<PlayheadProps> = ({
  height,
  pixelsPerSecond = TIMELINE_DEFAULTS.PIXELS_PER_SECOND,
}) => {
  // Subscribe to player store playhead position (in milliseconds)
  const playheadPosition = usePlayerStore((state) => state.playheadPosition);
  const setPlayheadPosition = usePlayerStore((state) => state.setPlayheadPosition);
  const seek = usePlayerStore((state) => state.seek);
  const setFocusContext = usePlayerStore((state) => state.setFocusContext);

  const isDragging = useRef(false);

  // Convert playhead position (ms) to pixel position
  const xPosition = msToPixels(playheadPosition, pixelsPerSecond);

  // Handle drag start
  const handleDragStart = useCallback(() => {
    isDragging.current = true;
    // ADR-007: Switch to timeline mode when interacting with timeline
    setFocusContext('timeline');
  }, [setFocusContext]);

  // Handle drag move - update playhead position during drag
  const handleDragMove = useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      if (!isDragging.current) return;

      const stage = e.target.getStage();
      if (!stage) return;

      // Get the pointer position relative to the stage
      const pointerPosition = stage.getPointerPosition();
      if (!pointerPosition) return;

      // Convert pixel position to milliseconds
      const newPositionMs = Math.max(0, pixelsToMs(pointerPosition.x, pixelsPerSecond));

      // Update playhead position in store
      setPlayheadPosition(newPositionMs);

      // Also seek video player to new position (convert ms to seconds)
      seek(newPositionMs / 1000);
    },
    [pixelsPerSecond, setPlayheadPosition, seek]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <Group
      x={xPosition}
      draggable
      dragBoundFunc={(pos) => {
        // Constrain drag to horizontal axis only
        return {
          x: Math.max(0, pos.x),
          y: 0,
        };
      }}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      {/* Playhead handle (triangle at top) */}
      <Rect
        x={-6}
        y={0}
        width={12}
        height={8}
        fill="#ff4444"
        cornerRadius={2}
        hitStrokeWidth={20}
      />

      {/* Playhead line */}
      <Line
        points={[0, 8, 0, height]}
        stroke="#ff4444"
        strokeWidth={2}
        hitStrokeWidth={10}
      />
    </Group>
  );
};
