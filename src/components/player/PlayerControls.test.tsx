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
      duration: 0,
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
});
