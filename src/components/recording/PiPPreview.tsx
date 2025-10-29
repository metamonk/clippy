/**
 * PiPPreview Component (Story 4.5)
 *
 * Live preview showing PiP overlay positioning on screen preview.
 * Supports drag-and-drop for custom position adjustment.
 */

import React, { useRef, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useRecordingStore } from '@/stores/recordingStore';
import { constrainPipPosition } from '@/lib/recording/pipUtils';

export interface PiPPreviewProps {
  /** Screen dimensions for preview (actual screen size) */
  screenDimensions: { width: number; height: number };
  /** Preview container dimensions (scaled down for UI) */
  previewDimensions: { width: number; height: number };
  /** Whether drag is enabled */
  draggable?: boolean;
}

export function PiPPreview({
  screenDimensions,
  previewDimensions,
  draggable = true,
}: PiPPreviewProps) {
  const pipPosition = useRecordingStore((state) => state.pipPosition);
  const pipSize = useRecordingStore((state) => state.pipSize);
  const setPipPosition = useRecordingStore((state) => state.setPipPosition);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const constraintToastShownRef = useRef(false);

  // Calculate scale factors between preview and actual screen
  const scaleX = previewDimensions.width / screenDimensions.width;
  const scaleY = previewDimensions.height / screenDimensions.height;

  // Scale PiP position and size for preview
  const scaledPosition = pipPosition
    ? {
        x: pipPosition.x * scaleX,
        y: pipPosition.y * scaleY,
      }
    : null;

  const scaledSize = pipSize
    ? {
        width: pipSize.width * scaleX,
        height: pipSize.height * scaleY,
      }
    : null;

  /**
   * Handle mouse down on PiP overlay to start drag
   */
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggable || !scaledPosition) return;

    e.preventDefault();
    setIsDragging(true);
    constraintToastShownRef.current = false; // Reset for new drag operation

    // Record starting position relative to the overlay
    const rect = e.currentTarget.getBoundingClientRect();
    setDragStart({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  /**
   * Handle mouse move during drag
   */
  useEffect(() => {
    if (!isDragging || !dragStart || !previewRef.current || !pipSize || !scaledSize) return;

    const handleMouseMove = (e: MouseEvent) => {
      const previewRect = previewRef.current!.getBoundingClientRect();

      // Calculate new position in preview coordinates
      const newX = e.clientX - previewRect.left - dragStart.x;
      const newY = e.clientY - previewRect.top - dragStart.y;

      // Convert to actual screen coordinates
      const actualX = newX / scaleX;
      const actualY = newY / scaleY;

      // Store unconstrained position for comparison
      const unconstrainedPosition = { x: actualX, y: actualY };

      // Constrain to screen bounds
      const constrainedPosition = constrainPipPosition(
        unconstrainedPosition,
        pipSize,
        screenDimensions
      );

      // Show toast if position was constrained (AC #6) - only once per drag
      if (
        !constraintToastShownRef.current &&
        (Math.abs(constrainedPosition.x - unconstrainedPosition.x) > 0.5 ||
          Math.abs(constrainedPosition.y - unconstrainedPosition.y) > 0.5)
      ) {
        toast.info('PiP position adjusted to stay within screen bounds');
        constraintToastShownRef.current = true;
      }

      setPipPosition(constrainedPosition);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragStart(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, scaleX, scaleY, pipSize, screenDimensions, setPipPosition, scaledSize]);

  if (!pipPosition || !pipSize || !scaledPosition || !scaledSize) {
    return (
      <div
        ref={previewRef}
        className="relative bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md overflow-hidden"
        style={{
          width: previewDimensions.width,
          height: previewDimensions.height,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
          Configuring PiP...
        </div>
      </div>
    );
  }

  return (
    <div
      ref={previewRef}
      className="relative bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md overflow-hidden"
      style={{
        width: previewDimensions.width,
        height: previewDimensions.height,
      }}
    >
      {/* Screen preview background */}
      <div className="absolute inset-0 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
        <div className="text-center">
          <div className="text-xs mb-1">Screen Preview</div>
          <div className="text-xs text-gray-400">
            {screenDimensions.width}×{screenDimensions.height}
          </div>
        </div>
      </div>

      {/* PiP overlay */}
      <div
        className={`absolute bg-blue-500 dark:bg-blue-600 bg-opacity-40 dark:bg-opacity-40 border-2 border-blue-500 dark:border-blue-400 rounded-sm flex items-center justify-center ${
          draggable ? 'cursor-move' : 'cursor-default'
        } ${isDragging ? 'opacity-70' : 'opacity-100'}`}
        style={{
          left: scaledPosition.x,
          top: scaledPosition.y,
          width: scaledSize.width,
          height: scaledSize.height,
        }}
        onMouseDown={handleMouseDown}
      >
        <div className="text-white text-xs font-semibold">
          Webcam
        </div>
      </div>

      {/* Drag hint */}
      {draggable && !isDragging && (
        <div className="absolute bottom-2 left-2 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded shadow-sm">
          Drag overlay to reposition
        </div>
      )}

      {/* Position coordinates while dragging */}
      {isDragging && (
        <div className="absolute top-2 left-2 text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 px-2 py-1 rounded shadow-md font-mono">
          x: {Math.round(pipPosition.x)}, y: {Math.round(pipPosition.y)}
        </div>
      )}
    </div>
  );
}
