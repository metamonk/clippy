import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { VideoPlayer } from "./VideoPlayer";
import { usePlayerStore } from "@/stores/playerStore";

// Mock Video.js
vi.mock("video.js", () => {
  const mockPlayer = {
    on: vi.fn(),
    src: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    dispose: vi.fn(),
    currentTime: vi.fn().mockReturnValue(0),
    duration: vi.fn().mockReturnValue(120),
    error: vi.fn().mockReturnValue(null),
  };

  return {
    default: vi.fn(() => mockPlayer),
  };
});

describe("VideoPlayer", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    usePlayerStore.setState({
      currentVideo: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playheadPosition: 0,
    });
  });

  it("should render video element with correct class names", () => {
    const { container } = render(<VideoPlayer src="/test/video.mp4" />);

    const videoElement = container.querySelector("video");
    expect(videoElement).toBeTruthy();
    expect(videoElement?.className).toContain("video-js");
    expect(videoElement?.className).toContain("vjs-theme-fantasy");
    expect(videoElement?.className).toContain("vjs-big-play-centered");
  });

  it("should render video wrapper with data-vjs-player attribute", () => {
    const { container } = render(<VideoPlayer src="/test/video.mp4" />);

    const wrapper = container.querySelector('[data-vjs-player]');
    expect(wrapper).toBeTruthy();
  });

  it("should initialize Video.js instance on mount", async () => {
    const videojs = await import("video.js");
    render(<VideoPlayer src="/test/video.mp4" />);

    expect(videojs.default).toHaveBeenCalled();
  });

  it("should call onReady callback when player is ready", async () => {
    const onReady = vi.fn();
    render(<VideoPlayer src="/test/video.mp4" onReady={onReady} />);

    // Wait for useEffect to run
    await vi.waitFor(() => {
      expect(onReady).toHaveBeenCalled();
    });
  });

  it("should apply Video.js configuration options", async () => {
    const videojs = await import("video.js");
    render(<VideoPlayer src="/test/video.mp4" />);

    expect(videojs.default).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        controls: true,
        fluid: true,
        responsive: true,
        preload: "auto",
        autoplay: false,
        html5: {
          nativeVideoTracks: true,
          nativeAudioTracks: true,
          nativeTextTracks: true,
        },
      })
    );
  });
});
