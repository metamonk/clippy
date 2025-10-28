import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Clip, Timeline, TimelineViewConfig } from '@/types/timeline';
import { TIMELINE_DEFAULTS } from '@/types/timeline';
import { v4 as uuidv4 } from 'uuid';

interface TimelineState extends Timeline {
  /** Timeline view configuration (zoom, dimensions) */
  viewConfig: TimelineViewConfig;

  /** Currently selected clip ID (for trim operations and playback) */
  selectedClipId: string | null;

  /** Add a clip to a specific track */
  addClip: (trackId: string, clip: Omit<Clip, 'id'>) => void;

  /** Remove a clip from timeline */
  removeClip: (clipId: string) => void;

  /** Update a clip's properties */
  updateClip: (clipId: string, updates: Partial<Omit<Clip, 'id'>>) => void;

  /** Get a clip by ID */
  getClip: (clipId: string) => Clip | undefined;

  /** Set selected clip ID */
  setSelectedClip: (clipId: string | null) => void;

  /** Reset trim points for a clip to full duration */
  resetTrim: (clipId: string) => void;

  /** Add a new track to timeline */
  addTrack: (trackType: 'video' | 'audio') => void;

  /** Remove a track from timeline */
  removeTrack: (trackId: string) => void;

  /** Update view configuration (zoom, dimensions) */
  updateViewConfig: (config: Partial<TimelineViewConfig>) => void;

  /** Calculate and update total duration based on clips */
  recalculateDuration: () => void;

  /** Clear all clips from timeline */
  clearTimeline: () => void;
}

/**
 * Timeline Store
 *
 * This Zustand store manages the state of the timeline, including tracks, clips,
 * and view configuration. It provides actions for adding, removing, and updating
 * clips and tracks.
 *
 * Following ADR-005: All timestamps in MILLISECONDS
 * Following ADR-003: Using Zustand with devtools for state management
 */
