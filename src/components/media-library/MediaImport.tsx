import React, { useState, useEffect } from "react";
import { Upload } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { importMedia } from "@/lib/tauri/media";
import { useMediaLibraryStore } from "@/stores/mediaLibraryStore";
import { cn } from "@/lib/utils";

/**
 * MediaImport Component
 *
 * This component provides drag-and-drop and file picker functionality for importing video files.
 * Supports MP4 and MOV formats, validates files, and adds them to the media library store.
 */
export function MediaImport() {
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const addMediaFile = useMediaLibraryStore((state) => state.addMediaFile);
  const hasMediaFile = useMediaLibraryStore((state) => state.hasMediaFile);

  const supportedFormats = ["mp4", "mov", "webm"];

  /**
   * Validate if a file has a supported extension
   */
  const isValidFormat = (filename: string): boolean => {
    const extension = filename.split(".").pop()?.toLowerCase();
    return extension ? supportedFormats.includes(extension) : false;
  };

  /**
   * Handle file picker button click with batch import support
   */
  const handleFilePickerClick = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Video",
            extensions: ["mp4", "mov", "webm"],
          },
        ],
      });

      if (!selected) return;

      const files = Array.isArray(selected) ? selected : [selected];
      await handleBatchImport(files);
    } catch (error) {
      console.error("Failed to open file picker:", error);
    }
  };

  /**
   * Handle batch import of multiple files with progress tracking
   */
  const handleBatchImport = async (filePaths: string[]) => {
    if (filePaths.length === 0) return;

    setIsImporting(true);
    setBatchProgress({ current: 0, total: filePaths.length });

    const errors: string[] = [];
    let successCount = 0;
    let duplicateCount = 0;

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      const filename = filePath.split("/").pop() || filePath;

      setBatchProgress({ current: i + 1, total: filePaths.length });

      // Check for duplicate file
      if (hasMediaFile(filePath)) {
        duplicateCount++;
        continue;
      }

      // Frontend validation - check format before calling backend
      if (!isValidFormat(filename)) {
        errors.push(
          `${filename}: Unsupported format (MP4, MOV, and WebM only)`
        );
        continue;
      }

      try {
        const mediaFile = await importMedia(filePath);
        addMediaFile(mediaFile);
        successCount++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push(`${filename}: ${errorMessage}`);
      }
    }

    // Show aggregated results
    if (successCount > 0) {
      toast.success(
        `Successfully imported ${successCount} file${successCount > 1 ? "s" : ""}`
      );
    }

    if (duplicateCount > 0) {
      toast.info(
        `${duplicateCount} file${duplicateCount > 1 ? "s" : ""} already imported`
      );
    }

    if (errors.length > 0) {
      toast.error(`Failed to import ${errors.length} file${errors.length > 1 ? "s" : ""}`, {
        description: errors.slice(0, 3).join("\n") + (errors.length > 3 ? "\n..." : ""),
      });
    }

    setIsImporting(false);
    setBatchProgress(null);
  };

  /**
   * Handle drag over event
   */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  /**
   * Handle drag leave event
   */
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  /**
   * Handle drop event
   * Note: Tauri handles file drops through events, not through React's drop event
   */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  /**
   * Set up Tauri drag-drop listener
   */
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<string[]>("tauri://drag-drop", (event) => {
      const files = event.payload;
      handleBatchImport(files);
    }).then((unlistenFn) => {
      unlisten = unlistenFn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  /**
   * Handle keyboard accessibility - Enter key triggers file picker
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleFilePickerClick();
    }
  };

  return (
    <div className="w-full p-4">
      <div
        className={cn(
          "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-gray-400",
          isImporting && "opacity-50 cursor-wait"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Drag and drop video files here or click to select"
      >
        <Upload
          className={cn(
            "h-12 w-12 mb-4 transition-colors",
            isDragging ? "text-blue-500" : "text-gray-400"
          )}
        />

        <p className="text-sm text-gray-600 mb-2 text-center">
          {isDragging
            ? "Drop your video files here"
            : "Drag & drop video files here"}
        </p>

        <p className="text-xs text-gray-500 mb-4">Supports MP4, MOV, and WebM files</p>

        <button
          onClick={handleFilePickerClick}
          disabled={isImporting}
          className={cn(
            "px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
            isImporting
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          )}
        >
          {batchProgress
            ? `Importing ${batchProgress.current}/${batchProgress.total}...`
            : isImporting
            ? "Importing..."
            : "Import Video"}
        </button>

        {isDragging && (
          <div className="absolute inset-0 rounded-lg border-2 border-blue-500 bg-blue-50 bg-opacity-50 pointer-events-none" />
        )}
      </div>
    </div>
  );
}
