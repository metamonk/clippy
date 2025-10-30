import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Clip } from '@/types/timeline';
import { useTimelineStore } from './timelineStore';

/**
 * Render state enum for composition playback
 * Tracks the current state of the composition renderer
 */
export enum RenderState {
  idle = 'idle',
  loading = 'loading',
  playing = 'playing',
  paused = 'paused',
  error = 'error',
}

/**
 * Active clip interface with track context
 * Represents a clip that is active at the current composition time
 */
export interface ActiveClip {
  /** The clip object */
  clip: Clip;
  /** Track ID containing this clip */
  trackId: string;
  /** Track number (1-based: Track 1, Track 2, etc.) for z-index ordering */
  trackNumber: number;
  /** Track type (video or audio) */
  trackType: 'video' | 'audio';
  /** Time offset within the clip in milliseconds */
  relativeTime: number;
}

/**
 * Composition state interface
 * Manages timeline composition playback state separate from single-clip preview
 * Following ADR-007: Playback mode architecture with mode separation
 */
export interface CompositionState {
  /** Current composition playback time in milliseconds */
  currentCompositionTime: number;

  /** Array of active clips at current time (multi-track support) */
  activeClips: ActiveClip[];

  /** Track IDs with active clips at current time */
  activeTracks: string[];

  /** Current render state */
  renderState: RenderState;

  /** Next clip boundary time in milliseconds (for optimization) */
  nextBoundaryTime: number | null;

  /** Set current composition time and update active clips */
  setCompositionTime: (time: number) => void;

  /** Get active clips at a specific time */
  getActiveClipsAtTime: (time: number) => ActiveClip[];

  /** Get active audio clips at a specific time (Story 5.5 AC#1) */
  getActiveAudioClips: (time: number) => ActiveClip[];

  /** Update active clips for current time */
  updateActiveClips: (time: number) => void;

  /** Detect if there are gaps (no clips) at given time */
  detectGaps: (time: number) => boolean;

  /** Get next clip boundary time after current time */
  getNextClipBoundary: (currentTime: number) => number | null;

  /** Get clip at specific time on specific track (Story 5.3 AC#1, AC#6) */
  getClipAtTime: (time: number, trackId: string) => Clip | null;

  /** Get next clip after current clip on same track (Story 5.3 AC#1, AC#6) */
  getNextClip: (currentClip: Clip, trackId: string) => Clip | null;

  /** Check if timeline has ended at given time (Story 5.3 AC#7) */
  isEndOfTimeline: (time: number) => boolean;

  /** Set render state */
  setRenderState: (state: RenderState) => void;

  /** Reset composition state to initial values */
  reset: () => void;
}

/**
 * Composition Store
 *
 * Manages composition playback state separate from single-clip preview mode.
 * Following ADR-007: playerStore.mode determines when this state is active.
 * Following ADR-003: Using Zustand with devtools for state management.
 * Following ADR-005: All timestamps in MILLISECONDS.
 *
 * Performance target: State updates must complete in < 16ms (60 FPS - NFR001)
 */
