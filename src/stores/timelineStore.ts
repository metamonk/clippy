import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Clip, Timeline, TimelineViewConfig } from '@/types/timeline';
import { TIMELINE_DEFAULTS } from '@/types/timeline';
import { v4 as uuidv4 } from 'uuid';
import { splitClipAtTime } from '@/lib/timeline/clipOperations';

// Story 3.3: Maximum history depth for undo functionality
const MAX_HISTORY = 10;

// Story 3.3: Vertical drag threshold ratio (extracted from magic number - Review L-3)
const VERTICAL_DRAG_THRESHOLD_RATIO = 0.5;

interface TimelineState extends Timeline {
  /** Timeline view configuration (zoom, dimensions) */
  viewConfig: TimelineViewConfig;

  /** Currently selected clip ID (for trim operations and playback) */
  selectedClipId: string | null;

  /** Hovered track state during drag operations (Story 3.3) */
  hoveredTrackState: { trackId: string; canDrop: boolean } | null;

  /** History stack for undo functionality (Story 3.3) */
  history: Pick<TimelineState, 'tracks'>[];

  /** Current position in history stack (Story 3.3) */
  historyIndex: number;

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

  /** Move clip to a different track (Story 3.3 AC#1, AC#3) */
  moveClipToTrack: (clipId: string, targetTrackId: string) => boolean;

  /** Move clip horizontally within track (Story 3.3) */
  moveClip: (clipId: string, newStartTime: number, recordHistory?: boolean) => boolean;

  /** Set hovered track state during drag (Story 3.3 AC#2) */
  setHoveredTrack: (state: { trackId: string; canDrop: boolean } | null) => void;

  /** Record current state to history (Story 3.3 AC#5) */
  recordHistory: () => void;

  /** Undo last operation (Story 3.3 AC#5) */
  undo: () => void;

