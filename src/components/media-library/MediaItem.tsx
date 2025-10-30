import { Film, Trash2 } from "lucide-react";
import React, { useState } from "react";
import type { MediaFile } from "@/types/media";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/stores/playerStore";
import { useMediaLibraryStore } from "@/stores/mediaLibraryStore";
import { useDragStore } from "@/stores/dragStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface MediaItemProps {
  mediaFile: MediaFile;
}

/**
 * Format duration from milliseconds to MM:SS
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Format file size from bytes to MB
 */
function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

/**
 * MediaItem Component
 *
 * Displays a single media file with thumbnail, metadata (filename, duration, resolution, file size),
 * and a delete button. Clicking the item loads the video into the preview player.
 */
export function MediaItem({ mediaFile }: MediaItemProps) {
  const { currentVideo, setCurrentVideo } = usePlayerStore();
  const { removeMediaFile } = useMediaLibraryStore();
  const isSelected = currentVideo?.id === mediaFile.id;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);

  const handleClick = () => {
    // Focus Context System (ADR-007): setCurrentVideo automatically sets focusContext='source' → mode='preview'
    // This enables independent playback when selecting from library (vs timeline composition playback)
    setCurrentVideo(mediaFile);
  };

  const handleDelete = () => {
    removeMediaFile(mediaFile.id);

    // Clear player if this was the current video
    if (currentVideo?.id === mediaFile.id) {
      setCurrentVideo(null);
    }

    setShowDeleteDialog(false);
  };

  const startDrag = useDragStore((state) => state.startDrag);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only start drag on left mouse button
    if (e.button !== 0) return;

    // Don't start drag if clicking on delete button
    if ((e.target as HTMLElement).closest('button[aria-label="Delete video"]')) {
      return;
    }

    // Prevent text selection during drag
    e.preventDefault();

    startDrag(mediaFile.id, e.clientX, e.clientY);
  };

  return (
    <>
      <div
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        className={cn(
          "relative group flex flex-col gap-2 p-3 rounded-lg shadow-sm border-2 transition-all cursor-pointer hover:cursor-grab active:cursor-grabbing",
          isSelected
            ? "border-blue-500 bg-blue-50"
            : "border-gray-200 bg-white hover:bg-gray-50"
        )}
        role="button"
        tabIndex={0}
        aria-label={`Load video ${mediaFile.filename}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
          if (e.key === "Delete") {
            e.preventDefault();
            setShowDeleteDialog(true);
          }
        }}
      >
        {/* Thumbnail with delete button overlay */}
        <div className="relative w-full aspect-video rounded-md overflow-hidden bg-gray-100">
          {!thumbnailError && mediaFile.thumbnail ? (
            <img
              src={mediaFile.thumbnail}
              alt={`Thumbnail for ${mediaFile.filename}`}
              className="w-full h-full object-cover"
              onError={() => setThumbnailError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="h-12 w-12 text-gray-400" />
            </div>
          )}

          {/* Delete button - appears on hover */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteDialog(true);
            }}
            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
            aria-label="Delete video"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* File metadata */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm text-gray-900 truncate">
            {mediaFile.filename}
          </h3>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
            <span>{formatDuration(mediaFile.duration)}</span>
            <span>
              {mediaFile.resolution.width}x{mediaFile.resolution.height}
            </span>
            <span>{formatFileSize(mediaFile.fileSize)}</span>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete video?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{mediaFile.filename}" from your media library.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
