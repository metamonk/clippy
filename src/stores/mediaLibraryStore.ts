import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { MediaFile } from "@/types/media";

interface MediaLibraryState {
  /** Array of imported media files */
  mediaFiles: MediaFile[];

  /** Add a media file to the library */
  addMediaFile: (file: MediaFile) => void;

  /** Remove a media file from the library by ID */
  removeMediaFile: (id: string) => void;

  /** Get a media file by ID */
  getMediaFile: (id: string) => MediaFile | undefined;

  /** Check if a file with the given path is already imported */
  hasMediaFile: (filePath: string) => boolean;

  /** Clear all media files from the library */
  clearMediaFiles: () => void;
}

/**
 * Media Library Store
 *
 * This Zustand store manages the state of imported media files in the application.
 * It provides actions for adding, removing, and querying media files.
 *
 * The devtools middleware is enabled for debugging in development.
 */
export const useMediaLibraryStore = create<MediaLibraryState>()(
  devtools(
    (set, get) => ({
      mediaFiles: [],

      addMediaFile: (file: MediaFile) =>
        set(
          (state) => {
            // Check for duplicate file path
            const exists = state.mediaFiles.some((f) => f.filePath === file.filePath);
            if (exists) {
              // Don't add duplicate, return unchanged state
              return state;
            }
            return {
              mediaFiles: [...state.mediaFiles, file],
            };
          },
          false,
          "addMediaFile"
        ),

      removeMediaFile: (id: string) =>
        set(
          (state) => ({
            mediaFiles: state.mediaFiles.filter((file) => file.id !== id),
          }),
          false,
          "removeMediaFile"
        ),

      getMediaFile: (id: string) => {
        const state = get();
        return state.mediaFiles.find((file) => file.id === id);
      },

      hasMediaFile: (filePath: string) => {
        const state = get();
        return state.mediaFiles.some((file) => file.filePath === filePath);
      },

      clearMediaFiles: () =>
        set(
          {
            mediaFiles: [],
          },
          false,
          "clearMediaFiles"
        ),
    }),
    {
      name: "media-library-store",
    }
  )
);
