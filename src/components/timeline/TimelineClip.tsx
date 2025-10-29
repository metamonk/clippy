import React, { useState, useRef } from 'react';
import { Group, Rect, Text, Line } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Clip } from '@/types/timeline';
import { calculateClipPosition, formatTimeSimple } from '@/lib/timeline/timeUtils';
import { TIMELINE_DEFAULTS } from '@/types/timeline';
import { useTimelineStore } from '@/stores/timelineStore';
import { validateFadeDuration } from '@/lib/timeline/clipOperations';

// Story 3.3: Vertical drag threshold ratio for determining inter-track moves
const VERTICAL_DRAG_THRESHOLD_RATIO = 0.5;

interface TimelineClipProps {
  clip: Clip;
  trackId: string; // Story 3.3: Track ID for inter-track dragging
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
  trackId,
  trackHeight = TIMELINE_DEFAULTS.TRACK_HEIGHT,
  pixelsPerSecond = TIMELINE_DEFAULTS.PIXELS_PER_SECOND,
  yPosition,
  onSelect,
  isSelected = false,
}) => {
  const { updateClip, setSelectedClip, moveClip, moveClipToTrack, setHoveredTrack, tracks, setClipFadeIn, setClipFadeOut } = useTimelineStore();

  // Handle clip selection
  const handleClipClick = () => {
    setSelectedClip(clip.id);
    onSelect?.(clip.id);
  };

  // Hover states for trim handles
  const [leftHandleHover, setLeftHandleHover] = useState(false);
  const [rightHandleHover, setRightHandleHover] = useState(false);

  // Story 3.10: Hover states for fade handles
  const [leftFadeHandleHover, setLeftFadeHandleHover] = useState(false);
  const [rightFadeHandleHover, setRightFadeHandleHover] = useState(false);

  // Track dragging state for trim handles
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

  // Story 3.3: Track repositioning drag state (separate from trim)
  const repositionDragRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    originalStartTime: number;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    originalStartTime: 0,
  });

  // Story 3.10: Track fade handle dragging state
  const fadeDragStateRef = useRef<{
    isDragging: boolean;
    handle: 'left' | 'right' | null;
    startX: number;
    startFadeIn: number;
    startFadeOut: number;
  }>({
    isDragging: false,
    handle: null,
    startX: 0,
    startFadeIn: 0,
    startFadeOut: 0,
  });

  // Calculate visual duration (trimmed duration)
  const visualDuration = clip.trimOut - clip.trimIn;

  // When trimming from the left, the visible portion should start later on the timeline
  // Adjust the timeline position by the trimIn amount
  const adjustedStartTime = clip.startTime + clip.trimIn;

  // Calculate position and width based on the VISIBLE portion
  const { x, width } = calculateClipPosition(adjustedStartTime, visualDuration, pixelsPerSecond);

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
  // const trimmedRegionColor = '#2a2a2a'; // TODO: Use for visual trim regions

  // Mouse event handlers for trim handles (using window-level tracking)
  const handleLeftTrimMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;

    dragStateRef.current = {
      isDragging: true,
      handle: 'left',
      startX: e.evt.clientX,
      startTrimIn: clip.trimIn,
      startTrimOut: clip.trimOut,
    };

    // Add window-level mouse move and mouse up listeners
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStateRef.current.isDragging || dragStateRef.current.handle !== 'left') return;

      const deltaX = moveEvent.clientX - dragStateRef.current.startX;
      const deltaTime = (deltaX / pixelsPerSecond) * 1000; // Convert pixels to milliseconds

      let newTrimIn = dragStateRef.current.startTrimIn + deltaTime;

      // Constrain: trimIn must be >= 0 and < trimOut (leave at least 100ms)
      newTrimIn = Math.max(0, newTrimIn);
      newTrimIn = Math.min(dragStateRef.current.startTrimOut - 100, newTrimIn);

      updateClip(clip.id, { trimIn: newTrimIn });
    };

    const handleMouseUp = () => {
      dragStateRef.current.isDragging = false;
      dragStateRef.current.handle = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleRightTrimMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;

    dragStateRef.current = {
      isDragging: true,
      handle: 'right',
      startX: e.evt.clientX,
      startTrimIn: clip.trimIn,
      startTrimOut: clip.trimOut,
    };

    // Add window-level mouse move and mouse up listeners
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStateRef.current.isDragging || dragStateRef.current.handle !== 'right') return;

      const deltaX = moveEvent.clientX - dragStateRef.current.startX;
      const deltaTime = (deltaX / pixelsPerSecond) * 1000; // Convert pixels to milliseconds

      let newTrimOut = dragStateRef.current.startTrimOut + deltaTime;

      // Constrain: trimOut must be <= duration and > trimIn (leave at least 100ms)
      newTrimOut = Math.min(clip.duration, newTrimOut);
      newTrimOut = Math.max(dragStateRef.current.startTrimIn + 100, newTrimOut);

      updateClip(clip.id, { trimOut: newTrimOut });
    };

    const handleMouseUp = () => {
      dragStateRef.current.isDragging = false;
      dragStateRef.current.handle = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Story 3.3: Clip repositioning drag handlers (horizontal + vertical)
  const handleClipMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    // Don't start reposition drag if clicking on trim handles
    if (dragStateRef.current.isDragging) return;

    e.cancelBubble = true;

    repositionDragRef.current = {
      isDragging: true,
      startX: e.evt.clientX,
      startY: e.evt.clientY,
      originalStartTime: clip.startTime,
    };

    // Add window-level mouse move and mouse up listeners
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!repositionDragRef.current.isDragging) return;

      // Calculate which track is being hovered based on Y position
      const targetTrackIndex = Math.floor((moveEvent.clientY - yPosition) / trackHeight);
      const targetTrack = tracks[targetTrackIndex];

      if (targetTrack && targetTrack.id !== trackId) {
        // Inter-track hover detected - check for collision
        const clipDuration = clip.trimOut - clip.trimIn;
        const clipEnd = clip.startTime + clipDuration;

        const hasCollision = targetTrack.clips.some((existingClip) => {
          const existingEnd = existingClip.startTime + (existingClip.trimOut - existingClip.trimIn);
          return !(clipEnd <= existingClip.startTime || clip.startTime >= existingEnd);
        });

        // Update hover state with collision info (Story 3.3 Review M-1)
        setHoveredTrack({ trackId: targetTrack.id, canDrop: !hasCollision });
      } else {
        // Clear hover state when not over a different track
        setHoveredTrack(null);
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      if (!repositionDragRef.current.isDragging) {
        return;
      }

      repositionDragRef.current.isDragging = false;

      const deltaX = upEvent.clientX - repositionDragRef.current.startX;
      const deltaY = upEvent.clientY - repositionDragRef.current.startY;

      // Clear hover state
      setHoveredTrack(null);

      // Determine if this is a vertical drag (inter-track) or horizontal drag (reposition)
      const isVerticalDrag = Math.abs(deltaY) > trackHeight * VERTICAL_DRAG_THRESHOLD_RATIO;

      if (isVerticalDrag) {
        // Inter-track move detected
        const targetTrackIndex = Math.floor((upEvent.clientY - yPosition) / trackHeight);
        const targetTrack = tracks[targetTrackIndex];

        if (targetTrack && targetTrack.id !== trackId) {
          const success = moveClipToTrack(clip.id, targetTrack.id);

          // Story 3.3 Review M-2: If inter-track move fails, preserve horizontal movement
          if (!success && Math.abs(deltaX) > 5) {
            const deltaTime = (deltaX / pixelsPerSecond) * 1000;
            const newStartTime = Math.max(0, repositionDragRef.current.originalStartTime + deltaTime);
            moveClip(clip.id, newStartTime, true); // Record history on successful horizontal move
          }
        }
      } else if (Math.abs(deltaX) > 5) {
        // Horizontal repositioning only
        const deltaTime = (deltaX / pixelsPerSecond) * 1000;
        const newStartTime = Math.max(0, repositionDragRef.current.originalStartTime + deltaTime);
        moveClip(clip.id, newStartTime, true); // Story 3.3 Review H-1: Record history only on drag completion
      }

      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Story 3.10: Fade-in handle drag handlers
  const handleLeftFadeMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;

    fadeDragStateRef.current = {
      isDragging: true,
      handle: 'left',
      startX: e.evt.clientX,
      startFadeIn: clip.fadeIn ?? 0,
      startFadeOut: clip.fadeOut ?? 0,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!fadeDragStateRef.current.isDragging || fadeDragStateRef.current.handle !== 'left') return;

      const deltaX = moveEvent.clientX - fadeDragStateRef.current.startX;
      const deltaTime = (deltaX / pixelsPerSecond) * 1000; // Convert pixels to milliseconds

      let newFadeIn = fadeDragStateRef.current.startFadeIn + deltaTime;

      // Constrain: fadeIn must be >= 0 and <= visualDuration
      newFadeIn = Math.max(0, newFadeIn);
      newFadeIn = Math.min(visualDuration, newFadeIn);

      // Validate combined fade durations don't exceed clip duration
      if (validateFadeDuration(clip, newFadeIn, fadeDragStateRef.current.startFadeOut)) {
        setClipFadeIn(clip.id, newFadeIn);
      }
    };

    const handleMouseUp = () => {
      fadeDragStateRef.current.isDragging = false;
      fadeDragStateRef.current.handle = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Story 3.10: Fade-out handle drag handlers
  const handleRightFadeMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;

    fadeDragStateRef.current = {
      isDragging: true,
      handle: 'right',
      startX: e.evt.clientX,
      startFadeIn: clip.fadeIn ?? 0,
      startFadeOut: clip.fadeOut ?? 0,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!fadeDragStateRef.current.isDragging || fadeDragStateRef.current.handle !== 'right') return;

      const deltaX = moveEvent.clientX - fadeDragStateRef.current.startX;
      const deltaTime = -(deltaX / pixelsPerSecond) * 1000; // Negative because dragging left increases fade-out

      let newFadeOut = fadeDragStateRef.current.startFadeOut + deltaTime;

      // Constrain: fadeOut must be >= 0 and <= visualDuration
      newFadeOut = Math.max(0, newFadeOut);
      newFadeOut = Math.min(visualDuration, newFadeOut);

      // Validate combined fade durations don't exceed clip duration
      if (validateFadeDuration(clip, fadeDragStateRef.current.startFadeIn, newFadeOut)) {
        setClipFadeOut(clip.id, newFadeOut);
      }
    };

    const handleMouseUp = () => {
      fadeDragStateRef.current.isDragging = false;
      fadeDragStateRef.current.handle = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <Group x={x} y={yPosition}>
      {/* Clip background rectangle (visible portion only) */}
      <Rect
        x={0}
        y={clipPadding}
        width={width}
        height={clipInnerHeight}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={4}
        onClick={handleClipClick}
        onTap={handleClipClick}
        onMouseDown={handleClipMouseDown}
        cursor="move"
      />

      {/* Left trim handle (only show when selected) */}
      {isSelected && (
        <Rect
          x={0}
          y={clipPadding}
          width={handleWidth}
          height={clipInnerHeight}
          fill={leftHandleHover ? handleHoverColor : handleColor}
          cornerRadius={[4, 0, 0, 4]}
          onMouseDown={handleLeftTrimMouseDown}
          onMouseEnter={() => setLeftHandleHover(true)}
          onMouseLeave={() => setLeftHandleHover(false)}
          cursor="ew-resize"
        />
      )}

      {/* Right trim handle (only show when selected) */}
      {isSelected && (
        <Rect
          x={width - handleWidth}
          y={clipPadding}
          width={handleWidth}
          height={clipInnerHeight}
          fill={rightHandleHover ? handleHoverColor : handleColor}
          cornerRadius={[0, 4, 4, 0]}
          onMouseDown={handleRightTrimMouseDown}
          onMouseEnter={() => setRightHandleHover(true)}
          onMouseLeave={() => setRightHandleHover(false)}
          cursor="ew-resize"
        />
      )}

      {/* Filename text (only show if width is sufficient) */}
      {width > 60 && (
        <Text
          x={8}
          y={clipPadding + 8}
          text={filename}
          fontSize={12}
          fill={textColor}
          fontFamily="Arial"
          width={width - 16}
          ellipsis={true}
          listening={false}
        />
      )}

      {/* Duration text (only show if width is sufficient) */}
      {width > 60 && (
        <Text
          x={8}
          y={clipPadding + clipInnerHeight - 20}
          text={formatTimeSimple(visualDuration)}
          fontSize={10}
          fill={textColor}
          fontFamily="monospace"
          opacity={0.8}
          listening={false}
        />
      )}

      {/* Story 3.10: Fade curve overlays (visual representation of fades) */}
      {isSelected && (clip.fadeIn ?? 0) > 0 && (
        <Rect
          x={0}
          y={clipPadding}
          width={Math.min((clip.fadeIn! / 1000) * pixelsPerSecond, width)}
          height={clipInnerHeight}
          fill="rgba(0, 150, 255, 0.15)"
          listening={false}
        />
      )}
      {isSelected && (clip.fadeOut ?? 0) > 0 && (
        <Rect
          x={Math.max(width - (clip.fadeOut! / 1000) * pixelsPerSecond, 0)}
          y={clipPadding}
          width={Math.min((clip.fadeOut! / 1000) * pixelsPerSecond, width)}
          height={clipInnerHeight}
          fill="rgba(0, 150, 255, 0.15)"
          listening={false}
        />
      )}

      {/* Story 3.10: Fade-in handle (triangular, left side) */}
      {isSelected && width > 40 && (
        <Line
          points={[
            handleWidth + 2, // x1: inset from left trim handle
            clipPadding + 4, // y1: top
            handleWidth + 12, // x2: base of triangle
            clipPadding + (clipInnerHeight / 2), // y2: middle
            handleWidth + 2, // x3: back to left
            clipPadding + clipInnerHeight - 4, // y3: bottom
          ]}
          closed={true}
          fill={leftFadeHandleHover ? '#88ccff' : 'rgba(100, 180, 255, 0.8)'}
          stroke={leftFadeHandleHover ? '#ffffff' : 'rgba(255, 255, 255, 0.6)'}
          strokeWidth={1}
          onMouseDown={handleLeftFadeMouseDown}
          onMouseEnter={() => setLeftFadeHandleHover(true)}
          onMouseLeave={() => setLeftFadeHandleHover(false)}
          cursor="ew-resize"
        />
      )}

      {/* Story 3.10: Fade-out handle (triangular, right side) */}
      {isSelected && width > 40 && (
        <Line
          points={[
            width - handleWidth - 2, // x1: inset from right trim handle
            clipPadding + 4, // y1: top
            width - handleWidth - 12, // x2: base of triangle
            clipPadding + (clipInnerHeight / 2), // y2: middle
            width - handleWidth - 2, // x3: back to right
            clipPadding + clipInnerHeight - 4, // y3: bottom
          ]}
          closed={true}
          fill={rightFadeHandleHover ? '#88ccff' : 'rgba(100, 180, 255, 0.8)'}
          stroke={rightFadeHandleHover ? '#ffffff' : 'rgba(255, 255, 255, 0.6)'}
          strokeWidth={1}
          onMouseDown={handleRightFadeMouseDown}
          onMouseEnter={() => setRightFadeHandleHover(true)}
          onMouseLeave={() => setRightFadeHandleHover(false)}
          cursor="ew-resize"
        />
      )}
    </Group>
  );
};
