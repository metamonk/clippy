import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Clip, Timeline, TimelineViewConfig } from '@/types/timeline';
import { TIMELINE_DEFAULTS } from '@/types/timeline';
import { v4 as uuidv4 } from 'uuid';
import { splitClipAtTime } from '@/lib/timeline/clipOperations';
import { BASE_PIXELS_PER_SECOND } from '@/lib/timeline/zoomUtils';

// Story 3.3: Maximum history depth for undo functionality
const MAX_HISTORY = 10;

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

  /** Per-track audio settings for multi-audio clips (Story 4.7) */
  audioTrackSettings: Record<string, Record<number, { volume: number; muted: boolean }>>;

  /** Fixed timeline duration in milliseconds (overrides auto-calculated duration if set) */
  fixedDuration: number | null;

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

  /** Set clip fade-in duration (Story 3.10 AC#3, AC#6) */
  setClipFadeIn: (clipId: string, duration: number) => void;

  /** Set clip fade-out duration (Story 3.10 AC#3, AC#6) */
  setClipFadeOut: (clipId: string, duration: number) => void;

  /** Set zoom level directly (Story 3.6) */
  setZoomLevel: (level: number) => void;

  /** Zoom in (Story 3.6) */
  zoomIn: () => void;

  /** Zoom out (Story 3.6) */
  zoomOut: () => void;

  /** Toggle clip mute state (Story 3.9) */
  toggleClipMute: (clipId: string) => void;

  /** Set volume for a specific audio track in a multi-audio clip (Story 4.7) */
  setAudioTrackVolume: (clipId: string, trackIndex: number, volume: number) => void;

  /** Set muted state for a specific audio track in a multi-audio clip (Story 4.7) */
  setAudioTrackMuted: (clipId: string, trackIndex: number, muted: boolean) => void;

  /** Get audio track settings for a specific clip and track (Story 4.7) */
  getAudioTrackSettings: (clipId: string, trackIndex: number) => { volume: number; muted: boolean } | undefined;

  /** Set fixed timeline duration (null to use auto-calculated duration) */
  setFixedDuration: (duration: number | null) => void;
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
      audioTrackSettings: {},
      fixedDuration: null,
      viewConfig: {
        pixelsPerSecond: TIMELINE_DEFAULTS.PIXELS_PER_SECOND,
        trackHeight: TIMELINE_DEFAULTS.TRACK_HEIGHT,
        rulerHeight: TIMELINE_DEFAULTS.RULER_HEIGHT,
        zoomLevel: TIMELINE_DEFAULTS.PIXELS_PER_SECOND / BASE_PIXELS_PER_SECOND, // 50 / 100 = 0.5x
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

        // Calculate clip duration
        const clipDuration = clip.trimOut - clip.trimIn;
        const newEndTime = newStartTime + clipDuration;

        // Find the nearest valid position (no overlaps with any clip)
        let validStartTime = Math.max(0, newStartTime);

        // Sort other clips by start time
        const otherClips = sourceTrack.clips
          .filter(c => c.id !== clipId)
          .sort((a, b) => a.startTime - b.startTime);

        // Helper function to check if a position would collide with any clip
        const hasCollisionAt = (startTime: number): boolean => {
          const endTime = startTime + clipDuration;
          return otherClips.some(otherClip => {
            const otherStart = otherClip.startTime;
            const otherEnd = otherClip.startTime + (otherClip.trimOut - otherClip.trimIn);
            return endTime > otherStart && startTime < otherEnd;
          });
        };

        // If desired position has collision, find all valid gaps and choose closest
        if (hasCollisionAt(validStartTime)) {
          // Build list of all possible valid positions (gaps between clips)
          const validPositions: number[] = [];

          // Position before first clip (if there's space)
          if (otherClips.length > 0) {
            const beforeFirst = otherClips[0].startTime - clipDuration;
            if (beforeFirst >= 0 && !hasCollisionAt(beforeFirst)) {
              validPositions.push(beforeFirst);
            }
          }

          // Gaps between clips
          for (let i = 0; i < otherClips.length - 1; i++) {
            const currentClip = otherClips[i];
            const nextClip = otherClips[i + 1];

            const currentEnd = currentClip.startTime + (currentClip.trimOut - currentClip.trimIn);
            const gapStart = currentEnd;
            const gapEnd = nextClip.startTime;
            const gapSize = gapEnd - gapStart;

            // Check if our clip fits in this gap
            if (gapSize >= clipDuration && !hasCollisionAt(gapStart)) {
              validPositions.push(gapStart);
            }
          }

          // Position after last clip
          if (otherClips.length > 0) {
            const lastClip = otherClips[otherClips.length - 1];
            const afterLast = lastClip.startTime + (lastClip.trimOut - lastClip.trimIn);
            if (!hasCollisionAt(afterLast)) {
              validPositions.push(afterLast);
            }
          }

          // If no valid positions found, place at the end
          if (validPositions.length === 0 && otherClips.length > 0) {
            const lastClip = otherClips[otherClips.length - 1];
            validStartTime = lastClip.startTime + (lastClip.trimOut - lastClip.trimIn);
          } else if (validPositions.length > 0) {
            // Choose the valid position closest to desired position
            validStartTime = validPositions.reduce((closest, pos) => {
              const distToPos = Math.abs(newStartTime - pos);
              const distToClosest = Math.abs(newStartTime - closest);
              return distToPos < distToClosest ? pos : closest;
            });
          } else if (otherClips.length === 0) {
            // No other clips, use the desired position
            validStartTime = Math.max(0, newStartTime);
          }
        }

        // Final clamp to ensure non-negative
        validStartTime = Math.max(0, validStartTime);

        // Don't update if position didn't change significantly
        const delta = Math.abs(validStartTime - clip.startTime);
        if (delta < 0.1) {
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
                        return { ...c, startTime: validStartTime };
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

      // Story 3.10: Set clip fade-in duration (AC#3, AC#6)
      setClipFadeIn: (clipId: string, duration: number) =>
        set(
          (state) => {
            // Validate duration is non-negative
            if (duration < 0) {
              console.warn('Fade-in duration cannot be negative');
              return state;
            }

            const updatedTracks = state.tracks.map((track) => ({
              ...track,
              clips: track.clips.map((clip) => {
                if (clip.id === clipId) {
                  return { ...clip, fadeIn: duration };
                }
                return clip;
              }),
            }));

            return { tracks: updatedTracks };
          },
          false,
          'setClipFadeIn'
        ),

      // Story 3.10: Set clip fade-out duration (AC#3, AC#6)
      setClipFadeOut: (clipId: string, duration: number) =>
        set(
          (state) => {
            // Validate duration is non-negative
            if (duration < 0) {
              console.warn('Fade-out duration cannot be negative');
              return state;
            }

            const updatedTracks = state.tracks.map((track) => ({
              ...track,
              clips: track.clips.map((clip) => {
                if (clip.id === clipId) {
                  return { ...clip, fadeOut: duration };
                }
                return clip;
              }),
            }));

            return { tracks: updatedTracks };
          },
          false,
          'setClipFadeOut'
        ),

      // Story 3.6: Zoom controls
      setZoomLevel: (level: number) =>
        set(
          (state) => {
            const clampedZoom = Math.max(0.1, Math.min(10, level)); // Clamp between 0.1x and 10x
            return {
              viewConfig: {
                ...state.viewConfig,
                zoomLevel: clampedZoom,
                pixelsPerSecond: BASE_PIXELS_PER_SECOND * clampedZoom,
              },
            };
          },
          false,
          'setZoomLevel'
        ),

      zoomIn: () =>
        set(
          (state) => {
            const currentZoom = state.viewConfig.zoomLevel || 1.0;
            const newZoom = Math.min(10, currentZoom * 1.2); // 20% increase, max 10x
            return {
              viewConfig: {
                ...state.viewConfig,
                zoomLevel: newZoom,
                pixelsPerSecond: BASE_PIXELS_PER_SECOND * newZoom,
              },
            };
          },
          false,
          'zoomIn'
        ),

      zoomOut: () =>
        set(
          (state) => {
            const currentZoom = state.viewConfig.zoomLevel || 1.0;
            const newZoom = Math.max(0.1, currentZoom / 1.2); // 20% decrease, min 0.1x
            return {
              viewConfig: {
                ...state.viewConfig,
                zoomLevel: newZoom,
                pixelsPerSecond: BASE_PIXELS_PER_SECOND * newZoom,
              },
            };
          },
          false,
          'zoomOut'
        ),

      // Story 3.9: Toggle clip mute
      toggleClipMute: (clipId: string) =>
        set(
          (state) => {
            const updatedTracks = state.tracks.map((track) => ({
              ...track,
              clips: track.clips.map((clip) => {
                if (clip.id === clipId) {
                  return { ...clip, muted: !clip.muted };
                }
                return clip;
              }),
            }));

            return { tracks: updatedTracks };
          },
          false,
          'toggleClipMute'
        ),

      // Story 4.7: Set volume for specific audio track in multi-audio clip
      setAudioTrackVolume: (clipId: string, trackIndex: number, volume: number) =>
        set(
          (state) => {
            const clipSettings = state.audioTrackSettings[clipId] || {};
            const trackSettings = clipSettings[trackIndex] || { volume: 1.0, muted: false };

            return {
              audioTrackSettings: {
                ...state.audioTrackSettings,
                [clipId]: {
                  ...clipSettings,
                  [trackIndex]: {
                    ...trackSettings,
                    volume: Math.max(0, Math.min(2, volume)), // Clamp between 0 and 2 (200%)
                  },
                },
              },
            };
          },
          false,
          'setAudioTrackVolume'
        ),

      // Story 4.7: Set muted state for specific audio track in multi-audio clip
      setAudioTrackMuted: (clipId: string, trackIndex: number, muted: boolean) =>
        set(
          (state) => {
            const clipSettings = state.audioTrackSettings[clipId] || {};
            const trackSettings = clipSettings[trackIndex] || { volume: 1.0, muted: false };

            return {
              audioTrackSettings: {
                ...state.audioTrackSettings,
                [clipId]: {
                  ...clipSettings,
                  [trackIndex]: {
                    ...trackSettings,
                    muted,
                  },
                },
              },
            };
          },
          false,
          'setAudioTrackMuted'
        ),

      // Story 4.7: Get audio track settings for a specific clip and track
      getAudioTrackSettings: (clipId: string, trackIndex: number) => {
        const state = get();
        return state.audioTrackSettings[clipId]?.[trackIndex];
      },

      setFixedDuration: (duration: number | null) =>
        set(
          {
            fixedDuration: duration,
          },
          false,
          'setFixedDuration'
        ),
    }),
    {
      name: 'timeline-store',
    }
  )
);
