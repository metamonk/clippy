import { describe, it, expect, beforeEach } from "vitest";
import { usePlayerStore } from "./playerStore";
import type { MediaFile } from "@/types/media";

describe("playerStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    usePlayerStore.setState({
      currentVideo: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playheadPosition: 0,
      mode: 'preview',
      seekTarget: null,
    });
  });

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

  describe("setCurrentVideo", () => {
    it("should set current video and reset playback state", () => {
      const { setCurrentVideo } = usePlayerStore.getState();

      setCurrentVideo(mockMediaFile);

      const state = usePlayerStore.getState();
      expect(state.currentVideo).toBe(mockMediaFile);
      expect(state.isPlaying).toBe(false);
      expect(state.currentTime).toBe(0);
      expect(state.duration).toBe(0);
    });

    it("should reset state when setting video to null", () => {
      const { setCurrentVideo } = usePlayerStore.getState();

      // First set a video
      setCurrentVideo(mockMediaFile);
      usePlayerStore.setState({ isPlaying: true, currentTime: 10 });

      // Then clear it
      setCurrentVideo(null);

      const state = usePlayerStore.getState();
      expect(state.currentVideo).toBe(null);
      expect(state.isPlaying).toBe(false);
      expect(state.currentTime).toBe(0);
      expect(state.duration).toBe(0);
    });
  });

  describe("togglePlayPause", () => {
    it("should toggle isPlaying from false to true", () => {
      const { togglePlayPause } = usePlayerStore.getState();

      togglePlayPause();

      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    it("should toggle isPlaying from true to false", () => {
      const { togglePlayPause } = usePlayerStore.getState();

      usePlayerStore.setState({ isPlaying: true });
      togglePlayPause();

      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    it("should toggle multiple times correctly", () => {
      const { togglePlayPause } = usePlayerStore.getState();

      togglePlayPause();
      expect(usePlayerStore.getState().isPlaying).toBe(true);

      togglePlayPause();
      expect(usePlayerStore.getState().isPlaying).toBe(false);

      togglePlayPause();
      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });
  });

  describe("setCurrentTime", () => {
    it("should update current time", () => {
      const { setCurrentTime } = usePlayerStore.getState();

      setCurrentTime(42.5);

      expect(usePlayerStore.getState().currentTime).toBe(42.5);
    });

    it("should update current time multiple times", () => {
      const { setCurrentTime } = usePlayerStore.getState();

      setCurrentTime(10);
      expect(usePlayerStore.getState().currentTime).toBe(10);

      setCurrentTime(20);
      expect(usePlayerStore.getState().currentTime).toBe(20);
    });
  });

  describe("setDuration", () => {
    it("should update duration", () => {
      const { setDuration } = usePlayerStore.getState();

      setDuration(180.5);

      expect(usePlayerStore.getState().duration).toBe(180.5);
    });
  });

  describe("seek", () => {
    it("should update current time when seeking", () => {
      const { seek } = usePlayerStore.getState();

      seek(60);

      expect(usePlayerStore.getState().currentTime).toBe(60);
    });

    it("should allow seeking to different positions", () => {
      const { seek } = usePlayerStore.getState();

      seek(30);
      expect(usePlayerStore.getState().currentTime).toBe(30);

      seek(90);
      expect(usePlayerStore.getState().currentTime).toBe(90);
    });

    it("should set seekTarget to trigger MPV seek", () => {
      const { seek } = usePlayerStore.getState();

      seek(45.5);

      const state = usePlayerStore.getState();
      expect(state.seekTarget).toBe(45.5);
      expect(state.currentTime).toBe(45.5);
    });

    it("should update seekTarget on multiple seeks", () => {
      const { seek } = usePlayerStore.getState();

      seek(10);
      expect(usePlayerStore.getState().seekTarget).toBe(10);

      seek(20);
      expect(usePlayerStore.getState().seekTarget).toBe(20);
    });
  });

  describe("clearSeekTarget", () => {
    it("should clear seekTarget after seek operation", () => {
      const { seek, clearSeekTarget } = usePlayerStore.getState();

      seek(75);
      expect(usePlayerStore.getState().seekTarget).toBe(75);

      clearSeekTarget();
      expect(usePlayerStore.getState().seekTarget).toBe(null);
    });

    it("should not affect currentTime when clearing seekTarget", () => {
      const { seek, clearSeekTarget } = usePlayerStore.getState();

      seek(50);
      expect(usePlayerStore.getState().currentTime).toBe(50);

      clearSeekTarget();
      expect(usePlayerStore.getState().currentTime).toBe(50);
      expect(usePlayerStore.getState().seekTarget).toBe(null);
    });
  });

  describe("play", () => {
    it("should set isPlaying to true", () => {
      const { play } = usePlayerStore.getState();

      play();

      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    it("should set isPlaying to true even if already playing", () => {
      const { play } = usePlayerStore.getState();

      usePlayerStore.setState({ isPlaying: true });
      play();

      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });
  });

  describe("pause", () => {
    it("should set isPlaying to false", () => {
      const { pause } = usePlayerStore.getState();

      usePlayerStore.setState({ isPlaying: true });
      pause();

      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    it("should set isPlaying to false even if already paused", () => {
      const { pause } = usePlayerStore.getState();

      pause();

      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });
  });

  describe("setPlayheadPosition", () => {
    it("should update playhead position", () => {
      const { setPlayheadPosition } = usePlayerStore.getState();

      setPlayheadPosition(5000);

      expect(usePlayerStore.getState().playheadPosition).toBe(5000);
    });

    it("should update playhead position multiple times", () => {
      const { setPlayheadPosition } = usePlayerStore.getState();

      setPlayheadPosition(1000);
      expect(usePlayerStore.getState().playheadPosition).toBe(1000);

      setPlayheadPosition(2500);
      expect(usePlayerStore.getState().playheadPosition).toBe(2500);

      setPlayheadPosition(0);
      expect(usePlayerStore.getState().playheadPosition).toBe(0);
    });
  });

  describe("setCurrentVideo - playhead reset", () => {
    it("should reset playhead position when setting new video", () => {
      const { setCurrentVideo, setPlayheadPosition } = usePlayerStore.getState();

      // Set playhead to some position
      setPlayheadPosition(5000);
      expect(usePlayerStore.getState().playheadPosition).toBe(5000);

      // Set new video - should reset playhead
      setCurrentVideo(mockMediaFile);

      expect(usePlayerStore.getState().playheadPosition).toBe(0);
    });
  });
});