export const useCompositionStore = create<CompositionState>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentCompositionTime: 0,
      activeClips: [],
      activeTracks: [],
      renderState: RenderState.idle,
      nextBoundaryTime: null,

      // Set composition time and update active clips
      setCompositionTime: (time: number) => {
        const startTime = performance.now(); // Performance measurement (AC#8)

        const activeClips = get().getActiveClipsAtTime(time);
        const activeTracks = Array.from(new Set(activeClips.map(ac => ac.trackId)));
        const nextBoundary = get().getNextClipBoundary(time);

        set(
          {
            currentCompositionTime: time,
            activeClips,
            activeTracks,
            nextBoundaryTime: nextBoundary,
          },
          false,
          'setCompositionTime'
        );

        const endTime = performance.now();
        const updateDuration = endTime - startTime;

        // Warning if update exceeds 16ms (60 FPS target - AC#8)
        if (updateDuration > 16) {
          console.warn(
            `⚠️ Composition state update exceeded 16ms target: ${updateDuration.toFixed(2)}ms`
          );
        }
      },

      // Get active clips at a specific time (AC#4, AC#6)
      getActiveClipsAtTime: (time: number): ActiveClip[] => {
        const timelineState = useTimelineStore.getState();
        const activeClips: ActiveClip[] = [];

        // Query all tracks for clips at this time
        for (const track of timelineState.tracks) {
          for (const clip of track.clips) {
            const clipStart = clip.startTime;
            const clipDuration = clip.trimOut - clip.trimIn;
            const clipEnd = clipStart + clipDuration;

            // Inclusive start, exclusive end (AC#4: boundary logic)
            if (time >= clipStart && time < clipEnd) {
              activeClips.push({
                clip,
                trackId: track.id,
                trackNumber: track.trackNumber,
                trackType: track.trackType,
                relativeTime: time - clipStart,
              });
            }
          }
        }

        return activeClips;
      },

      // Get active audio clips at a specific time (Story 5.5 AC#1)
      getActiveAudioClips: (time: number): ActiveClip[] => {
        const allActiveClips = get().getActiveClipsAtTime(time);

        // Filter for audio tracks only
        return allActiveClips.filter(ac => ac.trackType === 'audio');
      },

      // Update active clips for current time (AC#4)
      updateActiveClips: (time: number) => {
        const startTime = performance.now(); // Performance measurement (AC#8)

        const activeClips = get().getActiveClipsAtTime(time);
        const activeTracks = Array.from(new Set(activeClips.map(ac => ac.trackId)));
        const nextBoundary = get().getNextClipBoundary(time);

        set(
          {
            activeClips,
            activeTracks,
            nextBoundaryTime: nextBoundary,
          },
          false,
          'updateActiveClips'
        );

        const endTime = performance.now();
        const updateDuration = endTime - startTime;

        // Warning if update exceeds 16ms (60 FPS target - AC#8)
        if (updateDuration > 16) {
          console.warn(
            `⚠️ Composition state update exceeded 16ms target: ${updateDuration.toFixed(2)}ms`
          );
        }
      },

      // Detect gaps at given time (AC#5)
      detectGaps: (time: number): boolean => {
        const activeClips = get().getActiveClipsAtTime(time);
        return activeClips.length === 0;
      },

      // Get next clip boundary after current time (AC#4)
      getNextClipBoundary: (currentTime: number): number | null => {
        const timelineState = useTimelineStore.getState();
        let earliestBoundary: number | null = null;

        for (const track of timelineState.tracks) {
          for (const clip of track.clips) {
            const clipStart = clip.startTime;
            const clipDuration = clip.trimOut - clip.trimIn;
            const clipEnd = clipStart + clipDuration;

            // Check clip start boundary
            if (clipStart > currentTime) {
              if (earliestBoundary === null || clipStart < earliestBoundary) {
                earliestBoundary = clipStart;
              }
            }

            // Check clip end boundary
            if (clipEnd > currentTime) {
              if (earliestBoundary === null || clipEnd < earliestBoundary) {
                earliestBoundary = clipEnd;
              }
            }
          }
        }

        return earliestBoundary;
      },

      // Get clip at specific time on specific track (Story 5.3 AC#1, AC#6)
      getClipAtTime: (time: number, trackId: string): Clip | null => {
        const timelineState = useTimelineStore.getState();

        // Find the specified track
        const track = timelineState.tracks.find(t => t.id === trackId);
        if (!track) {
          return null;
        }

        // Find clip that contains this time
        for (const clip of track.clips) {
          const clipStart = clip.startTime;
          const clipDuration = clip.trimOut - clip.trimIn;
          const clipEnd = clipStart + clipDuration;

          // Inclusive start, exclusive end (matches existing boundary logic)
          if (time >= clipStart && time < clipEnd) {
            return clip;
          }
        }

        return null;
      },

      // Get next clip after current clip on same track (Story 5.3 AC#1, AC#6)
      getNextClip: (currentClip: Clip, trackId: string): Clip | null => {
        const timelineState = useTimelineStore.getState();

        // Find the specified track
        const track = timelineState.tracks.find(t => t.id === trackId);
        if (!track) {
          return null;
        }

        // Calculate end time of current clip
        const currentClipEnd = currentClip.startTime + (currentClip.trimOut - currentClip.trimIn);

        // Find next clip that starts at or after current clip's end
        // Sort clips by start time to ensure we get the next sequential clip
        const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime);

        for (const clip of sortedClips) {
          if (clip.startTime >= currentClipEnd && clip.id !== currentClip.id) {
            return clip;
          }
        }

        return null;
      },

      // Check if timeline has ended at given time (Story 5.3 AC#7)
      isEndOfTimeline: (time: number): boolean => {
        const timelineState = useTimelineStore.getState();

        if (timelineState.tracks.length === 0) {
          return true; // Empty timeline is always at end
        }

        // Find the latest clip end time across all tracks
        let maxEndTime = 0;

        for (const track of timelineState.tracks) {
          for (const clip of track.clips) {
            const clipEnd = clip.startTime + (clip.trimOut - clip.trimIn);
            if (clipEnd > maxEndTime) {
              maxEndTime = clipEnd;
            }
          }
        }

        // Time is at or past the end if it's >= max end time
        return time >= maxEndTime;
      },

      // Set render state
      setRenderState: (state: RenderState) => {
        set({ renderState: state }, false, 'setRenderState');
      },

      // Reset composition state
      reset: () => {
        set(
          {
            currentCompositionTime: 0,
            activeClips: [],
            activeTracks: [],
            renderState: RenderState.idle,
            nextBoundaryTime: null,
          },
          false,
          'reset'
        );
      },
    }),
    { name: 'CompositionStore' }
  )
);
