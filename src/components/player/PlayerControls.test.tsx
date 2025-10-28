import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { PlayerControls } from "./PlayerControls";
import { usePlayerStore } from "@/stores/playerStore";

describe("PlayerControls", () => {
  beforeEach(() => {
    cleanup();
    usePlayerStore.setState({
      currentVideo: null,
      isPlaying: false,
      currentTime: 0,
      duration: 100,
      mode: 'preview',
      seekTarget: null,
    });
  });

  it("should render play button when not playing", () => {
    render(<PlayerControls />);

    const playButton = screen.getByLabelText("Play");
    expect(playButton).toBeTruthy();
  });

  it("should render pause button when playing", () => {
    usePlayerStore.setState({ isPlaying: true });
    render(<PlayerControls />);

    const pauseButton = screen.getByLabelText("Pause");
    expect(pauseButton).toBeTruthy();
  });

  it("should display formatted current time", () => {
    usePlayerStore.setState({ currentTime: 65 });
    render(<PlayerControls />);

    expect(screen.getByText("1:05")).toBeTruthy();
  });

  it("should display formatted duration", () => {
    usePlayerStore.setState({ duration: 180 });
    render(<PlayerControls />);

    expect(screen.getByText("3:00")).toBeTruthy();
  });

  it("should display time in MM:SS format", () => {
    usePlayerStore.setState({ currentTime: 42, duration: 120 });
    render(<PlayerControls />);

    expect(screen.getByText("0:42")).toBeTruthy();
    expect(screen.getByText("2:00")).toBeTruthy();
  });

  it("should call togglePlayPause when play button is clicked", async () => {
    const user = userEvent.setup();
    const togglePlayPause = vi.fn();
    usePlayerStore.setState({
      isPlaying: false,
      togglePlayPause,
    } as any);

    render(<PlayerControls />);

    const playButton = screen.getByLabelText("Play");
    await user.click(playButton);

    expect(togglePlayPause).toHaveBeenCalled();
  });

  it("should call togglePlayPause when pause button is clicked", async () => {
    const user = userEvent.setup();
    const togglePlayPause = vi.fn();
    usePlayerStore.setState({
      isPlaying: true,
      togglePlayPause,
    } as any);

    render(<PlayerControls />);

    const pauseButton = screen.getByLabelText("Pause");
    await user.click(pauseButton);

    expect(togglePlayPause).toHaveBeenCalled();
  });

  it("should toggle playback on Space bar press", async () => {
    const user = userEvent.setup();
    const togglePlayPause = vi.fn();
    usePlayerStore.setState({
      isPlaying: false,
      togglePlayPause,
    } as any);

    render(<PlayerControls />);

    // Simulate Space bar press
    await user.keyboard(" ");

    expect(togglePlayPause).toHaveBeenCalled();
  });

  it("should not toggle playback when Space is pressed on input", async () => {
    const user = userEvent.setup();
    const togglePlayPause = vi.fn();
    usePlayerStore.setState({
      isPlaying: false,
      togglePlayPause,
    } as any);

    render(
      <div>
        <input type="text" data-testid="input" />
        <PlayerControls />
      </div>
    );

    const input = screen.getByTestId("input");
    await user.click(input);
    await user.keyboard(" ");

    expect(togglePlayPause).not.toHaveBeenCalled();
  });

  describe("Slider and Seek Controls", () => {
    it("should render progress slider", () => {
      render(<PlayerControls />);
      const slider = screen.getByRole("slider");
      expect(slider).toBeTruthy();
    });

    it("should render restart button", () => {
      render(<PlayerControls />);
      const restartButton = screen.getByLabelText("Restart");
      expect(restartButton).toBeTruthy();
    });

    it("should call seek when restart button is clicked", async () => {
      const user = userEvent.setup();
      const seek = vi.fn();
      usePlayerStore.setState({ seek, isPlaying: false } as any);

      render(<PlayerControls />);
      const restartButton = screen.getByLabelText("Restart");
      await user.click(restartButton);

      expect(seek).toHaveBeenCalledWith(0);
    });

    it("should pause video when restart button is clicked while playing", async () => {
      const user = userEvent.setup();
      const seek = vi.fn();
      const togglePlayPause = vi.fn();
      usePlayerStore.setState({
        seek,
        togglePlayPause,
        isPlaying: true
      } as any);

      render(<PlayerControls />);
      const restartButton = screen.getByLabelText("Restart");
      await user.click(restartButton);

      expect(seek).toHaveBeenCalledWith(0);
      expect(togglePlayPause).toHaveBeenCalled();
    });

    it("should not pause video when restart button is clicked while already paused", async () => {
      const user = userEvent.setup();
      const seek = vi.fn();
      const togglePlayPause = vi.fn();
      usePlayerStore.setState({
        seek,
        togglePlayPause,
        isPlaying: false
      } as any);

      render(<PlayerControls />);
      const restartButton = screen.getByLabelText("Restart");
      await user.click(restartButton);

      expect(seek).toHaveBeenCalledWith(0);
      expect(togglePlayPause).not.toHaveBeenCalled();
    });

    it("should display slider with correct progress value", () => {
      usePlayerStore.setState({ currentTime: 50, duration: 100 });
      render(<PlayerControls />);

      const slider = screen.getByRole("slider");
      expect(slider.getAttribute("aria-valuenow")).toBe("50");
    });
  });

  describe("Keyboard Shortcuts for Seeking", () => {
    it("should seek backward 5s on Left Arrow", async () => {
      const user = userEvent.setup();
      const seek = vi.fn();
      usePlayerStore.setState({
        currentTime: 30,
        duration: 100,
        seek
      } as any);

      render(<PlayerControls />);
      await user.keyboard("{ArrowLeft}");

      expect(seek).toHaveBeenCalledWith(25);
    });

    it("should seek forward 5s on Right Arrow", async () => {
      const user = userEvent.setup();
      const seek = vi.fn();
      usePlayerStore.setState({
        currentTime: 30,
        duration: 100,
        seek
      } as any);

      render(<PlayerControls />);
      await user.keyboard("{ArrowRight}");

      expect(seek).toHaveBeenCalledWith(35);
    });

    it("should seek to start on Home key", async () => {
      const user = userEvent.setup();
      const seek = vi.fn();
      usePlayerStore.setState({
        currentTime: 50,
        duration: 100,
        seek
      } as any);

      render(<PlayerControls />);
      await user.keyboard("{Home}");

      expect(seek).toHaveBeenCalledWith(0);
    });

    it("should seek to end on End key", async () => {
      const user = userEvent.setup();
      const seek = vi.fn();
      usePlayerStore.setState({
        currentTime: 50,
        duration: 100,
        seek
      } as any);

      render(<PlayerControls />);
      await user.keyboard("{End}");

      expect(seek).toHaveBeenCalledWith(100);
    });

    it("should not seek below 0 on Left Arrow", async () => {
      const user = userEvent.setup();
      const seek = vi.fn();
      usePlayerStore.setState({
        currentTime: 2,
        duration: 100,
        seek
      } as any);

      render(<PlayerControls />);
      await user.keyboard("{ArrowLeft}");

      expect(seek).toHaveBeenCalledWith(0);
    });

    it("should not seek beyond duration on Right Arrow", async () => {
      const user = userEvent.setup();
      const seek = vi.fn();
      usePlayerStore.setState({
        currentTime: 98,
        duration: 100,
        seek
      } as any);

      render(<PlayerControls />);
      await user.keyboard("{ArrowRight}");

      expect(seek).toHaveBeenCalledWith(100);
    });

    it("should seek frame backward on Shift+Left Arrow", async () => {
      const user = userEvent.setup();
      const seek = vi.fn();
      usePlayerStore.setState({
        currentTime: 10,
        duration: 100,
        seek
      } as any);

      render(<PlayerControls />);
      await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");

      // Frame backward = 1/30s ≈ 0.0333s
      const expectedTime = 10 - 1/30;
      expect(seek).toHaveBeenCalled();
      const calledWith = seek.mock.calls[0][0];
      expect(Math.abs(calledWith - expectedTime)).toBeLessThan(0.001);
    });

    it("should seek frame forward on Shift+Right Arrow", async () => {
      const user = userEvent.setup();
      const seek = vi.fn();
      usePlayerStore.setState({
        currentTime: 10,
        duration: 100,
        seek
      } as any);

      render(<PlayerControls />);
      await user.keyboard("{Shift>}{ArrowRight}{/Shift}");

      // Frame forward = 1/30s ≈ 0.0333s
      const expectedTime = 10 + 1/30;
      expect(seek).toHaveBeenCalled();
      const calledWith = seek.mock.calls[0][0];
      expect(Math.abs(calledWith - expectedTime)).toBeLessThan(0.001);
    });

    it("should not trigger seek shortcuts when input is focused", async () => {
      const user = userEvent.setup();
      const seek = vi.fn();
      usePlayerStore.setState({
        currentTime: 50,
        duration: 100,
        seek
      } as any);

      render(
        <div>
          <input type="text" data-testid="input" />
          <PlayerControls />
        </div>
      );

      const input = screen.getByTestId("input");
      await user.click(input);
      await user.keyboard("{ArrowLeft}");

      expect(seek).not.toHaveBeenCalled();
    });
  });
});
