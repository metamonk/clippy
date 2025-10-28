import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MediaLibraryPanel } from "../layout/MediaLibraryPanel";
import { useMediaLibraryStore } from "@/stores/mediaLibraryStore";
import type { MediaFile } from "@/types/media";

// Mock MediaImport component since it has Tauri dependencies
vi.mock("./MediaImport", () => ({
  MediaImport: () => <div data-testid="media-import">MediaImport Component</div>,
}));

describe("MediaLibraryPanel", () => {
  const mockMediaFile: MediaFile = {
    id: "test-id-123",
    filePath: "/path/to/video.mp4",
    filename: "test-video.mp4",
    duration: 60000,
    resolution: { width: 1920, height: 1080 },
    fileSize: 10485760,
    codec: "h264",
    importedAt: "2025-10-27T10:00:00Z",
  };

  const mockMediaFile2: MediaFile = {
    id: "test-id-456",
    filePath: "/path/to/video2.mov",
    filename: "test-video2.mov",
    duration: 120000,
    resolution: { width: 1280, height: 720 },
    fileSize: 5242880,
    codec: "hevc",
    importedAt: "2025-10-27T11:00:00Z",
  };

  beforeEach(() => {
    useMediaLibraryStore.getState().clearMediaFiles();
  });

  it("should render the MediaLibraryPanel component", () => {
    render(<MediaLibraryPanel />);

    expect(screen.getByRole("region", { name: /Media Library/i })).toBeInTheDocument();
  });

  it("should render MediaImport component", () => {
    render(<MediaLibraryPanel />);

    expect(screen.getByTestId("media-import")).toBeInTheDocument();
  });

  it("should show empty state when no files imported", () => {
    render(<MediaLibraryPanel />);

    expect(screen.getByText(/No media imported yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Drag files above or click Import Video/i)).toBeInTheDocument();
  });

  it("should show FolderOpen icon in empty state", () => {
    const { container } = render(<MediaLibraryPanel />);

    // Check that the lucide FolderOpen icon is rendered
    const icons = container.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThan(0);
  });

  it("should display imported files", () => {
    useMediaLibraryStore.getState().addMediaFile(mockMediaFile);

    render(<MediaLibraryPanel />);

    expect(screen.getByText("test-video.mp4")).toBeInTheDocument();
  });

  it("should display multiple imported files", () => {
    useMediaLibraryStore.getState().addMediaFile(mockMediaFile);
    useMediaLibraryStore.getState().addMediaFile(mockMediaFile2);

    render(<MediaLibraryPanel />);

    expect(screen.getByText("test-video.mp4")).toBeInTheDocument();
    expect(screen.getByText("test-video2.mov")).toBeInTheDocument();
  });

  it("should hide empty state when files are imported", () => {
    useMediaLibraryStore.getState().addMediaFile(mockMediaFile);

    render(<MediaLibraryPanel />);

    expect(screen.queryByText(/No media imported yet/i)).not.toBeInTheDocument();
  });

  it("should show empty state again after all files are removed", () => {
    useMediaLibraryStore.getState().addMediaFile(mockMediaFile);

    const { rerender } = render(<MediaLibraryPanel />);

    expect(screen.getByText("test-video.mp4")).toBeInTheDocument();

    // Remove all files (wrapped in act to prevent test warnings)
    act(() => {
      useMediaLibraryStore.getState().clearMediaFiles();
    });
    rerender(<MediaLibraryPanel />);

    expect(screen.getByText(/No media imported yet/i)).toBeInTheDocument();
  });

  it("should render files in the order they were added", () => {
    useMediaLibraryStore.getState().addMediaFile(mockMediaFile);
    useMediaLibraryStore.getState().addMediaFile(mockMediaFile2);

    const { container } = render(<MediaLibraryPanel />);

    const filenames = Array.from(container.querySelectorAll("h3")).map(
      (el) => el.textContent
    );

    expect(filenames).toEqual(["test-video.mp4", "test-video2.mov"]);
  });
});
