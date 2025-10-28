import React, { useState, useRef } from 'react';
import { Group, Rect, Text } from 'react-konva';
import type { Clip } from '@/types/timeline';
import { calculateClipPosition, formatTimeSimple } from '@/lib/timeline/timeUtils';
import { TIMELINE_DEFAULTS } from '@/types/timeline';
import { useTimelineStore } from '@/stores/timelineStore';

interface TimelineClipProps {
  clip: Clip;
  trackHeight?: number;
  pixelsPerSecond?: number;
  yPosition: number;
  onSelect?: (clipId: string) => void;
  isSelected?: boolean;
}

/**
 * TimelineClip Component
 *
 * Renders a single clip on the timeline with trim handles for adjusting in/out points.
 * Clips are positioned based on their startTime and rendered with their duration.
 * Trim handles allow dragging to adjust trimIn/trimOut values.
 *
 * @param clip - The clip data to render
 * @param trackHeight - Height of the track (default: TIMELINE_DEFAULTS.TRACK_HEIGHT)
 * @param pixelsPerSecond - Zoom level (default: TIMELINE_DEFAULTS.PIXELS_PER_SECOND)
 * @param yPosition - Vertical position on the timeline
 * @param onSelect - Callback when clip is clicked
 * @param isSelected - Whether this clip is currently selected
 */
