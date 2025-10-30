import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { Timeline } from "@/types/timeline";

/**
 * Export configuration options
 */
export interface ExportConfig {
  outputPath: string;
  resolution?: [number, number]; // [width, height]
  codec?: string; // Default: "libx264"
  audioCodec?: string; // Default: "aac"
  videoBitrate?: string; // e.g., "5M"
  audioBitrate?: string; // e.g., "192k"
}

/**
 * Export progress status
 */
export type ExportStatus = "running" | "completed" | "failed" | "cancelled";

/**
 * Export progress information
 */
export interface ExportProgress {
  exportId: string;
  status: ExportStatus;
  percentage: number; // 0-100
  etaSeconds?: number; // Estimated time remaining
  currentTimeMs?: number; // Current processing time
  totalDurationMs: number; // Total timeline duration
  errorMessage?: string; // Error message if status is "failed"
}

/**
 * Start a new video export operation
 *
 * This function opens a native macOS save dialog, then initiates
 * the export of a timeline to an MP4 file. The export runs in the background.
 *
 * @param timeline - Timeline with tracks and clips to export
 * @param config - Optional export configuration (codec, resolution, etc.)
 * @returns Promise<string> - Export ID for tracking progress, or null if cancelled
 * @throws Error with user-friendly message if export fails to start
 */
export async function startExport(
  timeline: Timeline,
  config?: Partial<ExportConfig>
): Promise<string | null> {
  try {
    // Open native save dialog
    const outputPath = await save({
      title: "Export Video",
      defaultPath: "export.mp4",
      filters: [
        {
          name: "MP4 Video",
          extensions: ["mp4"],
        },
      ],
    });

    // User cancelled the dialog
    if (!outputPath) {
      return null;
    }

    // Build export config with defaults
    const exportConfig: ExportConfig = {
      outputPath,
      codec: config?.codec,
      audioCodec: config?.audioCodec,
      resolution: config?.resolution,
      videoBitrate: config?.videoBitrate,
      audioBitrate: config?.audioBitrate,
    };

    // Debug: Log timeline structure before export
    console.log("[Export Debug] Timeline structure:", {
      trackCount: timeline.tracks.length,
      totalDuration: timeline.totalDuration,
      tracks: timeline.tracks.map((track, idx) => ({
        index: idx,
        id: track.id,
        trackType: track.trackType,
        clipCount: track.clips.length,
        clips: track.clips.map(clip => ({
          id: clip.id,
          filePath: clip.filePath,
          startTime: clip.startTime,
          duration: clip.duration,
        })),
      })),
    });

    // Start export
    const exportId = await invoke<string>("cmd_start_export", {
      timeline,
      config: exportConfig,
    });

    return exportId;
  } catch (error) {
    // Rust backend returns user-friendly error messages as strings
    if (typeof error === "string") {
      throw new Error(error);
    }
    // Fallback for unexpected error types
    throw new Error(
      `Failed to start export: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get progress information for an ongoing export
 *
 * @param exportId - ID of the export to query (returned from startExport)
 * @returns Promise<ExportProgress> - Current progress information
 * @throws Error if export not found or progress unavailable
 */
export async function getExportProgress(
  exportId: string
): Promise<ExportProgress> {
  try {
    const progress = await invoke<ExportProgress>("cmd_get_export_progress", {
      exportId,
    });
    return progress;
  } catch (error) {
    if (typeof error === "string") {
      throw new Error(error);
    }
    throw new Error(
      `Failed to get export progress: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Cancel an ongoing export operation
 *
 * @param exportId - ID of the export to cancel
 * @returns Promise<void>
 * @throws Error if export not found or cancellation failed
 */
export async function cancelExport(exportId: string): Promise<void> {
  try {
    await invoke("cmd_cancel_export", { exportId });
  } catch (error) {
    if (typeof error === "string") {
      throw new Error(error);
    }
    throw new Error(
      `Failed to cancel export: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
