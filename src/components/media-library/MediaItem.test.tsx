import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MediaItem } from "./MediaItem";
import { usePlayerStore } from "@/stores/playerStore";
import { useMediaLibraryStore } from "@/stores/mediaLibraryStore";
import type { MediaFile } from "@/types/media";

describe("MediaItem", () => {
  const mockMediaFile: MediaFile = {
    id: "test-id-123",
    filePath: "/path/to/video.mp4",
    filename: "test-video.mp4",
    duration: 125000, // 2:05
    resolution: { width: 1920, height: 1080 },
    fileSize: 10485760, // 10 MB
    codec: "h264",
    thumbnail: "data:image/png;base64,iVBORw0KGgoAAAANS",
    importedAt: "2025-10-27T10:00:00Z",
  };

  const mockMediaFileWithoutThumbnail: MediaFile = {
    ...mockMediaFile,
    thumbnail: undefined,
  };

  beforeEach(() => {
    cleanup();
    usePlayerStore.setState({
      currentVideo: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    });
  });

  it("should render the MediaItem component", () => {
    render(<MediaItem mediaFile={mockMediaFile} />);

    // Check that filename is displayed
    expect(screen.getByText("test-video.mp4")).toBeInTheDocument();
  });

  it("should display formatted duration in MM:SS", () => {
    render(<MediaItem mediaFile={mockMediaFile} />);

    // 125000ms = 125 seconds = 2:05
    expect(screen.getByText("2:05")).toBeInTheDocument();
  });

  it("should display resolution", () => {
    render(<MediaItem mediaFile={mockMediaFile} />);

    expect(screen.getByText("1920x1080")).toBeInTheDocument();
  });

  it("should display formatted file size in MB", () => {
    render(<MediaItem mediaFile={mockMediaFile} />);

    // 10485760 bytes = 10 MB
    expect(screen.getByText("10.00 MB")).toBeInTheDocument();
  });

  it("should display thumbnail instead of placeholder Film icon", () => {
    render(<MediaItem mediaFile={mockMediaFile} />);

    // Check that the thumbnail image is rendered instead of Film icon
    const img = screen.getByAltText("Thumbnail for test-video.mp4");
    expect(img).toBeInTheDocument();
  });

  it("should format duration correctly for zero seconds", () => {
    const fileWithZeroDuration: MediaFile = {
      ...mockMediaFile,
      duration: 0,
    };

    render(<MediaItem mediaFile={fileWithZeroDuration} />);

    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  it("should format duration correctly for exactly one minute", () => {
    const fileWithOneMinute: MediaFile = {
      ...mockMediaFile,
      duration: 60000, // 60 seconds = 1:00
    };

    render(<MediaItem mediaFile={fileWithOneMinute} />);

    expect(screen.getByText("1:00")).toBeInTheDocument();
  });

  it("should format file size correctly for small files", () => {
    const smallFile: MediaFile = {
      ...mockMediaFile,
      fileSize: 1048576, // 1 MB
    };

    render(<MediaItem mediaFile={smallFile} />);

    expect(screen.getByText("1.00 MB")).toBeInTheDocument();
  });

  it("should format file size correctly for large files", () => {
    const largeFile: MediaFile = {
      ...mockMediaFile,
      fileSize: 1073741824, // 1024 MB = 1 GB
    };

    render(<MediaItem mediaFile={largeFile} />);

    expect(screen.getByText("1024.00 MB")).toBeInTheDocument();
  });

  it("should call setCurrentVideo when clicked", async () => {
    const user = userEvent.setup();
    render(<MediaItem mediaFile={mockMediaFile} />);

    const mediaItem = screen.getByRole("button", {
      name: `Load video ${mockMediaFile.filename}`,
    });
    await user.click(mediaItem);

    const state = usePlayerStore.getState();
    expect(state.currentVideo).toEqual(mockMediaFile);
  });

  it("should highlight when selected", () => {
    usePlayerStore.setState({ currentVideo: mockMediaFile });
    const { container } = render(<MediaItem mediaFile={mockMediaFile} />);

    const mediaItem = container.firstChild as HTMLElement;
    expect(mediaItem).toHaveClass("border-blue-500");
    expect(mediaItem).toHaveClass("bg-blue-50");
  });

  it("should not highlight when not selected", () => {
    const { container } = render(<MediaItem mediaFile={mockMediaFile} />);

    const mediaItem = container.firstChild as HTMLElement;
    expect(mediaItem).toHaveClass("border-gray-200");
    expect(mediaItem).toHaveClass("bg-white");
  });

  it("should support keyboard navigation with Enter key", async () => {
    const user = userEvent.setup();
    render(<MediaItem mediaFile={mockMediaFile} />);

    const mediaItem = screen.getByRole("button", {
      name: `Load video ${mockMediaFile.filename}`,
    });
    mediaItem.focus();
    await user.keyboard("{Enter}");

    const state = usePlayerStore.getState();
    expect(state.currentVideo).toEqual(mockMediaFile);
  });

  it("should support keyboard navigation with Space key", async () => {
    const user = userEvent.setup();
    render(<MediaItem mediaFile={mockMediaFile} />);

    const mediaItem = screen.getByRole("button", {
      name: `Load video ${mockMediaFile.filename}`,
    });
    mediaItem.focus();
    await user.keyboard(" ");

    const state = usePlayerStore.getState();
    expect(state.currentVideo).toEqual(mockMediaFile);
  });

  // Thumbnail tests
  it("should display thumbnail when available", () => {
    render(<MediaItem mediaFile={mockMediaFile} />);

    const img = screen.getByAltText("Thumbnail for test-video.mp4");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toBe(mockMediaFile.thumbnail);
  });

  it("should fall back to Film icon when thumbnail is missing", () => {
    const { container } = render(
      <MediaItem mediaFile={mockMediaFileWithoutThumbnail} />
    );

    // Film icon should be visible
    const filmIcon = container.querySelector("svg");
    expect(filmIcon).toBeInTheDocument();

    // No img element with thumbnail should be present
    const img = screen.queryByAltText("Thumbnail for test-video.mp4");
    expect(img).not.toBeInTheDocument();
  });

  // Delete functionality tests
  it("should show delete button", () => {
    render(<MediaItem mediaFile={mockMediaFile} />);

    const deleteButton = screen.getByLabelText("Delete video");
    expect(deleteButton).toBeInTheDocument();
  });

  it("should show confirmation dialog when delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<MediaItem mediaFile={mockMediaFile} />);

    const deleteButton = screen.getByLabelText("Delete video");
    await user.click(deleteButton);

    expect(screen.getByText("Delete video?")).toBeInTheDocument();
    expect(
      screen.getByText(/This will remove "test-video.mp4"/)
    ).toBeInTheDocument();
  });

  it("should call removeMediaFile when delete is confirmed", async () => {
    const user = userEvent.setup();
    render(<MediaItem mediaFile={mockMediaFile} />);

    // Click delete button
    const deleteButton = screen.getByLabelText("Delete video");
    await user.click(deleteButton);

    // Confirm deletion
    const confirmButton = screen.getByRole("button", { name: /^Delete$/i });
    await user.click(confirmButton);

    const state = useMediaLibraryStore.getState();
    // Check if removeMediaFile was called (indirectly by checking if file was removed from store)
    expect(state.mediaFiles.find((f) => f.id === "test-id-123")).toBeUndefined();
  });

  it("should clear player when deleting current video", async () => {
    const user = userEvent.setup();

    usePlayerStore.setState({ currentVideo: mockMediaFile });
    render(<MediaItem mediaFile={mockMediaFile} />);

    // Click delete button
    const deleteButton = screen.getByLabelText("Delete video");
    await user.click(deleteButton);

    // Confirm deletion
    const confirmButton = screen.getByRole("button", { name: /^Delete$/i });
    await user.click(confirmButton);

    const state = usePlayerStore.getState();
    expect(state.currentVideo).toBeNull();
  });

  it("should not delete when cancel is clicked", async () => {
    const user = userEvent.setup();

    // Initialize store with the media file
    useMediaLibraryStore.setState({ mediaFiles: [mockMediaFile] });

    render(<MediaItem mediaFile={mockMediaFile} />);

    // Click delete button
    const deleteButton = screen.getByLabelText("Delete video");
    await user.click(deleteButton);

    // Cancel deletion
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    const state = useMediaLibraryStore.getState();
    expect(state.mediaFiles).toContainEqual(mockMediaFile);
  });

  it("should show delete dialog with Delete key", async () => {
    const user = userEvent.setup();
    render(<MediaItem mediaFile={mockMediaFile} />);

    const mediaItem = screen.getByRole("button", {
      name: `Load video ${mockMediaFile.filename}`,
    });
    mediaItem.focus();

    await user.keyboard("{Delete}");

    expect(screen.getByText("Delete video?")).toBeInTheDocument();
  });
});
