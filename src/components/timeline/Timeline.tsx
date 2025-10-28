import React, { useCallback, useRef, useState } from 'react';
import { Layer, Stage, Group, Text } from 'react-konva';
import { useTimelineStore } from '@/stores/timelineStore';
// import { useMediaLibraryStore } from '@/stores/mediaLibraryStore'; // TODO: Use when loading media
import { usePlayerStore } from '@/stores/playerStore';
import { TimeRuler } from './TimeRuler';
import { Playhead } from './Playhead';
import { TimelineTrack } from './TimelineTrack';
import { calculateTimelineWidth, pixelsToMs } from '@/lib/timeline/timeUtils';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';

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
  const [selectedClipId, setSelectedClipId] = useState<string | undefined>();

  // Subscribe to timeline store
  const tracks = useTimelineStore((state) => state.tracks);
  const totalDuration = useTimelineStore((state) => state.totalDuration);
  const viewConfig = useTimelineStore((state) => state.viewConfig);
  // const addClip = useTimelineStore((state) => state.addClip); // TODO: Use when adding clips from UI
  const storeSelectedClipId = useTimelineStore((state) => state.selectedClipId);
  const getClip = useTimelineStore((state) => state.getClip);
  const resetTrim = useTimelineStore((state) => state.resetTrim);

  // Subscribe to media library
  // const getMediaFile = useMediaLibraryStore((state) => state.getMediaFile); // TODO: Use when loading media

  // Subscribe to player store for click-to-seek
  const setPlayheadPosition = usePlayerStore((state) => state.setPlayheadPosition);
  const seek = usePlayerStore((state) => state.seek);

  // Calculate timeline dimensions
  const minTimelineWidth = Math.max(
    calculateTimelineWidth(totalDuration || 60000, viewConfig.pixelsPerSecond),
    width
  );

  const timelineHeight = viewConfig.rulerHeight + tracks.length * viewConfig.trackHeight;

  // Handle click on timeline to seek
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

      // Update playhead position
      setPlayheadPosition(clickPositionMs);

      // Seek video player (convert ms to seconds)
      seek(clickPositionMs / 1000);
    },
    [viewConfig.pixelsPerSecond, setPlayheadPosition, seek]
  );

  // Handle reset trim button click
  const handleResetTrim = useCallback(() => {
    if (storeSelectedClipId) {
      resetTrim(storeSelectedClipId);
    }
  }, [storeSelectedClipId, resetTrim]);

  // Check if selected clip has been trimmed
  const selectedClip = storeSelectedClipId ? getClip(storeSelectedClipId) : null;
  const showResetButton = selectedClip && (
    selectedClip.trimIn > 0 || selectedClip.trimOut < selectedClip.duration
  );

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

      <Stage
        width={minTimelineWidth}
        height={timelineHeight}
        ref={stageRef}
        onClick={handleStageClick}
      >
        <Layer>
          {/* Time Ruler */}
          <TimeRuler
            width={minTimelineWidth}
            height={viewConfig.rulerHeight}
            durationMs={totalDuration || 60000}
            pixelsPerSecond={viewConfig.pixelsPerSecond}
          />

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
              onClipSelect={setSelectedClipId}
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
      </Stage>
    </div>
  );
};
