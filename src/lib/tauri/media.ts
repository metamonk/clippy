import { invoke } from "@tauri-apps/api/core";
import type { MediaFile } from "@/types/media";

/**
 * Import a video file and extract its metadata
 *
 * This function calls the Rust backend command to validate the file,
 * extract video metadata using FFmpeg, and return a MediaFile object.
 *
 * @param filePath - Absolute path to the video file to import
 * @returns Promise<MediaFile> - Successfully imported file with metadata
 * @throws Error with user-friendly message if import fails
 */
export async function importMedia(filePath: string): Promise<MediaFile> {
  try {
    const mediaFile = await invoke<MediaFile>("cmd_import_media", {
      filePath,
    });
    return mediaFile;
  } catch (error) {
    // Rust backend returns user-friendly error messages as strings
    if (typeof error === "string") {
      throw new Error(error);
    }
    // Fallback for unexpected error types
    throw new Error(
      `Failed to import media file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
