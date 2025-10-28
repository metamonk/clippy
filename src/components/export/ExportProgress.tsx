import { useEffect, useState } from "react";
import { getExportProgress, cancelExport, type ExportProgress as ExportProgressType } from "@/lib/tauri/export";

interface ExportProgressProps {
  exportId: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

/**
 * ExportProgress component displays real-time export progress
 *
 * Polls the backend for progress updates and displays:
 * - Progress bar with percentage
 * - ETA (estimated time remaining)
 * - Cancel button
 */
export function ExportProgress({
  exportId,
  onComplete,
  onError,
  onCancel,
}: ExportProgressProps) {
  const [progress, setProgress] = useState<ExportProgressType | null>(null);
  const [polling, setPolling] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  // Poll for progress updates
  useEffect(() => {
    if (!polling) return;

    const pollProgress = async () => {
      try {
        const currentProgress = await getExportProgress(exportId);
        setProgress(currentProgress);

        // Stop polling if export is complete, failed, or cancelled
        if (
          currentProgress.status === "completed" ||
          currentProgress.status === "failed" ||
          currentProgress.status === "cancelled"
        ) {
          setPolling(false);

          if (currentProgress.status === "completed") {
            onComplete?.();
          } else if (currentProgress.status === "failed") {
            onError?.(currentProgress.errorMessage || "Export failed");
          } else if (currentProgress.status === "cancelled") {
            onCancel?.();
          }
        }
      } catch (error) {
        console.error("Failed to get export progress:", error);
        setPolling(false);
        onError?.(error instanceof Error ? error.message : String(error));
      }
    };

    // Initial poll
    pollProgress();

    // Poll every 500ms while running
    const interval = setInterval(pollProgress, 500);

    return () => clearInterval(interval);
  }, [exportId, polling, onComplete, onError, onCancel]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelExport(exportId);
      setPolling(false);
      onCancel?.();
    } catch (error) {
      console.error("Failed to cancel export:", error);
      onError?.(error instanceof Error ? error.message : String(error));
    } finally {
      setCancelling(false);
    }
  };

  if (!progress) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
        <span className="text-sm text-gray-600">Starting export...</span>
      </div>
    );
  }

  const formatETA = (seconds?: number) => {
    if (!seconds || seconds <= 0) return "Calculating...";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3 p-4 bg-white rounded-lg shadow">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Exporting Video</h3>
        <span className="text-sm text-gray-600">
          {progress.percentage.toFixed(1)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
          style={{ width: `${Math.min(progress.percentage, 100)}%` }}
        />
      </div>

      {/* ETA */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">
          ETA: {formatETA(progress.etaSeconds)}
        </span>

        {/* Cancel button */}
        <button
          onClick={handleCancel}
          disabled={cancelling || progress.status !== "running"}
          className="px-3 py-1 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {cancelling ? "Cancelling..." : "Cancel"}
        </button>
      </div>

      {/* Status message */}
      {progress.status === "failed" && progress.errorMessage && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {progress.errorMessage}
        </div>
      )}
    </div>
  );
}
