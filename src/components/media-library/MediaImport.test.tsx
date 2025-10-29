import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MediaImport } from "./MediaImport";
import { useMediaLibraryStore } from "@/stores/mediaLibraryStore";
import * as tauriDialog from "@tauri-apps/plugin-dialog";
import * as tauriMedia from "@/lib/tauri/media";
import { toast } from "sonner";

// Mock Tauri modules
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@/lib/tauri/media", () => ({
  importMedia: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("MediaImport", () => {
  const mockMediaFile = {
    id: "test-id-123",
    filePath: "/path/to/video.mp4",
    filename: "video.mp4",
    duration: 60000,
    resolution: { width: 1920, height: 1080 },
    fileSize: 10485760,
    codec: "h264",
    importedAt: "2025-10-27T10:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useMediaLibraryStore.getState().clearMediaFiles();
  });

  it("should render the MediaImport component", () => {
    render(<MediaImport />);

    expect(screen.getByText(/Drag & drop video files here/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import Video/i })).toBeInTheDocument();
  });

  it("should display Upload icon", () => {
    const { container } = render(<MediaImport />);

    // Check that the lucide Upload icon is rendered
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it("should show supported formats message", () => {
    render(<MediaImport />);

    expect(screen.getByText(/Supports MP4, MOV, and WebM files/i)).toBeInTheDocument();
  });

  it("should open file picker when button is clicked", async () => {
    const mockOpen = vi.mocked(tauriDialog.open);
    mockOpen.mockResolvedValue(null);

    render(<MediaImport />);

    const button = screen.getByRole("button", { name: /Import Video/i });
    await userEvent.click(button);

    expect(mockOpen).toHaveBeenCalledWith({
      multiple: true,
      filters: [
        {
          name: "Video",
          extensions: ["mp4", "mov", "webm"],
        },
      ],
    });
  });

  it("should call importMedia when file picker returns files", async () => {
    const mockOpen = vi.mocked(tauriDialog.open);
    const mockImportMedia = vi.mocked(tauriMedia.importMedia);

    mockOpen.mockResolvedValue(["/path/to/video.mp4"]);
    mockImportMedia.mockResolvedValue(mockMediaFile);

    render(<MediaImport />);

    const button = screen.getByRole("button", { name: /Import Video/i });
    await userEvent.click(button);

    // Wait for async operations
    await vi.waitFor(() => {
      expect(mockImportMedia).toHaveBeenCalledWith("/path/to/video.mp4");
    });
  });

  it("should add imported file to store on success", async () => {
    const mockOpen = vi.mocked(tauriDialog.open);
    const mockImportMedia = vi.mocked(tauriMedia.importMedia);

    mockOpen.mockResolvedValue(["/path/to/video.mp4"]);
    mockImportMedia.mockResolvedValue(mockMediaFile);

    render(<MediaImport />);

    const button = screen.getByRole("button", { name: /Import Video/i });
    await userEvent.click(button);

    // Wait for async operations
    await vi.waitFor(() => {
      const state = useMediaLibraryStore.getState();
      expect(state.mediaFiles).toHaveLength(1);
      expect(state.mediaFiles[0]).toEqual(mockMediaFile);
    });
  });

  it("should show success toast on successful import", async () => {
    const mockOpen = vi.mocked(tauriDialog.open);
    const mockImportMedia = vi.mocked(tauriMedia.importMedia);
    const mockToast = vi.mocked(toast);

    mockOpen.mockResolvedValue(["/path/to/video.mp4"]);
    mockImportMedia.mockResolvedValue(mockMediaFile);

    render(<MediaImport />);

    const button = screen.getByRole("button", { name: /Import Video/i });
    await userEvent.click(button);

    // Wait for async operations - now shows batch-level success message
    await vi.waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("Successfully imported 1 file");
    });
  });

  it("should show error toast when import fails", async () => {
    const mockOpen = vi.mocked(tauriDialog.open);
    const mockImportMedia = vi.mocked(tauriMedia.importMedia);
    const mockToast = vi.mocked(toast);

    mockOpen.mockResolvedValue(["/path/to/video.mp4"]);
    mockImportMedia.mockRejectedValue(new Error("Failed to extract metadata"));

    render(<MediaImport />);

    const button = screen.getByRole("button", { name: /Import Video/i });
    await userEvent.click(button);

    // Wait for async operations - now shows batch-level error with description
    await vi.waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        "Failed to import 1 file",
        expect.objectContaining({
          description: expect.stringContaining("video.mp4: Failed to extract metadata")
        })
      );
    });
  });

  it("should show error toast for unsupported file format", async () => {
    const mockOpen = vi.mocked(tauriDialog.open);
    const mockToast = vi.mocked(toast);

    mockOpen.mockResolvedValue(["/path/to/video.avi"]);

    render(<MediaImport />);

    const button = screen.getByRole("button", { name: /Import Video/i });
    await userEvent.click(button);

    // Wait for async operations - now shows batch-level error with description
    await vi.waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        "Failed to import 1 file",
        expect.objectContaining({
          description: expect.stringContaining("Unsupported format")
        })
      );
    });
  });

  it("should be keyboard accessible - Enter key triggers file picker", async () => {
    const mockOpen = vi.mocked(tauriDialog.open);
    mockOpen.mockResolvedValue(null);

    render(<MediaImport />);

    const dropZone = screen.getByRole("button", { name: /Drag and drop video files here/i });
    dropZone.focus();
    fireEvent.keyDown(dropZone, { key: "Enter" });

    await vi.waitFor(() => {
      expect(mockOpen).toHaveBeenCalled();
    });
  });

  it("should be keyboard accessible - Space key triggers file picker", async () => {
    const mockOpen = vi.mocked(tauriDialog.open);
    mockOpen.mockResolvedValue(null);

    render(<MediaImport />);

    const dropZone = screen.getByRole("button", { name: /Drag and drop video files here/i });
    dropZone.focus();
    fireEvent.keyDown(dropZone, { key: " " });

    await vi.waitFor(() => {
      expect(mockOpen).toHaveBeenCalled();
    });
  });

  it("should show dragging state when dragging over", () => {
    render(<MediaImport />);

    const dropZone = screen.getByRole("button", { name: /Drag and drop video files here/i });

    fireEvent.dragOver(dropZone);

    expect(screen.getByText(/Drop your video files here/i)).toBeInTheDocument();
  });

  it("should handle multiple files from file picker", async () => {
    const mockOpen = vi.mocked(tauriDialog.open);
    const mockImportMedia = vi.mocked(tauriMedia.importMedia);

    mockOpen.mockResolvedValue(["/path/to/video1.mp4", "/path/to/video2.mov"]);
    mockImportMedia
      .mockResolvedValueOnce(mockMediaFile)
      .mockResolvedValueOnce({
        ...mockMediaFile,
        id: "test-id-456",
        filename: "video2.mov",
      });

    render(<MediaImport />);

    const button = screen.getByRole("button", { name: /Import Video/i });
    await userEvent.click(button);

    // Wait for async operations
    await vi.waitFor(() => {
      expect(mockImportMedia).toHaveBeenCalledTimes(2);
      expect(mockImportMedia).toHaveBeenCalledWith("/path/to/video1.mp4");
      expect(mockImportMedia).toHaveBeenCalledWith("/path/to/video2.mov");
    });
  });
});
