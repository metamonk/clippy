import { useState, useEffect } from "react";
import { startExport } from "@/lib/tauri/export";
import { ExportProgress } from "./ExportProgress";
import { sendNotification } from "@tauri-apps/plugin-notification";
import type { Timeline } from "@/types/timeline";

interface ExportDialogProps {
  timeline: Timeline;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ExportDialog component provides UI for exporting timeline to video
 *
 * Features:
 * - Opens native macOS save dialog
 * - Shows progress bar with ETA
 * - Supports cancellation
 * - Shows success/error notifications
 */
export function ExportDialog({ timeline, isOpen, onClose }: ExportDialogProps) {
  const [exportId, setExportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setExportId(null);
      setError(null);
      setIsExporting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setError(null);
    setIsExporting(true);

    try {
      const id = await startExport(timeline);

      if (!id) {
        // User cancelled the save dialog
        setIsExporting(false);
        onClose();
        return;
      }

      setExportId(id);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to start export";
      setError(errorMessage);
      setIsExporting(false);
    }
  };

  const handleExportComplete = async () => {
    setIsExporting(false);
    setExportId(null);

    // Show success notification
    try {
      sendNotification({
        title: "Export Complete",
        body: "Your video has been exported successfully!",
      });
    } catch (err) {
      console.error("Failed to send notification:", err);
    }

    // Close dialog after short delay
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  const handleExportError = (errorMessage: string) => {
    setError(errorMessage);
    setIsExporting(false);
    setExportId(null);

    // Show error notification
    try {
      sendNotification({
        title: "Export Failed",
        body: errorMessage,
      });
    } catch (err) {
      console.error("Failed to send notification:", err);
    }
  };

  const handleExportCancel = () => {
    setIsExporting(false);
    setExportId(null);

    // Show cancel notification
    try {
      sendNotification({
        title: "Export Cancelled",
        body: "Video export was cancelled",
      });
    } catch (err) {
      console.error("Failed to send notification:", err);
    }

    onClose();
  };

  const handleClose = () => {
    if (!isExporting) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Export Video</h2>

        {!exportId && !isExporting && (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Export your timeline as an MP4 video file with H.264 encoding.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleStartExport}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
              >
                Export
              </button>
            </div>
          </>
        )}

        {exportId && (
          <ExportProgress
            exportId={exportId}
            onComplete={handleExportComplete}
            onError={handleExportError}
            onCancel={handleExportCancel}
          />
        )}
      </div>
    </div>
  );
}
