import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PreviewPanel } from "./PreviewPanel";
import { usePlayerStore } from "@/stores/playerStore";
import type { MediaFile } from "@/types/media";

// Mock VideoPlayer and PlayerControls
vi.mock("@/components/player/VideoPlayer", () => ({
  VideoPlayer: ({ src }: { src: string }) => (
    <div data-testid="video-player">{src}</div>
  ),
}));

vi.mock("@/components/player/PlayerControls", () => ({
  PlayerControls: () => <div data-testid="player-controls">Controls</div>,
}));

describe("PreviewPanel", () => {
  const mockMediaFile: MediaFile = {
    id: "test-id-123",
    filePath: "/path/to/video.mp4",
    filename: "video.mp4",
    duration: 120000,
    resolution: { width: 1920, height: 1080 },
    fileSize: 10485760,
    codec: "h264",
    importedAt: "2025-10-27T00:00:00Z",
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

  it("displays correct empty state text", () => {
    render(<PreviewPanel />);

    expect(
      screen.getByText(/no video loaded.*select a file/i)
    ).toBeInTheDocument();
  });

  it("has correct macOS styling classes", () => {
    const { container } = render(<PreviewPanel />);
    const panel = container.firstChild as HTMLElement;

    expect(panel).toHaveClass("bg-gray-50");
    expect(panel).toHaveClass("rounded-lg");
    expect(panel).toHaveClass("shadow-sm");
  });

  it("has correct height proportion (40%)", () => {
    const { container } = render(<PreviewPanel />);
    const panel = container.firstChild as HTMLElement;

    expect(panel).toHaveClass("h-2/5");
  });

  it("is keyboard focusable", () => {
    const { container } = render(<PreviewPanel />);
    const panel = container.firstChild as HTMLElement;

    expect(panel).toHaveAttribute("tabIndex", "0");
  });

  it("has focus ring styles", () => {
    const { container } = render(<PreviewPanel />);
    const panel = container.firstChild as HTMLElement;

    expect(panel).toHaveClass("focus:ring-2");
    expect(panel).toHaveClass("focus:ring-blue-500");
  });

  it("has proper ARIA attributes", () => {
    render(<PreviewPanel />);

    const panel = screen.getByRole("region", { name: "Video Preview" });
    expect(panel).toBeInTheDocument();
  });

  it("should render VideoPlayer when currentVideo is set", () => {
    usePlayerStore.setState({ currentVideo: mockMediaFile });
    render(<PreviewPanel />);

    const videoPlayer = screen.getByTestId("video-player");
    expect(videoPlayer).toBeInTheDocument();
    expect(videoPlayer.textContent).toBe(mockMediaFile.filePath);
  });

  it("should render PlayerControls when currentVideo is set", () => {
    usePlayerStore.setState({ currentVideo: mockMediaFile });
    render(<PreviewPanel />);

    expect(screen.getByTestId("player-controls")).toBeInTheDocument();
  });

  it("should not render VideoPlayer when no video is loaded", () => {
    render(<PreviewPanel />);

    expect(screen.queryByTestId("video-player")).not.toBeInTheDocument();
  });

  it("should not render PlayerControls when no video is loaded", () => {
    render(<PreviewPanel />);

    expect(screen.queryByTestId("player-controls")).not.toBeInTheDocument();
  });
});
