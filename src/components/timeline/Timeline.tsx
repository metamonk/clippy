import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layer, Stage, Group, Text } from 'react-konva';
import { useTimelineStore } from '@/stores/timelineStore';
// import { useMediaLibraryStore } from '@/stores/mediaLibraryStore'; // TODO: Use when loading media
import { usePlayerStore } from '@/stores/playerStore';
import { TimeRuler } from './TimeRuler';
import { Playhead } from './Playhead';
import { TimelineTrack } from './TimelineTrack';
import { calculateTimelineWidth, pixelsToMs } from '@/lib/timeline/timeUtils';
import { getEffectiveDuration } from '@/lib/timeline/clipOperations';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Clip } from '@/types/timeline';

interface TimelineProps {
  width: number;
  height: number;
}

/**
 * Timeline Component
 *
 * Main timeline canvas component using Konva.js.
 * Renders time ruler, playhead, tracks, and clips.
 * Supports drag-drop from media library to add clips.
 *
 * Following ADR-002: Using Konva.js for canvas-based timeline rendering
 * Following ADR-003: Using Zustand for state management
 */
export const Timeline: React.FC<TimelineProps> = ({ width, height: _height }) => {
  const stageRef = useRef<Konva.Stage>(null);

  // Subscribe to timeline store
  const tracks = useTimelineStore((state) => state.tracks);
  const totalDuration = useTimelineStore((state) => state.totalDuration);
  const viewConfig = useTimelineStore((state) => state.viewConfig);
  // const addClip = useTimelineStore((state) => state.addClip); // TODO: Use when adding clips from UI
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const setSelectedClip = useTimelineStore((state) => state.setSelectedClip);
  const getClip = useTimelineStore((state) => state.getClip);
  const resetTrim = useTimelineStore((state) => state.resetTrim);
  const splitClip = useTimelineStore((state) => state.splitClip); // Story 3.4 AC#1
  const undo = useTimelineStore((state) => state.undo); // Story 3.3 AC#5

  // Subscribe to media library
  // const getMediaFile = useMediaLibraryStore((state) => state.getMediaFile); // TODO: Use when loading media

  // Subscribe to player store for click-to-seek and split
  const playheadPosition = usePlayerStore((state) => state.playheadPosition);
  const setPlayheadPosition = usePlayerStore((state) => state.setPlayheadPosition);
  const seek = usePlayerStore((state) => state.seek);
  const setFocusContext = usePlayerStore((state) => state.setFocusContext);

  // Story 3.3 AC#5: Keyboard shortcut for undo (Cmd+Z / Ctrl+Z)
  // Story 3.4 AC#1: Keyboard shortcut for split (Cmd+B / Ctrl+B)
  // ESC: Deselect clip
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Z (macOS) or Ctrl+Z (Windows/Linux) - Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }

      // Cmd+B (macOS) or Ctrl+B (Windows/Linux) - Split clip at playhead
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();

        // Find clip at current playhead position
        const clipAtPlayhead = findClipAtPlayhead();
        if (clipAtPlayhead) {
          splitClip(clipAtPlayhead.id, playheadPosition);
        }
      }

      // ESC - Deselect clip
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedClip(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, splitClip, playheadPosition, setSelectedClip]);

  // Calculate timeline dimensions
  const minTimelineWidth = Math.max(
    calculateTimelineWidth(totalDuration || 60000, viewConfig.pixelsPerSecond),
    width
  );

  const timelineHeight = viewConfig.rulerHeight + tracks.length * viewConfig.trackHeight;

  // Handle click on timeline to seek and deselect clips
  const handleStageClick = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;

      // Only handle clicks on the stage background (not on other elements)
      if (e.target !== stage && e.target.getClassName() !== 'Layer') {
        return;
      }

      const pointerPosition = stage.getPointerPosition();
      if (!pointerPosition) return;

      // Convert pixel position to milliseconds
      const clickPositionMs = Math.max(0, pixelsToMs(pointerPosition.x, viewConfig.pixelsPerSecond));

      // ADR-007: Switch to timeline mode when interacting with timeline
      setFocusContext('timeline');

      // Deselect any selected clip when clicking empty space
      setSelectedClip(null);

      // Update playhead position
      setPlayheadPosition(clickPositionMs);

      // Seek video player (convert ms to seconds)
      seek(clickPositionMs / 1000);
    },
    [viewConfig.pixelsPerSecond, setPlayheadPosition, seek, setFocusContext, setSelectedClip]
  );

  // Story 3.4 AC#6: Find clip at playhead position
  const findClipAtPlayhead = useCallback((): Clip | null => {
    for (const track of tracks) {
      for (const clip of track.clips) {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + getEffectiveDuration(clip);

        if (playheadPosition >= clipStart && playheadPosition < clipEnd) {
          return clip;
        }
      }
    }
    return null;
  }, [tracks, playheadPosition]);

  // Handle reset trim button click
  const handleResetTrim = useCallback(() => {
    if (selectedClipId) {
      resetTrim(selectedClipId);
    }
  }, [selectedClipId, resetTrim]);

  // Story 3.4 AC#1: Handle split button click
  const handleSplit = useCallback(() => {
    const clipAtPlayhead = findClipAtPlayhead();
    if (clipAtPlayhead) {
      splitClip(clipAtPlayhead.id, playheadPosition);
    }
  }, [findClipAtPlayhead, splitClip, playheadPosition]);

  // Check if selected clip has been trimmed
  const selectedClip = selectedClipId ? getClip(selectedClipId) : null;
  const showResetButton = selectedClip && (
    selectedClip.trimIn > 0 || selectedClip.trimOut < selectedClip.duration
  );

  // Story 3.4 AC#1: Check if playhead is over a clip (for split button)
  const clipAtPlayhead = findClipAtPlayhead();
  const showSplitButton = clipAtPlayhead !== null;

  return (
    <div
      className="timeline-container"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        backgroundColor: '#1a1a1a',
        position: 'relative',
      }}
    >
      {/* Reset Trim Button */}
      {showResetButton && (
        <button
          onClick={handleResetTrim}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            zIndex: 10,
            padding: '6px 12px',
            backgroundColor: '#4a4a4a',
            color: '#ffffff',
            border: '1px solid #666666',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#5a5a5a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#4a4a4a';
          }}
        >
          Reset Trim
        </button>
      )}

      {/* Story 3.4 AC#1: Split Button */}
      {showSplitButton && (
        <button
          onClick={handleSplit}
          title="Split clip at playhead (Cmd+B)"
          style={{
            position: 'absolute',
            top: '8px',
            right: showResetButton ? '110px' : '8px', // Position to left of reset button if both showing
            zIndex: 10,
            padding: '6px 12px',
            backgroundColor: '#4a4a4a',
            color: '#ffffff',
            border: '1px solid #666666',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#5a5a5a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#4a4a4a';
          }}
        >
          Split (Cmd+B)
        </button>
      )}

      <Stage
        width={minTimelineWidth}
        height={timelineHeight}
        ref={stageRef}
        onClick={handleStageClick}
      >
        {/* Tracks Layer - render first (behind ruler) */}
        <Layer>
          {/* Tracks */}
          {tracks.map((track, index) => (
            <TimelineTrack
              key={track.id}
              track={track}
              yPosition={viewConfig.rulerHeight + index * viewConfig.trackHeight}
              width={minTimelineWidth}
              trackHeight={viewConfig.trackHeight}
              pixelsPerSecond={viewConfig.pixelsPerSecond}
              selectedClipId={selectedClipId}
              onClipSelect={setSelectedClip}
            />
          ))}

          {/* Empty state message */}
          {tracks.every((track) => track.clips.length === 0) && (
            <Group>
              <Text
                x={width / 2 - 100}
                y={viewConfig.rulerHeight + viewConfig.trackHeight / 2 - 10}
                text="Drag clips from media library to timeline"
                fontSize={14}
                fill="#888888"
                fontFamily="Arial"
                width={200}
                align="center"
              />
            </Group>
          )}

          {/* Playhead (rendered last to be on top) */}
          <Playhead
            height={timelineHeight}
            pixelsPerSecond={viewConfig.pixelsPerSecond}
          />
        </Layer>

        {/* Ruler Layer - render on top so it's never obscured by clips */}
        <Layer listening={false}>
          <TimeRuler
            width={minTimelineWidth}
            height={viewConfig.rulerHeight}
            durationMs={totalDuration || 60000}
            pixelsPerSecond={viewConfig.pixelsPerSecond}
          />
        </Layer>
      </Stage>
    </div>
  );
};