  /** Split clip at specified time (Story 3.4 AC#1, AC#2, AC#6) */
  splitClip: (clipId: string, splitTime: number) => boolean;
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
      // Initial state: Story 3.1 AC#1 - Start with 2 tracks (Track 1: main, Track 2: overlay)
      tracks: [
        {
          id: uuidv4(),
          trackNumber: 1,
          clips: [],
          trackType: 'video',
        },
        {
          id: uuidv4(),
          trackNumber: 2,
          clips: [],
          trackType: 'video',
        },
      ],
      totalDuration: 0,
      selectedClipId: null,
      hoveredTrackState: null,
      history: [],
      historyIndex: -1,
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
                trackNumber: state.tracks.length + 1,
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
            // Story 3.1 AC#1: Maintain minimum of 2 tracks
            if (state.tracks.length <= 2) {
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
            // Story 3.1 AC#1: Reset to 2 tracks minimum
            tracks: [
              {
                id: uuidv4(),
                trackNumber: 1,
                clips: [],
                trackType: 'video',
              },
              {
                id: uuidv4(),
                trackNumber: 2,
                clips: [],
                trackType: 'video',
              },
            ],
            totalDuration: 0,
          },
          false,
          'clearTimeline'
        ),

      // Story 3.3: Move clip horizontally within track with optional history recording
      moveClip: (clipId: string, newStartTime: number, recordHistory = false) => {
        const state = get();

        // Find the clip and its track
        let sourceTrack = null;
        let clip = null;

        for (const track of state.tracks) {
          const foundClip = track.clips.find((c) => c.id === clipId);
          if (foundClip) {
            sourceTrack = track;
            clip = foundClip;
            break;
          }
        }

        if (!sourceTrack || !clip) {
          return false;
        }

        // Check for collision at new position on same track
        const clipDuration = clip.trimOut - clip.trimIn;
        const newEndTime = newStartTime + clipDuration;

        const hasCollision = sourceTrack.clips.some((existingClip) => {
          if (existingClip.id === clipId) return false; // Ignore self

          const existingEnd = existingClip.startTime + (existingClip.trimOut - existingClip.trimIn);

          // Check for overlap
          return !(newEndTime <= existingClip.startTime || newStartTime >= existingEnd);
        });

        if (hasCollision) {
          return false;
        }

        // Record history if requested (Story 3.3 Review H-1: only on drag completion)
        if (recordHistory) {
          get().recordHistory();
        }

        // Update clip position
        set(
          (state) => {
            const updatedTracks = state.tracks.map((track) => {
              if (track.id === sourceTrack!.id) {
                return {
                  ...track,
                  clips: track.clips
                    .map((c) => {
                      if (c.id === clipId) {
                        return { ...c, startTime: newStartTime };
                      }
                      return c;
                    })
                    .sort((a, b) => a.startTime - b.startTime),
                };
              }
              return track;
            });

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
          'moveClip'
        );

        return true;
      },

      // Story 3.3: Move clip to different track (AC#1, AC#3)
      moveClipToTrack: (clipId: string, targetTrackId: string) => {
        const state = get();

        // Find source track and clip
        let sourceTrack = null;
        let clip = null;

        for (const track of state.tracks) {
          const foundClip = track.clips.find((c) => c.id === clipId);
          if (foundClip) {
            sourceTrack = track;
            clip = foundClip;
            break;
          }
        }

        if (!sourceTrack || !clip) {
          console.warn('Cannot move clip: clip or source track not found');
          return false;
        }

        // Check if target track exists
        const targetTrack = state.tracks.find((t) => t.id === targetTrackId);
        if (!targetTrack) {
          console.warn('Cannot move clip: target track not found');
          return false;
        }

        // Same track - no-op
        if (sourceTrack.id === targetTrackId) {
          return false;
        }

        // Check for collision on target track at clip's timeline position (AC#3: maintain startTime)
        const clipDuration = clip.trimOut - clip.trimIn;
        const clipEnd = clip.startTime + clipDuration;

        const hasCollision = targetTrack.clips.some((existingClip) => {
          const existingEnd = existingClip.startTime + (existingClip.trimOut - existingClip.trimIn);

          // Check for overlap
          return !(clipEnd <= existingClip.startTime || clip.startTime >= existingEnd);
        });

        if (hasCollision) {
          console.warn('Cannot move clip: collision detected on target track');
          return false;
        }

        // Record history before move (Story 3.3 AC#5)
        get().recordHistory();

        // Move clip from source to target track
        set(
          (state) => {
            const updatedTracks = state.tracks.map((track) => {
              if (track.id === sourceTrack!.id) {
                // Remove from source
                return {
                  ...track,
                  clips: track.clips.filter((c) => c.id !== clipId),
                };
              } else if (track.id === targetTrackId) {
                // Add to target, maintain startTime (AC#3)
                return {
                  ...track,
                  clips: [...track.clips, clip!].sort((a, b) => a.startTime - b.startTime),
                };
              }
              return track;
            });

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
          'moveClipToTrack'
        );

        return true;
      },

      // Story 3.3: Set hovered track state during drag (AC#2)
      setHoveredTrack: (state: { trackId: string; canDrop: boolean } | null) =>
        set(
          { hoveredTrackState: state },
          false,
          'setHoveredTrack'
        ),

      // Story 3.3: Record current state to history (AC#5)
      recordHistory: () => {
        const state = get();
        const currentHistory = state.history;
        const historyIndex = state.historyIndex;

        // Truncate forward history if we've undone and then made a new change
        const newHistory = currentHistory.slice(0, historyIndex + 1);

        // Add current state snapshot to history
        newHistory.push({ tracks: JSON.parse(JSON.stringify(state.tracks)) });

        // Limit to MAX_HISTORY entries
        if (newHistory.length > MAX_HISTORY) {
          newHistory.shift();
        }

        set(
          {
            history: newHistory,
            historyIndex: newHistory.length - 1,
          },
          false,
          'recordHistory'
        );
      },

      // Story 3.3: Undo last operation (AC#5)
      undo: () => {
        const state = get();

        // Cannot undo if no history (Story 3.3 Review: fixed from <= 0 to < 0)
        if (state.historyIndex < 0) {
          console.warn('No more actions to undo');
          return;
        }

        // Get previous state at current historyIndex (Story 3.3 Review: fixed access pattern)
        const previousState = state.history[state.historyIndex];

        set(
          (state) => {
            // Recalculate total duration for restored state
            const maxEndTime = previousState.tracks.reduce((max, track) => {
              const trackEndTime = track.clips.reduce((trackMax, clip) => {
                const clipEndTime = clip.startTime + (clip.trimOut - clip.trimIn);
                return Math.max(trackMax, clipEndTime);
              }, 0);
              return Math.max(max, trackEndTime);
            }, 0);

            return {
              tracks: previousState.tracks,
              totalDuration: maxEndTime,
              historyIndex: state.historyIndex - 1,
            };
          },
          false,
          'undo'
        );
      },

      // Story 3.4: Split clip at playhead (AC#1, AC#2, AC#6)
      splitClip: (clipId: string, splitTime: number) => {
        const state = get();

        // Find track containing the clip
        let sourceTrack = null;
        let clip = null;

        for (const track of state.tracks) {
          const foundClip = track.clips.find((c) => c.id === clipId);
          if (foundClip) {
            sourceTrack = track;
            clip = foundClip;
            break;
          }
        }

        if (!sourceTrack || !clip) {
          console.warn('Cannot split clip: clip not found');
          return false;
        }

        // Perform split operation
        const splitResult = splitClipAtTime(clip, splitTime);

        if (!splitResult) {
          console.warn('Cannot split clip: playhead not within clip bounds');
          return false;
        }

        const [firstClip, secondClip] = splitResult;

        // Record history before split (Story 3.4: enables undo)
        get().recordHistory();

        // Replace original clip with two new clips
        set(
          (state) => {
            const updatedTracks = state.tracks.map((track) => {
              if (track.id === sourceTrack!.id) {
                return {
                  ...track,
                  clips: track.clips
                    .filter((c) => c.id !== clipId) // Remove original
                    .concat([firstClip, secondClip]) // Add split clips
                    .sort((a, b) => a.startTime - b.startTime), // Maintain order
                };
              }
              return track;
            });

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
          'splitClip'
        );

        return true;
      },
    }),
    {
      name: 'timeline-store',
    }
  )
);
