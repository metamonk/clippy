import { useRef, useEffect, useState } from "react";
import { PreviewPanel } from "./PreviewPanel";
import { TimelinePanel } from "./TimelinePanel";
import { MediaLibraryPanel } from "./MediaLibraryPanel";
import { ExportDialog } from "../export/ExportDialog";
import { RecordingPanel } from "../recording/RecordingPanel";
import { DragPreview } from "../common/DragPreview";
import { Download, Video } from "lucide-react";
import type { Timeline } from "@/types/timeline";
import { useDragStore } from "@/stores/dragStore";
import { useMediaLibraryStore } from "@/stores/mediaLibraryStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { pixelsToMs } from "@/lib/timeline/timeUtils";
import { findSnapTargets, applySnap } from "@/lib/timeline/snapUtils";

export function MainLayout() {
  const mediaLibraryRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showRecordingPanel, setShowRecordingPanel] = useState(false);

  // Drag state
  const isDragging = useDragStore((state) => state.isDragging);
  const draggedMediaFileId = useDragStore((state) => state.draggedMediaFileId);
  const updateMousePosition = useDragStore((state) => state.updateMousePosition);
  const endDrag = useDragStore((state) => state.endDrag);

  // Stores
  const getMediaFile = useMediaLibraryStore((state) => state.getMediaFile);
  const addClip = useTimelineStore((state) => state.addClip);
  const tracks = useTimelineStore((state) => state.tracks);
  const viewConfig = useTimelineStore((state) => state.viewConfig);
  const totalDuration = useTimelineStore((state) => state.totalDuration);

  // Get actual timeline data from store for export
  const timeline: Timeline = {
    tracks,
    totalDuration,
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Handle Cmd+R / Ctrl+R to open recording panel
      if ((event.metaKey || event.ctrlKey) && event.key === 'r') {
        event.preventDefault();
        setShowRecordingPanel(true);
        return;
      }

      // Handle Tab key for custom focus cycling
      if (event.key === "Tab") {
        event.preventDefault();

        const panels = [mediaLibraryRef, previewRef, timelineRef];
        const currentIndex = panels.findIndex(
          (ref) => ref.current === document.activeElement
        );

        let nextIndex: number;
        if (event.shiftKey) {
          // Shift+Tab: cycle backwards
          nextIndex = currentIndex <= 0 ? panels.length - 1 : currentIndex - 1;
        } else {
          // Tab: cycle forwards
          nextIndex = currentIndex === -1 || currentIndex >= panels.length - 1
            ? 0
            : currentIndex + 1;
        }

        panels[nextIndex]?.current?.focus();
      }

      // Handle Enter key to activate focused panel (placeholder for future functionality)
      if (event.key === "Enter") {
        const focusedPanel = document.activeElement;
        if (
          focusedPanel === mediaLibraryRef.current ||
          focusedPanel === previewRef.current ||
          focusedPanel === timelineRef.current
        ) {
          // Placeholder: In future stories, this will trigger panel-specific actions
          // For now, just ensure the panel stays focused (visual feedback via focus ring)
          event.preventDefault();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Global drag handlers
  useEffect(() => {
    if (!isDragging) return;

    // Disable text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      updateMousePosition(e.clientX, e.clientY);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!draggedMediaFileId || !timelineRef.current) {
        endDrag();
        return;
      }

      // Get the actual timeline canvas container (not the outer panel with toolbars)
      const timelineContainer = timelineRef.current.querySelector('.timeline-container');
      if (!timelineContainer) {
        endDrag();
        return;
      }

      const timelineRect = (timelineContainer as HTMLElement).getBoundingClientRect();

      const isOverTimeline =
        e.clientX >= timelineRect.left &&
        e.clientX <= timelineRect.right &&
        e.clientY >= timelineRect.top &&
        e.clientY <= timelineRect.bottom;

      if (isOverTimeline) {
        // Get media file
        const mediaFile = getMediaFile(draggedMediaFileId);

        if (!mediaFile || tracks.length === 0) {
          endDrag();
          return;
        }

        // Calculate drop position relative to timeline canvas
        const scrollLeft = (timelineContainer as HTMLElement).scrollLeft || 0;

        const dropX = e.clientX - timelineRect.left + scrollLeft;
        const dropY = e.clientY - timelineRect.top;

        // Convert X position to timeline time
        let dropTimeMs = pixelsToMs(dropX, viewConfig.pixelsPerSecond);

        // Find snap targets and apply snapping
        const timeline = { tracks, totalDuration };
        const snapTargets = findSnapTargets(
          timeline,
          '', // no clip to exclude (this is a new clip)
          1.0, // zoom level
          viewConfig.pixelsPerSecond
        );

        // Apply snap to clip edges and grid
        const snapResult = applySnap(
          dropTimeMs,
          snapTargets,
          50, // tighter threshold for precise edge alignment
          true // snap enabled
        );

        dropTimeMs = snapResult.snappedPosition;

        // Story 3.1 AC#3: Calculate target track from Y position
        // Account for time ruler at top, then determine which track based on Y position
        const yInTracksArea = dropY - viewConfig.rulerHeight;
        const trackIndex = Math.floor(yInTracksArea / viewConfig.trackHeight);

        // Clamp to valid track range
        const clampedTrackIndex = Math.max(0, Math.min(trackIndex, tracks.length - 1));
        const targetTrack = tracks[clampedTrackIndex];

        // Check for collisions and find nearest valid position
        const newClipDuration = mediaFile.duration;
        let validStartTime = Math.max(0, dropTimeMs);

        // Sort existing clips by start time
        const existingClips = targetTrack.clips.sort((a, b) => a.startTime - b.startTime);

        // Helper function to check if a position would collide with any clip
        const hasCollisionAt = (startTime: number): boolean => {
          const endTime = startTime + newClipDuration;
          return existingClips.some(clip => {
            const clipStart = clip.startTime;
            const clipEnd = clip.startTime + (clip.trimOut - clip.trimIn);
            return endTime > clipStart && startTime < clipEnd;
          });
        };

        // If desired position has collision, find all valid gaps
        if (hasCollisionAt(validStartTime)) {
          const validPositions: number[] = [];

          // Position before first clip
          if (existingClips.length > 0) {
            const beforeFirst = existingClips[0].startTime - newClipDuration;
            if (beforeFirst >= 0 && !hasCollisionAt(beforeFirst)) {
              validPositions.push(beforeFirst);
            }
          }

          // Gaps between clips
          for (let i = 0; i < existingClips.length - 1; i++) {
            const currentClip = existingClips[i];
            const nextClip = existingClips[i + 1];

            const currentEnd = currentClip.startTime + (currentClip.trimOut - currentClip.trimIn);
            const gapStart = currentEnd;
            const gapEnd = nextClip.startTime;
            const gapSize = gapEnd - gapStart;

            if (gapSize >= newClipDuration && !hasCollisionAt(gapStart)) {
              validPositions.push(gapStart);
            }
          }

          // Position after last clip
          if (existingClips.length > 0) {
            const lastClip = existingClips[existingClips.length - 1];
            const afterLast = lastClip.startTime + (lastClip.trimOut - lastClip.trimIn);
            if (!hasCollisionAt(afterLast)) {
              validPositions.push(afterLast);
            }
          }

          // Choose closest valid position to drop point
          if (validPositions.length > 0) {
            validStartTime = validPositions.reduce((closest, pos) => {
              const distToPos = Math.abs(dropTimeMs - pos);
              const distToClosest = Math.abs(dropTimeMs - closest);
              return distToPos < distToClosest ? pos : closest;
            });
          } else if (existingClips.length > 0) {
            // No gaps found, place after last clip
            const lastClip = existingClips[existingClips.length - 1];
            validStartTime = lastClip.startTime + (lastClip.trimOut - lastClip.trimIn);
          }
        }

        // Add clip to timeline at valid position
        addClip(targetTrack.id, {
          filePath: mediaFile.filePath,
          startTime: Math.max(0, validStartTime),
          duration: mediaFile.duration,
          trimIn: 0,
          trimOut: mediaFile.duration,
        });
      }

      endDrag();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      // Re-enable text selection after drag
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, draggedMediaFileId, endDrag, updateMousePosition, getMediaFile, addClip, tracks, viewConfig]);

  return (
    <>
      <div className="flex h-screen w-screen bg-gray-50 gap-2 p-2 overflow-hidden">
        <div className="flex flex-col flex-1 gap-2 min-w-0 min-h-0">
          <PreviewPanel ref={previewRef} />
          <TimelinePanel ref={timelineRef} />
        </div>
        <MediaLibraryPanel ref={mediaLibraryRef} />

        {/* Action buttons - floating in bottom right */}
        <div className="fixed bottom-6 right-6 flex flex-col gap-3">
          {/* Record button */}
          <button
            onClick={() => setShowRecordingPanel(true)}
            className="flex items-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-lg transition-colors"
            title="Record Screen (Cmd+R)"
          >
            <Video className="w-5 h-5" />
            <span className="font-medium">Record</span>
          </button>

          {/* Export button */}
          <button
            onClick={() => setShowExportDialog(true)}
            className="flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg transition-colors"
            title="Export Video"
          >
            <Download className="w-5 h-5" />
            <span className="font-medium">Export</span>
          </button>
        </div>
      </div>

      {/* Recording panel */}
      <RecordingPanel
        open={showRecordingPanel}
        onOpenChange={setShowRecordingPanel}
      />

      {/* Export dialog */}
      <ExportDialog
        timeline={timeline}
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
      />

      {/* Drag preview - shows what's being dragged */}
      <DragPreview />
    </>
  );
}
