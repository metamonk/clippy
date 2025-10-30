import React, { useState, useRef, useCallback } from 'react';
import { Group, Rect, Text, Line, Circle } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Clip } from '@/types/timeline';
import { calculateClipPosition, formatTimeSimple } from '@/lib/timeline/timeUtils';
import { TIMELINE_DEFAULTS } from '@/types/timeline';
import { useTimelineStore } from '@/stores/timelineStore';
import { usePlayerStore } from '@/stores/playerStore';
import { validateFadeDuration } from '@/lib/timeline/clipOperations';
import { findSnapTargets, applySnap } from '@/lib/timeline/snapUtils';

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
  const { updateClip, moveClip, moveClipToTrack, setHoveredTrack, tracks, setClipFadeIn, setClipFadeOut, totalDuration, viewConfig } = useTimelineStore();

  // Subscribe to player store for timeline mode switching and playhead control
  const setFocusContext = usePlayerStore((state) => state.setFocusContext);
  const setPlayheadPosition = usePlayerStore((state) => state.setPlayheadPosition);

  // Handle clip selection
  const handleClipClick = useCallback(() => {
    // ADR-007: Switch to timeline mode when clicking a clip
    setFocusContext('timeline');

    // Move playhead to the clip's start position so preview shows this clip
    setPlayheadPosition(clip.startTime);

    // Select the clip (this also calls onSelect via Timeline's setSelectedClip)
    onSelect?.(clip.id);
  }, [clip.id, clip.startTime, setFocusContext, setPlayheadPosition, onSelect]);

  // Hover states for trim handles
  const [leftHandleHover, setLeftHandleHover] = useState(false);
  const [rightHandleHover, setRightHandleHover] = useState(false);

  // Story 3.10: Hover states for fade handles
  const [leftFadeHandleHover, setLeftFadeHandleHover] = useState(false);
  const [rightFadeHandleHover, setRightFadeHandleHover] = useState(false);

  // Track if we're currently dragging (for visual feedback only)
  const [isDraggingClip, setIsDraggingClip] = useState(false);

  // Track the visual drag position (for smooth dragging without collision)
  const [dragPosition, setDragPosition] = useState<number | null>(null);

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
    currentDragPosition: number | null;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    originalStartTime: 0,
    currentDragPosition: null,
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

  // Use dragPosition when dragging for smooth visual feedback, otherwise use actual position
  const displayStartTime = dragPosition !== null ? dragPosition + clip.trimIn : adjustedStartTime;

  // Calculate position and width based on the VISIBLE portion
  const { x, width } = calculateClipPosition(displayStartTime, visualDuration, pixelsPerSecond);

  // Check for NaN values that could cause rendering issues
  if (isNaN(x) || isNaN(yPosition)) {
    console.error('[TimelineClip] NaN detected!', {
      x,
      yPosition,
      displayStartTime,
      visualDuration,
      pixelsPerSecond,
      clip,
    });
  }

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
  const opacity = isDraggingClip ? 0.8 : 1; // Slight transparency when dragging
  // const trimmedRegionColor = '#2a2a2a'; // TODO: Use for visual trim regions

  // Story 4.7: Multi-audio track indicator colors
  const getAudioTrackColor = (label: string): string => {
    const normalizedLabel = label.toLowerCase();
    if (normalizedLabel.includes('system')) return '#4a9eff'; // Blue for system audio
    if (normalizedLabel.includes('microphone') || normalizedLabel.includes('mic')) return '#ff4a6e'; // Red for microphone
    if (normalizedLabel.includes('webcam') || normalizedLabel.includes('camera')) return '#4aff6e'; // Green for webcam
    return '#888888'; // Gray for unknown tracks
  };

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
      isDragging: false, // Don't set to true until we detect actual movement
      startX: e.evt.clientX,
      startY: e.evt.clientY,
      originalStartTime: clip.startTime,
    };

    // Note: setIsDraggingClip is NOT called here - only after detecting movement

    // Add window-level event listeners for drag interaction
    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape' && repositionDragRef.current.isDragging) {
        // Cancel the drag - reset to original position
        repositionDragRef.current.isDragging = false;
        repositionDragRef.current.currentDragPosition = null; // Clear ref
        setIsDraggingClip(false);
        setHoveredTrack(null);
        setDragPosition(null); // Clear visual drag position

        // Remove event listeners
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('keydown', handleKeyDown);
      }
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - repositionDragRef.current.startX;
      const deltaY = moveEvent.clientY - repositionDragRef.current.startY;

      // Only start dragging if mouse moves more than 3 pixels (prevents accidental drags on click)
      if (!repositionDragRef.current.isDragging) {
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance > 3) {
          repositionDragRef.current.isDragging = true;
          setIsDraggingClip(true);
        } else {
          return; // Not enough movement yet
        }
      }

      // Real-time horizontal repositioning while dragging
      const deltaTime = (deltaX / pixelsPerSecond) * 1000;
      let newStartTime = Math.max(0, repositionDragRef.current.originalStartTime + deltaTime);

      // Optional snapping - only snap when close to targets (like CapCut)
      const clipDuration = clip.trimOut - clip.trimIn;
      const newEndTime = newStartTime + clipDuration;

      // Only apply snapping if we're within a reasonable distance (10 pixels)
      const snapDistancePixels = 10; // pixels on screen
      const snapDistanceMs = (snapDistancePixels / pixelsPerSecond) * 1000;

      const timeline = { tracks, totalDuration };
      const snapTargets = findSnapTargets(
        timeline,
        clip.id, // exclude current clip
        1.0, // zoom level
        pixelsPerSecond
      );

      // Try snapping both start and end of the clip with tighter threshold
      const startSnapResult = applySnap(
        newStartTime,
        snapTargets,
        snapDistanceMs, // Distance-based threshold
        true
      );

      const endSnapResult = applySnap(
        newEndTime,
        snapTargets,
        snapDistanceMs, // Distance-based threshold
        true
      );

      // Use whichever snap is stronger (closer to a snap point)
      const startSnapDistance = Math.abs(startSnapResult.snappedPosition - newStartTime);
      const endSnapDistance = Math.abs(endSnapResult.snappedPosition - newEndTime);

      if (startSnapResult.snapIndicator && (!endSnapResult.snapIndicator || startSnapDistance <= endSnapDistance)) {
        // Snap to start
        newStartTime = startSnapResult.snappedPosition;
      } else if (endSnapResult.snapIndicator) {
        // Snap to end (adjust start time to align the end)
        newStartTime = endSnapResult.snappedPosition - clipDuration;
      }

      // Update visual position only (no collision detection during drag for smooth movement)
      // Store will be updated with collision resolution on mouse up
      repositionDragRef.current.currentDragPosition = newStartTime; // Store in ref for closure access
      setDragPosition(newStartTime); // Store in state for visual updates

      // Calculate which track is being hovered based on Y position
      // Get the stage's container position to convert clientY to relative Y
      const stage = e.target.getStage();
      const container = stage?.container();
      const rect = container?.getBoundingClientRect();

      if (!rect) return;

      // Convert mouse Y to position relative to timeline container
      const relativeY = moveEvent.clientY - rect.top;

      // Calculate target track index (accounting for ruler height)
      const yInTracksArea = relativeY - viewConfig.rulerHeight;
      const targetTrackIndex = Math.floor(yInTracksArea / trackHeight);

      // Clamp to valid track range
      const clampedTrackIndex = Math.max(0, Math.min(targetTrackIndex, tracks.length - 1));
      const targetTrack = tracks[clampedTrackIndex];

      if (targetTrack && targetTrack.id !== trackId) {
        // Inter-track hover detected - check for collision
        const clipDuration = clip.trimOut - clip.trimIn;
        const clipEnd = newStartTime + clipDuration;

        const hasCollision = targetTrack.clips.some((existingClip) => {
          const existingEnd = existingClip.startTime + (existingClip.trimOut - existingClip.trimIn);
          return !(clipEnd <= existingClip.startTime || newStartTime >= existingEnd);
        });

        // Update hover state with collision info (Story 3.3 Review M-1)
        setHoveredTrack({ trackId: targetTrack.id, canDrop: !hasCollision });
      } else {
        // Clear hover state when not over a different track
        setHoveredTrack(null);
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      // Clean up event listeners regardless of whether drag occurred
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);

      // If no actual drag occurred (mouse didn't move 3+ pixels), just return
      if (!repositionDragRef.current.isDragging) {
        return;
      }

      repositionDragRef.current.isDragging = false;
      setIsDraggingClip(false);

      const deltaX = upEvent.clientX - repositionDragRef.current.startX;
      const deltaY = upEvent.clientY - repositionDragRef.current.startY;

      // Clear hover state
      setHoveredTrack(null);

      // Determine if this is a vertical drag (inter-track) or horizontal drag (reposition)
      const isVerticalDrag = Math.abs(deltaY) > trackHeight * VERTICAL_DRAG_THRESHOLD_RATIO;

      if (isVerticalDrag) {
        // Inter-track move detected
        // Get the stage's container position to convert clientY to relative Y
        const stage = e.target.getStage();
        const container = stage?.container();
        const rect = container?.getBoundingClientRect();

        if (rect) {
          // Convert mouse Y to position relative to timeline container
          const relativeY = upEvent.clientY - rect.top;

          // Calculate target track index (accounting for ruler height)
          const yInTracksArea = relativeY - viewConfig.rulerHeight;
          const targetTrackIndex = Math.floor(yInTracksArea / trackHeight);

          // Clamp to valid track range
          const clampedTrackIndex = Math.max(0, Math.min(targetTrackIndex, tracks.length - 1));
          const targetTrack = tracks[clampedTrackIndex];

          if (targetTrack && targetTrack.id !== trackId) {
            moveClipToTrack(clip.id, targetTrack.id);
          }
        }
      } else if (repositionDragRef.current.currentDragPosition !== null) {
        // Horizontal move - apply smart collision resolution and record history
        // The moveClip function will find the nearest valid position
        const finalDragPosition = repositionDragRef.current.currentDragPosition;
        moveClip(clip.id, finalDragPosition, true); // Apply collision resolution and record history
      }

      // Clear the drag position to return to store-based positioning
      repositionDragRef.current.currentDragPosition = null;
      setDragPosition(null);

      // Event listeners already cleaned up at the top of this function
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
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
        opacity={opacity}
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

      {/* Story 4.7: Multi-audio track indicators (show when clip has multiple audio tracks) */}
      {clip.audioTracks && clip.audioTracks.length > 0 && width > 80 && (
        <>
          {clip.audioTracks.map((track, index) => (
            <Circle
              key={`audio-track-${track.trackIndex}`}
              x={8 + index * 10} // Horizontal spacing: 8px offset + 10px per indicator
              y={clipPadding + clipInnerHeight - 6} // Position near bottom of clip
              radius={3}
              fill={getAudioTrackColor(track.label)}
              stroke="#ffffff"
              strokeWidth={0.5}
              listening={false}
              opacity={track.muted ? 0.3 : 0.9} // Dim muted tracks
            />
          ))}
        </>
      )}
    </Group>
  );
};
