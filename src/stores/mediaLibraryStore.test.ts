import { describe, it, expect, beforeEach } from "vitest";
import { useMediaLibraryStore } from "./mediaLibraryStore";
import type { MediaFile } from "@/types/media";

describe("mediaLibraryStore", () => {
  const mockMediaFile: MediaFile = {
    id: "test-id-123",
    filePath: "/path/to/video.mp4",
    filename: "video.mp4",
    duration: 60000,
    resolution: { width: 1920, height: 1080 },
    fileSize: 10485760,
    codec: "h264",
    importedAt: "2025-10-27T10:00:00Z",
  };

  const mockMediaFile2: MediaFile = {
    id: "test-id-456",
    filePath: "/path/to/video2.mov",
    filename: "video2.mov",
    duration: 120000,
    resolution: { width: 1280, height: 720 },
    fileSize: 5242880,
    codec: "hevc",
    importedAt: "2025-10-27T11:00:00Z",
  };

  beforeEach(() => {
    // Clear the store before each test
    useMediaLibraryStore.getState().clearMediaFiles();
  });

  it("should start with empty mediaFiles array", () => {
    const { mediaFiles } = useMediaLibraryStore.getState();
    expect(mediaFiles).toEqual([]);
  });

  it("should add a media file", () => {
    const { addMediaFile } = useMediaLibraryStore.getState();

    addMediaFile(mockMediaFile);

    const state = useMediaLibraryStore.getState();
    expect(state.mediaFiles).toHaveLength(1);
    expect(state.mediaFiles[0]).toEqual(mockMediaFile);
  });

  it("should add multiple media files", () => {
    const { addMediaFile } = useMediaLibraryStore.getState();

    addMediaFile(mockMediaFile);
    addMediaFile(mockMediaFile2);

    const state = useMediaLibraryStore.getState();
    expect(state.mediaFiles).toHaveLength(2);
    expect(state.mediaFiles[0]).toEqual(mockMediaFile);
    expect(state.mediaFiles[1]).toEqual(mockMediaFile2);
  });

  it("should remove a media file by ID", () => {
    const { addMediaFile, removeMediaFile } = useMediaLibraryStore.getState();

    addMediaFile(mockMediaFile);
    addMediaFile(mockMediaFile2);

    removeMediaFile("test-id-123");

    const state = useMediaLibraryStore.getState();
    expect(state.mediaFiles).toHaveLength(1);
    expect(state.mediaFiles[0].id).toBe("test-id-456");
  });

  it("should not change state when removing non-existent ID", () => {
    const { addMediaFile, removeMediaFile } = useMediaLibraryStore.getState();

    addMediaFile(mockMediaFile);

    removeMediaFile("non-existent-id");

    const state = useMediaLibraryStore.getState();
    expect(state.mediaFiles).toHaveLength(1);
    expect(state.mediaFiles[0]).toEqual(mockMediaFile);
  });

  it("should get a media file by ID", () => {
    const { addMediaFile, getMediaFile } = useMediaLibraryStore.getState();

    addMediaFile(mockMediaFile);
    addMediaFile(mockMediaFile2);

    const file = getMediaFile("test-id-123");

    expect(file).toEqual(mockMediaFile);
  });

  it("should return undefined for non-existent ID", () => {
    const { addMediaFile, getMediaFile } = useMediaLibraryStore.getState();

    addMediaFile(mockMediaFile);

    const file = getMediaFile("non-existent-id");

    expect(file).toBeUndefined();
  });

  it("should clear all media files", () => {
    const { addMediaFile, clearMediaFiles } = useMediaLibraryStore.getState();

    addMediaFile(mockMediaFile);
    addMediaFile(mockMediaFile2);

    clearMediaFiles();

    const state = useMediaLibraryStore.getState();
    expect(state.mediaFiles).toEqual([]);
  });
});
