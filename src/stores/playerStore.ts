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

  /** Playback mode: 'preview' for independent playback, 'timeline' for timeline-synchronized playback */
  mode: 'preview' | 'timeline';

  /** Target time for seek operation (triggers MPV seek in VideoPlayer) */
  seekTarget: number | null;

  /** Focus context: tracks last user interaction (library vs timeline) - drives automatic mode switching */
  focusContext: 'source' | 'timeline';

  /** Source video for preview mode (independent of timeline clips) */
  sourceVideo: MediaFile | null;

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

  /** Seek to a specific time in seconds (triggers MPV seek) */
  seek: (time: number) => void;

  /** Clear seek target after seek operation completes */
  clearSeekTarget: () => void;

  /** Set playhead position on timeline in milliseconds */
  setPlayheadPosition: (position: number) => void;

  /** Set playback mode */
  setMode: (mode: 'preview' | 'timeline') => void;

  /** Set focus context (automatically derives mode) */
  setFocusContext: (context: 'source' | 'timeline') => void;
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
      mode: 'preview',
      seekTarget: null,
      focusContext: 'source',
      sourceVideo: null,

      setCurrentVideo: (video) =>
        set((state) => ({
          currentVideo: video,
          sourceVideo: video,
          focusContext: 'source',
          mode: 'preview',
          isPlaying: false,
          currentTime: 0,
          // Only reset duration if we're actually changing videos
          duration: video?.id === state.currentVideo?.id ? state.duration : 0,
          playheadPosition: 0,
          seekTarget: null,
        })),

      togglePlayPause: () =>
        set((state) => ({
          isPlaying: !state.isPlaying,
        })),

      play: () => set({ isPlaying: true }),

      pause: () => set({ isPlaying: false }),

      setCurrentTime: (time) => set({ currentTime: time }),

      setDuration: (duration) => set({ duration }),

      seek: (time) => set({ seekTarget: time, currentTime: time }),

      clearSeekTarget: () => set({ seekTarget: null }),

      setPlayheadPosition: (position) => set({ playheadPosition: position }),

      setMode: (mode) => set({ mode }),

      setFocusContext: (context) =>
        set({
          focusContext: context,
          mode: context === 'source' ? 'preview' : 'timeline',
        }),
    }),
    { name: "PlayerStore" }
  )
);