export const TimelineClip: React.FC<TimelineClipProps> = ({
  clip,
  trackHeight = TIMELINE_DEFAULTS.TRACK_HEIGHT,
  pixelsPerSecond = TIMELINE_DEFAULTS.PIXELS_PER_SECOND,
  yPosition,
  onSelect,
  isSelected = false,
}) => {
  const { updateClip, setSelectedClip } = useTimelineStore();

  // Handle clip selection
  const handleClipClick = () => {
    setSelectedClip(clip.id);
    onSelect?.(clip.id);
  };

  // Hover states for trim handles
  const [leftHandleHover, setLeftHandleHover] = useState(false);
  const [rightHandleHover, setRightHandleHover] = useState(false);

  // Track dragging state
  const dragStateRef = useRef<{
    isDragging: boolean;
    handle: 'left' | 'right' | null;
    startX: number;
    startTrimIn: number;
    startTrimOut: number;
  }>({
    isDragging: false,
    handle: null,
    startX: 0,
    startTrimIn: 0,
    startTrimOut: 0,
  });

  // Calculate visual duration (trimmed duration)
  const visualDuration = clip.trimOut - clip.trimIn;

  // Calculate position and width
  const { x, width } = calculateClipPosition(clip.startTime, visualDuration, pixelsPerSecond);

  // Calculate trimmed region widths
  const leftTrimWidth = (clip.trimIn * pixelsPerSecond) / 1000;
  const rightTrimWidth = ((clip.duration - clip.trimOut) * pixelsPerSecond) / 1000;

  // Extract filename from path
  const filename = clip.filePath.split('/').pop() || 'Unknown';

  // Clip visual properties
  const clipPadding = 4;
  const clipInnerHeight = trackHeight - clipPadding * 2;
  const handleWidth = 6;
  const handleColor = '#ffffff';
  const handleHoverColor = '#66aaff';

  // Colors
  const fillColor = isSelected ? '#5588ff' : '#4a4a4a';
  const strokeColor = isSelected ? '#ffffff' : '#666666';
  const textColor = '#ffffff';
  const trimmedRegionColor = '#2a2a2a';

  // Drag handlers for left trim handle
  const handleLeftTrimDragStart = (e: any) => {
    e.cancelBubble = true;
    dragStateRef.current = {
      isDragging: true,
      handle: 'left',
      startX: e.evt.clientX,
      startTrimIn: clip.trimIn,
      startTrimOut: clip.trimOut,
    };
  };

  const handleLeftTrimDragMove = (e: any) => {
    if (!dragStateRef.current.isDragging || dragStateRef.current.handle !== 'left') return;

    const deltaX = e.evt.clientX - dragStateRef.current.startX;
    const deltaTime = (deltaX / pixelsPerSecond) * 1000; // Convert pixels to milliseconds

    let newTrimIn = dragStateRef.current.startTrimIn + deltaTime;

    // Constrain: trimIn must be >= 0 and < trimOut (leave at least 100ms)
    newTrimIn = Math.max(0, newTrimIn);
    newTrimIn = Math.min(clip.trimOut - 100, newTrimIn);

    updateClip(clip.id, { trimIn: newTrimIn });
  };

  const handleLeftTrimDragEnd = () => {
    dragStateRef.current.isDragging = false;
    dragStateRef.current.handle = null;
  };

  // Drag handlers for right trim handle
  const handleRightTrimDragStart = (e: any) => {
    e.cancelBubble = true;
    dragStateRef.current = {
      isDragging: true,
      handle: 'right',
      startX: e.evt.clientX,
      startTrimIn: clip.trimIn,
      startTrimOut: clip.trimOut,
    };
  };

  const handleRightTrimDragMove = (e: any) => {
    if (!dragStateRef.current.isDragging || dragStateRef.current.handle !== 'right') return;

    const deltaX = e.evt.clientX - dragStateRef.current.startX;
    const deltaTime = (deltaX / pixelsPerSecond) * 1000; // Convert pixels to milliseconds

    let newTrimOut = dragStateRef.current.startTrimOut + deltaTime;

    // Constrain: trimOut must be <= duration and > trimIn (leave at least 100ms)
    newTrimOut = Math.min(clip.duration, newTrimOut);
    newTrimOut = Math.max(clip.trimIn + 100, newTrimOut);

    updateClip(clip.id, { trimOut: newTrimOut });
  };

  const handleRightTrimDragEnd = () => {
    dragStateRef.current.isDragging = false;
    dragStateRef.current.handle = null;
  };

  return (
    <Group x={x - leftTrimWidth} y={yPosition}>
      {/* Left trimmed region overlay (if trimmed) */}
      {clip.trimIn > 0 && (
        <Rect
          x={0}
          y={clipPadding}
          width={leftTrimWidth}
          height={clipInnerHeight}
          fill={trimmedRegionColor}
          opacity={0.6}
        />
      )}

      {/* Clip background rectangle (visible/active portion) */}
      <Rect
        x={leftTrimWidth}
        y={clipPadding}
        width={width}
        height={clipInnerHeight}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={4}
        onClick={handleClipClick}
        onTap={handleClipClick}
      />

      {/* Right trimmed region overlay (if trimmed) */}
      {clip.trimOut < clip.duration && (
        <Rect
          x={leftTrimWidth + width}
          y={clipPadding}
          width={rightTrimWidth}
          height={clipInnerHeight}
          fill={trimmedRegionColor}
          opacity={0.6}
        />
      )}

      {/* Left trim handle (only show when selected) */}
      {isSelected && (
        <Rect
          x={leftTrimWidth}
          y={clipPadding}
          width={handleWidth}
          height={clipInnerHeight}
          fill={leftHandleHover ? handleHoverColor : handleColor}
          cornerRadius={[4, 0, 0, 4]}
          draggable
          onDragStart={handleLeftTrimDragStart}
          onDragMove={handleLeftTrimDragMove}
          onDragEnd={handleLeftTrimDragEnd}
          onMouseEnter={() => setLeftHandleHover(true)}
          onMouseLeave={() => setLeftHandleHover(false)}
          cursor="ew-resize"
        />
      )}

      {/* Right trim handle (only show when selected) */}
      {isSelected && (
        <Rect
          x={leftTrimWidth + width - handleWidth}
          y={clipPadding}
          width={handleWidth}
          height={clipInnerHeight}
          fill={rightHandleHover ? handleHoverColor : handleColor}
          cornerRadius={[0, 4, 4, 0]}
          draggable
          onDragStart={handleRightTrimDragStart}
          onDragMove={handleRightTrimDragMove}
          onDragEnd={handleRightTrimDragEnd}
          onMouseEnter={() => setRightHandleHover(true)}
          onMouseLeave={() => setRightHandleHover(false)}
          cursor="ew-resize"
        />
      )}

      {/* Filename text (only show if width is sufficient) */}
      {width > 60 && (
        <Text
          x={leftTrimWidth + 8}
          y={clipPadding + 8}
          text={filename}
          fontSize={12}
          fill={textColor}
          fontFamily="Arial"
          width={width - 16}
          ellipsis={true}
        />
      )}

      {/* Duration text (only show if width is sufficient) */}
      {width > 60 && (
        <Text
          x={leftTrimWidth + 8}
          y={clipPadding + clipInnerHeight - 20}
          text={formatTimeSimple(visualDuration)}
          fontSize={10}
          fill={textColor}
          fontFamily="monospace"
          opacity={0.8}
        />
      )}
    </Group>
  );
};
