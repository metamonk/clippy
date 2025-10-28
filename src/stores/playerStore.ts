import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { MediaFile } from "@/types/media";

/**
 * Player state interface
 *
 * Manages video playback state including current video, playback status, and time tracking.
 */
interface PlayerStore {
  /** Currently loaded video file */
  currentVideo: MediaFile | null;

  /** Whether video is currently playing */
  isPlaying: boolean;

  /** Current playback time in seconds */
  currentTime: number;

  /** Total duration in seconds */
  duration: number;

  /** Playhead position on timeline in milliseconds (for timeline synchronization) */
  playheadPosition: number;

  /** Set the current video and reset playback state */
  setCurrentVideo: (video: MediaFile | null) => void;

  /** Toggle play/pause state */
  togglePlayPause: () => void;

  /** Start playback */
  play: () => void;

  /** Pause playback */
  pause: () => void;

  /** Update current playback time */
  setCurrentTime: (time: number) => void;

  /** Update video duration */
  setDuration: (duration: number) => void;

  /** Seek to a specific time in seconds */
  seek: (time: number) => void;

  /** Set playhead position on timeline in milliseconds */
  setPlayheadPosition: (position: number) => void;
}

/**
 * Player store
 *
 * Centralized state management for video playback using Zustand.
 * Tracks current video, playback state, and time information.
 */
export const usePlayerStore = create<PlayerStore>()(
  devtools(
    (set) => ({
      currentVideo: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      playheadPosition: 0,

      setCurrentVideo: (video) =>
        set({
          currentVideo: video,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          playheadPosition: 0,
        }),

      togglePlayPause: () =>
        set((state) => ({
          isPlaying: !state.isPlaying,
        })),

      play: () => set({ isPlaying: true }),

      pause: () => set({ isPlaying: false }),

      setCurrentTime: (time) => set({ currentTime: time }),

      setDuration: (duration) => set({ duration }),

      seek: (time) => set({ currentTime: time }),

      setPlayheadPosition: (position) => set({ playheadPosition: position }),
    }),
    { name: "PlayerStore" }
  )
);