export const useTimelineStore = create<TimelineState>()(
  devtools(
    (set, get) => ({
      // Initial state
      tracks: [
        {
          id: uuidv4(),
          clips: [],
          trackType: 'video',
        },
      ],
      totalDuration: 0,
      selectedClipId: null,
      viewConfig: {
        pixelsPerSecond: TIMELINE_DEFAULTS.PIXELS_PER_SECOND,
        trackHeight: TIMELINE_DEFAULTS.TRACK_HEIGHT,
        rulerHeight: TIMELINE_DEFAULTS.RULER_HEIGHT,
      },

      addClip: (trackId: string, clipData: Omit<Clip, 'id'>) =>
        set(
          (state) => {
            const clip: Clip = {
              id: uuidv4(),
              ...clipData,
            };

            const updatedTracks = state.tracks.map((track) => {
              if (track.id === trackId) {
                return {
                  ...track,
                  clips: [...track.clips, clip].sort((a, b) => a.startTime - b.startTime),
                };
              }
              return track;
            });

            // Calculate new total duration
            const maxEndTime = updatedTracks.reduce((max, track) => {
              const trackEndTime = track.clips.reduce((trackMax, clip) => {
                const clipEndTime = clip.startTime + (clip.trimOut - clip.trimIn);
                return Math.max(trackMax, clipEndTime);
              }, 0);
              return Math.max(max, trackEndTime);
            }, 0);

            return {
              tracks: updatedTracks,
              totalDuration: maxEndTime,
            };
          },
          false,
          'addClip'
        ),

      removeClip: (clipId: string) =>
        set(
          (state) => {
            const updatedTracks = state.tracks.map((track) => ({
              ...track,
              clips: track.clips.filter((clip) => clip.id !== clipId),
            }));

            // Recalculate total duration
            const maxEndTime = updatedTracks.reduce((max, track) => {
              const trackEndTime = track.clips.reduce((trackMax, clip) => {
                const clipEndTime = clip.startTime + (clip.trimOut - clip.trimIn);
                return Math.max(trackMax, clipEndTime);
              }, 0);
              return Math.max(max, trackEndTime);
            }, 0);

            return {
              tracks: updatedTracks,
              totalDuration: maxEndTime,
            };
          },
          false,
          'removeClip'
        ),

      updateClip: (clipId: string, updates: Partial<Omit<Clip, 'id'>>) =>
        set(
          (state) => {
            const updatedTracks = state.tracks.map((track) => ({
              ...track,
              clips: track.clips
                .map((clip) => {
                  if (clip.id === clipId) {
                    return { ...clip, ...updates };
                  }
                  return clip;
                })
                .sort((a, b) => a.startTime - b.startTime),
            }));

            // Recalculate total duration
            const maxEndTime = updatedTracks.reduce((max, track) => {
              const trackEndTime = track.clips.reduce((trackMax, clip) => {
                const clipEndTime = clip.startTime + (clip.trimOut - clip.trimIn);
                return Math.max(trackMax, clipEndTime);
              }, 0);
              return Math.max(max, trackEndTime);
            }, 0);

            return {
              tracks: updatedTracks,
              totalDuration: maxEndTime,
            };
          },
          false,
          'updateClip'
        ),

      getClip: (clipId: string) => {
        const state = get();
        for (const track of state.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) return clip;
        }
        return undefined;
      },

      setSelectedClip: (clipId: string | null) =>
        set(
          { selectedClipId: clipId },
          false,
          'setSelectedClip'
        ),

      resetTrim: (clipId: string) =>
        set(
          (state) => {
            const clip = get().getClip(clipId);
            if (!clip) return state;

            // Reset trimIn to 0 and trimOut to original duration
            const updatedTracks = state.tracks.map((track) => ({
              ...track,
              clips: track.clips.map((c) => {
                if (c.id === clipId) {
                  return {
                    ...c,
                    trimIn: 0,
                    trimOut: c.duration,
                  };
                }
                return c;
              }),
            }));

            return { tracks: updatedTracks };
          },
          false,
          'resetTrim'
        ),

      addTrack: (trackType: 'video' | 'audio') =>
        set(
          (state) => ({
            tracks: [
              ...state.tracks,
              {
                id: uuidv4(),
                clips: [],
                trackType,
              },
            ],
          }),
          false,
          'addTrack'
        ),

      removeTrack: (trackId: string) =>
        set(
          (state) => {
            // Don't allow removing the last track
            if (state.tracks.length <= 1) {
              return state;
            }

            const updatedTracks = state.tracks.filter((track) => track.id !== trackId);

            // Recalculate total duration
            const maxEndTime = updatedTracks.reduce((max, track) => {
              const trackEndTime = track.clips.reduce((trackMax, clip) => {
                const clipEndTime = clip.startTime + (clip.trimOut - clip.trimIn);
                return Math.max(trackMax, clipEndTime);
              }, 0);
              return Math.max(max, trackEndTime);
            }, 0);

            return {
              tracks: updatedTracks,
              totalDuration: maxEndTime,
            };
          },
          false,
          'removeTrack'
        ),

      updateViewConfig: (config: Partial<TimelineViewConfig>) =>
        set(
          (state) => ({
            viewConfig: {
              ...state.viewConfig,
              ...config,
            },
          }),
          false,
          'updateViewConfig'
        ),

      recalculateDuration: () =>
        set(
          (state) => {
            const maxEndTime = state.tracks.reduce((max, track) => {
              const trackEndTime = track.clips.reduce((trackMax, clip) => {
                const clipEndTime = clip.startTime + (clip.trimOut - clip.trimIn);
                return Math.max(trackMax, clipEndTime);
              }, 0);
              return Math.max(max, trackEndTime);
            }, 0);

            return {
              totalDuration: maxEndTime,
            };
          },
          false,
          'recalculateDuration'
        ),

      clearTimeline: () =>
        set(
          {
            tracks: [
              {
                id: uuidv4(),
                clips: [],
                trackType: 'video',
              },
            ],
            totalDuration: 0,
          },
          false,
          'clearTimeline'
        ),
    }),
    {
      name: 'timeline-store',
    }
  )
);
