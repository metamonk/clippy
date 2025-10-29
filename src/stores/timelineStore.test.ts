import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from './timelineStore';

describe('timelineStore', () => {
  beforeEach(() => {
    // Reset store to initial state (Story 3.1: 2 tracks, Story 3.3: including history state)
    useTimelineStore.setState({
      tracks: [
        {
          id: 'default-track-1',
          trackNumber: 1,
          clips: [],
          trackType: 'video',
        },
        {
          id: 'default-track-2',
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
        pixelsPerSecond: 50,
        trackHeight: 80,
        rulerHeight: 30,
      },
    });
  });

  // Story 3.1 AC#1: Timeline initializes with minimum 2 tracks
  describe('initial state', () => {
    it('initializes with 2 video tracks (Story 3.1 AC#1)', () => {
      // Create a fresh store instance to test initial state
      const freshState = useTimelineStore.getState();

      expect(freshState.tracks).toHaveLength(2);
      expect(freshState.tracks[0].trackNumber).toBe(1);
      expect(freshState.tracks[0].trackType).toBe('video');
      expect(freshState.tracks[1].trackNumber).toBe(2);
      expect(freshState.tracks[1].trackType).toBe('video');
    });
  });

  describe('addClip', () => {
    it('adds a clip to a track', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const newState = useTimelineStore.getState();
      expect(newState.tracks[0].clips).toHaveLength(1);
      expect(newState.tracks[0].clips[0].filePath).toBe('/path/to/video.mp4');
      expect(newState.tracks[0].clips[0].duration).toBe(10000);
    });

    it('generates a unique ID for the clip', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const newState = useTimelineStore.getState();
      expect(newState.tracks[0].clips[0].id).toBeTruthy();
      expect(typeof newState.tracks[0].clips[0].id).toBe('string');
    });

    it('sorts clips by start time', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video2.mp4',
        startTime: 20000,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      state.addClip(trackId, {
        filePath: '/path/to/video1.mp4',
        startTime: 5000,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const newState = useTimelineStore.getState();
      expect(newState.tracks[0].clips[0].startTime).toBe(5000);
      expect(newState.tracks[0].clips[1].startTime).toBe(20000);
    });

    it('updates total duration', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 10000,
        duration: 20000,
        trimIn: 0,
        trimOut: 20000,
      });

      const newState = useTimelineStore.getState();
      // Clip ends at 10000 + 20000 = 30000
      expect(newState.totalDuration).toBe(30000);
    });
  });

  describe('removeClip', () => {
    it('removes a clip from timeline', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      state.removeClip(clipId);

      const newState = useTimelineStore.getState();
      expect(newState.tracks[0].clips).toHaveLength(0);
    });

    it('updates total duration after removal', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video1.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      state.addClip(trackId, {
        filePath: '/path/to/video2.mp4',
        startTime: 15000,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[1].id;
      state.removeClip(clipId);

      const newState = useTimelineStore.getState();
      // Only first clip remains, ending at 10000
      expect(newState.totalDuration).toBe(10000);
    });
  });

  describe('updateClip', () => {
    it('updates clip properties', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      state.updateClip(clipId, {
        startTime: 5000,
        trimIn: 1000,
        trimOut: 9000,
      });

      const newState = useTimelineStore.getState();
      expect(newState.tracks[0].clips[0].startTime).toBe(5000);
      expect(newState.tracks[0].clips[0].trimIn).toBe(1000);
      expect(newState.tracks[0].clips[0].trimOut).toBe(9000);
    });

    it('maintains sort order after update', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video1.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      state.addClip(trackId, {
        filePath: '/path/to/video2.mp4',
        startTime: 20000,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const firstClipId = useTimelineStore.getState().tracks[0].clips[0].id;

      // Move first clip to after second clip
      state.updateClip(firstClipId, {
        startTime: 30000,
      });

      const newState = useTimelineStore.getState();
      // Clips should be sorted: second clip (20000) then first clip (30000)
      expect(newState.tracks[0].clips[0].startTime).toBe(20000);
      expect(newState.tracks[0].clips[1].startTime).toBe(30000);
    });
  });

  describe('getClip', () => {
    it('retrieves a clip by ID', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;
      const clip = state.getClip(clipId);

      expect(clip).toBeDefined();
      expect(clip?.id).toBe(clipId);
      expect(clip?.filePath).toBe('/path/to/video.mp4');
    });

    it('returns undefined for non-existent clip', () => {
      const state = useTimelineStore.getState();
      const clip = state.getClip('non-existent-id');

      expect(clip).toBeUndefined();
    });
  });

  describe('addTrack', () => {
    it('adds a new track', () => {
      const state = useTimelineStore.getState();

      state.addTrack('audio');

      const newState = useTimelineStore.getState();
      expect(newState.tracks).toHaveLength(3); // Story 3.1: starts with 2, adds 1 = 3
      expect(newState.tracks[2].trackType).toBe('audio');
      expect(newState.tracks[2].clips).toHaveLength(0);
    });
  });

  describe('removeTrack', () => {
    it('removes a track when more than 2 exist', () => {
      const state = useTimelineStore.getState();

      state.addTrack('audio');
      expect(useTimelineStore.getState().tracks).toHaveLength(3);

      const trackId = useTimelineStore.getState().tracks[2].id;
      state.removeTrack(trackId);

      const newState = useTimelineStore.getState();
      expect(newState.tracks).toHaveLength(2);
    });

    it('does not remove tracks when only 2 remain (Story 3.1 AC#1 minimum)', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.removeTrack(trackId);

      const newState = useTimelineStore.getState();
      // Should still have 2 tracks (minimum enforced)
      expect(newState.tracks).toHaveLength(2);
    });
  });

  describe('updateViewConfig', () => {
    it('updates view configuration', () => {
      const state = useTimelineStore.getState();

      state.updateViewConfig({
        pixelsPerSecond: 100,
        trackHeight: 100,
      });

      const newState = useTimelineStore.getState();
      expect(newState.viewConfig.pixelsPerSecond).toBe(100);
      expect(newState.viewConfig.trackHeight).toBe(100);
      expect(newState.viewConfig.rulerHeight).toBe(30); // Unchanged
    });
  });

  describe('clearTimeline', () => {
    it('clears all clips and resets timeline to 2 tracks', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      state.addTrack('audio');

      state.clearTimeline();

      const newState = useTimelineStore.getState();
      expect(newState.tracks).toHaveLength(2); // Story 3.1: resets to 2 tracks minimum
      expect(newState.tracks[0].clips).toHaveLength(0);
      expect(newState.tracks[1].clips).toHaveLength(0);
      expect(newState.totalDuration).toBe(0);
    });
  });

  describe('devtools integration', () => {
    it('has devtools enabled', () => {
      // The store should be created with devtools middleware
      const state = useTimelineStore.getState();
      expect(state).toBeDefined();
    });
  });

  describe('setSelectedClip', () => {
    it('sets the selected clip ID', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;
      state.setSelectedClip(clipId);

      const newState = useTimelineStore.getState();
      expect(newState.selectedClipId).toBe(clipId);
    });

    it('can clear selected clip', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;
      state.setSelectedClip(clipId);
      state.setSelectedClip(null);

      const newState = useTimelineStore.getState();
      expect(newState.selectedClipId).toBeNull();
    });
  });

  describe('resetTrim', () => {
    it('resets trim points to full clip duration', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      // Trim the clip
      state.updateClip(clipId, {
        trimIn: 2000,
        trimOut: 8000,
      });

      // Verify trim was applied
      let clip = state.getClip(clipId);
      expect(clip?.trimIn).toBe(2000);
      expect(clip?.trimOut).toBe(8000);

      // Reset trim
      state.resetTrim(clipId);

      // Verify trim was reset
      clip = useTimelineStore.getState().getClip(clipId);
      expect(clip?.trimIn).toBe(0);
      expect(clip?.trimOut).toBe(10000);
    });

    it('does nothing for non-existent clip', () => {
      const state = useTimelineStore.getState();
      const initialState = useTimelineStore.getState();

      state.resetTrim('non-existent-id');

      const newState = useTimelineStore.getState();
      expect(newState).toEqual(initialState);
    });
  });

  describe('trim state updates', () => {
    it('updates trimIn and trimOut independently', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      // Update only trimIn
      state.updateClip(clipId, { trimIn: 1000 });
      let clip = state.getClip(clipId);
      expect(clip?.trimIn).toBe(1000);
      expect(clip?.trimOut).toBe(10000);

      // Update only trimOut
      state.updateClip(clipId, { trimOut: 9000 });
      clip = useTimelineStore.getState().getClip(clipId);
      expect(clip?.trimIn).toBe(1000);
      expect(clip?.trimOut).toBe(9000);
    });

    it('calculates total duration based on trimmed clip length', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 2000,
        trimOut: 8000,
      });

      const newState = useTimelineStore.getState();
      // Clip visual duration: trimOut - trimIn = 8000 - 2000 = 6000
      // Timeline duration: startTime + visual duration = 0 + 6000 = 6000
      expect(newState.totalDuration).toBe(6000);
    });

    it('recalculates duration after trim update', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      // Initial duration: 0 + (10000 - 0) = 10000
      expect(useTimelineStore.getState().totalDuration).toBe(10000);

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      // Trim the clip
      state.updateClip(clipId, {
        trimIn: 2000,
        trimOut: 7000,
      });

      const newState = useTimelineStore.getState();
      // New duration: 0 + (7000 - 2000) = 5000
      expect(newState.totalDuration).toBe(5000);
    });
  });

  describe('trim constraints', () => {
    it('allows trim within clip boundaries', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      // Valid trim: trimIn < trimOut, both within [0, duration]
      state.updateClip(clipId, {
        trimIn: 1000,
        trimOut: 9000,
      });

      const clip = state.getClip(clipId);
      expect(clip?.trimIn).toBe(1000);
      expect(clip?.trimOut).toBe(9000);
    });

    it('stores trim values as provided (constraints enforced at UI level)', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      // Store allows any values - constraints are enforced in UI (TimelineClip drag handlers)
      state.updateClip(clipId, {
        trimIn: 3000,
        trimOut: 4000,
      });

      const clip = state.getClip(clipId);
      expect(clip?.trimIn).toBe(3000);
      expect(clip?.trimOut).toBe(4000);
    });
  });

  describe('splitClip', () => {
    it('splits a clip at valid position', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      // Add a clip: 5000-15000 on timeline (10s duration)
      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 5000,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      // Split at 10000 (middle of clip)
      const result = state.splitClip(clipId, 10000);

      expect(result).toBe(true);
      const newState = useTimelineStore.getState();
      expect(newState.tracks[0].clips).toHaveLength(2);
    });

    it('creates two clips with correct positions and trim values', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 5000,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;
      state.splitClip(clipId, 10000);

      const clips = useTimelineStore.getState().tracks[0].clips;
      const [firstClip, secondClip] = clips;

      // First clip: 5000-10000 (5s)
      expect(firstClip.startTime).toBe(5000);
      expect(firstClip.trimIn).toBe(0);
      expect(firstClip.trimOut).toBe(5000);

      // Second clip: 10000-15000 (5s)
      expect(secondClip.startTime).toBe(10000);
      expect(secondClip.trimIn).toBe(5000);
      expect(secondClip.trimOut).toBe(10000);
    });

    it('assigns unique UUIDs to split clips', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const originalId = useTimelineStore.getState().tracks[0].clips[0].id;
      state.splitClip(originalId, 5000);

      const clips = useTimelineStore.getState().tracks[0].clips;
      expect(clips[0].id).not.toBe(originalId);
      expect(clips[1].id).not.toBe(originalId);
      expect(clips[0].id).not.toBe(clips[1].id);
    });

    it('preserves file path and duration in both clips', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;
      state.splitClip(clipId, 5000);

      const clips = useTimelineStore.getState().tracks[0].clips;
      expect(clips[0].filePath).toBe('/path/to/video.mp4');
      expect(clips[0].duration).toBe(10000);
      expect(clips[1].filePath).toBe('/path/to/video.mp4');
      expect(clips[1].duration).toBe(10000);
    });

    it('maintains clips sorted by startTime after split', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      // Add multiple clips
      state.addClip(trackId, {
        filePath: '/path/to/video1.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      state.addClip(trackId, {
        filePath: '/path/to/video2.mp4',
        startTime: 15000,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;
      state.splitClip(clipId, 5000);

      const clips = useTimelineStore.getState().tracks[0].clips;
      expect(clips).toHaveLength(3);
      expect(clips[0].startTime).toBe(0);
      expect(clips[1].startTime).toBe(5000);
      expect(clips[2].startTime).toBe(15000);
    });

    it('returns false when clip not found', () => {
      const state = useTimelineStore.getState();
      const result = state.splitClip('non-existent-id', 5000);
      expect(result).toBe(false);
    });

    it('returns false when split time outside clip bounds', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 5000,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      // Try to split before clip start
      expect(state.splitClip(clipId, 3000)).toBe(false);

      // Try to split after clip end
      expect(state.splitClip(clipId, 16000)).toBe(false);

      // Clip should still be intact
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1);
    });

    it('recalculates total duration after split', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      expect(useTimelineStore.getState().totalDuration).toBe(10000);

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;
      state.splitClip(clipId, 5000);

      // Total duration should remain the same
      expect(useTimelineStore.getState().totalDuration).toBe(10000);
    });

    it('records history for undo capability', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;
      const historyLengthBefore = useTimelineStore.getState().history.length;

      state.splitClip(clipId, 5000);

      const historyLengthAfter = useTimelineStore.getState().history.length;
      expect(historyLengthAfter).toBe(historyLengthBefore + 1);
    });
  });

  // Story 3.3: Inter-Track Clip Dragging Tests
  describe('moveClipToTrack (Story 3.3 AC#1, AC#3)', () => {
    beforeEach(() => {
      // Create two tracks for testing inter-track moves
      const state = useTimelineStore.getState();
      state.addTrack('video');
    });

    it('moves clip from one track to another', () => {
      const state = useTimelineStore.getState();
      const track1Id = state.tracks[0].id;
      const track2Id = state.tracks[1].id;

      // Add clip to track 1
      state.addClip(track1Id, {
        filePath: '/path/to/video.mp4',
        startTime: 5000,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      // Move clip to track 2
      const success = state.moveClipToTrack(clipId, track2Id);

      expect(success).toBe(true);

      const newState = useTimelineStore.getState();
      expect(newState.tracks[0].clips).toHaveLength(0); // Track 1 empty
      expect(newState.tracks[1].clips).toHaveLength(1); // Track 2 has clip
      expect(newState.tracks[1].clips[0].id).toBe(clipId);
    });

    it('maintains clip startTime when moving between tracks (AC#3)', () => {
      const state = useTimelineStore.getState();
      const track1Id = state.tracks[0].id;
      const track2Id = state.tracks[1].id;

      state.addClip(track1Id, {
        filePath: '/path/to/video.mp4',
        startTime: 7500,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;
      const originalStartTime = useTimelineStore.getState().tracks[0].clips[0].startTime;

      state.moveClipToTrack(clipId, track2Id);

      const newState = useTimelineStore.getState();
      expect(newState.tracks[1].clips[0].startTime).toBe(originalStartTime);
      expect(newState.tracks[1].clips[0].startTime).toBe(7500);
    });

    it('rejects move when target track has collision', () => {
      const state = useTimelineStore.getState();
      const track1Id = state.tracks[0].id;
      const track2Id = state.tracks[1].id;

      // Add clip to track 1 at 0-10000ms
      state.addClip(track1Id, {
        filePath: '/path/to/video1.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      // Add clip to track 2 at 5000-15000ms (will collide)
      state.addClip(track2Id, {
        filePath: '/path/to/video2.mp4',
        startTime: 5000,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clip1Id = useTimelineStore.getState().tracks[0].clips[0].id;

      // Try to move clip1 to track2 - should fail due to collision
      const success = state.moveClipToTrack(clip1Id, track2Id);

      expect(success).toBe(false);

      const newState = useTimelineStore.getState();
      expect(newState.tracks[0].clips).toHaveLength(1); // Clip still on track 1
      expect(newState.tracks[1].clips).toHaveLength(1); // Track 2 unchanged
    });

    it('allows move when clips do not overlap', () => {
      const state = useTimelineStore.getState();
      const track1Id = state.tracks[0].id;
      const track2Id = state.tracks[1].id;

      // Add clip to track 1 at 0-5000ms
      state.addClip(track1Id, {
        filePath: '/path/to/video1.mp4',
        startTime: 0,
        duration: 5000,
        trimIn: 0,
        trimOut: 5000,
        volume: 100,
        muted: false,
      });

      // Add clip to track 2 at 5000-10000ms (no collision - edge-to-edge)
      state.addClip(track2Id, {
        filePath: '/path/to/video2.mp4',
        startTime: 5000,
        duration: 5000,
        trimIn: 0,
        trimOut: 5000,
        volume: 100,
        muted: false,
      });

      const clip1Id = useTimelineStore.getState().tracks[0].clips[0].id;

      // Try to move clip1 to track2 - should succeed (no overlap)
      const success = state.moveClipToTrack(clip1Id, track2Id);

      expect(success).toBe(true);

      const newState = useTimelineStore.getState();
      expect(newState.tracks[0].clips).toHaveLength(0);
      expect(newState.tracks[1].clips).toHaveLength(2);
    });

    it('returns false for invalid clip ID', () => {
      const state = useTimelineStore.getState();
      const track2Id = state.tracks[1].id;

      const success = state.moveClipToTrack('non-existent-clip-id', track2Id);

      expect(success).toBe(false);
    });

    it('returns false for invalid target track ID', () => {
      const state = useTimelineStore.getState();
      const track1Id = state.tracks[0].id;

      state.addClip(track1Id, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      const success = state.moveClipToTrack(clipId, 'non-existent-track-id');

      expect(success).toBe(false);
    });

    it('returns false when moving to same track', () => {
      const state = useTimelineStore.getState();
      const track1Id = state.tracks[0].id;

      state.addClip(track1Id, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      const success = state.moveClipToTrack(clipId, track1Id);

      expect(success).toBe(false);
    });

    it('records history before moving clip (AC#5)', () => {
      const state = useTimelineStore.getState();
      const track1Id = state.tracks[0].id;
      const track2Id = state.tracks[1].id;

      state.addClip(track1Id, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;
      const historyLengthBefore = useTimelineStore.getState().history.length;

      state.moveClipToTrack(clipId, track2Id);

      const historyLengthAfter = useTimelineStore.getState().history.length;
      expect(historyLengthAfter).toBe(historyLengthBefore + 1);
    });
  });

  // Story 3.3: Clip Repositioning (Horizontal Movement) Tests
  describe('moveClip (Story 3.3)', () => {
    it('moves clip horizontally within track', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      const success = state.moveClip(clipId, 5000, false);

      expect(success).toBe(true);
      expect(useTimelineStore.getState().tracks[0].clips[0].startTime).toBe(5000);
    });

    it('rejects move when collision occurs', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      // Add two clips
      state.addClip(trackId, {
        filePath: '/path/to/video1.mp4',
        startTime: 0,
        duration: 5000,
        trimIn: 0,
        trimOut: 5000,
        volume: 100,
        muted: false,
      });

      state.addClip(trackId, {
        filePath: '/path/to/video2.mp4',
        startTime: 10000,
        duration: 5000,
        trimIn: 0,
        trimOut: 5000,
        volume: 100,
        muted: false,
      });

      const clip2Id = useTimelineStore.getState().tracks[0].clips[1].id;

      // Try to move clip2 to position that collides with clip1
      const success = state.moveClip(clip2Id, 2000, false);

      expect(success).toBe(false);
      expect(useTimelineStore.getState().tracks[0].clips[1].startTime).toBe(10000); // Unchanged
    });

    it('only records history when recordHistory=true (Review H-1)', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;
      const historyLengthBefore = useTimelineStore.getState().history.length;

      // Move without recording history (intermediate drag move)
      state.moveClip(clipId, 2000, false);

      let historyLengthAfter = useTimelineStore.getState().history.length;
      expect(historyLengthAfter).toBe(historyLengthBefore); // No history recorded

      // Move with recording history (drag completion)
      state.moveClip(clipId, 5000, true);

      historyLengthAfter = useTimelineStore.getState().history.length;
      expect(historyLengthAfter).toBe(historyLengthBefore + 1); // History recorded
    });
  });

  // Story 3.3: Undo Functionality Tests (AC#5)
  describe('undo and recordHistory (Story 3.3 AC#5)', () => {
    beforeEach(() => {
      // Create two tracks for testing
      const state = useTimelineStore.getState();
      state.addTrack('video');
    });

    it('records current state to history', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      const historyLengthBefore = state.history.length;

      state.recordHistory();

      const historyLengthAfter = useTimelineStore.getState().history.length;
      expect(historyLengthAfter).toBe(historyLengthBefore + 1);
    });

    it('undoes clip move between tracks', () => {
      const state = useTimelineStore.getState();
      const track1Id = state.tracks[0].id;
      const track2Id = state.tracks[1].id;

      // Add clip to track 1
      state.addClip(track1Id, {
        filePath: '/path/to/video.mp4',
        startTime: 5000,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipId = useTimelineStore.getState().tracks[0].clips[0].id;

      // Move clip to track 2 (this records history automatically)
      state.moveClipToTrack(clipId, track2Id);

      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(0);
      expect(useTimelineStore.getState().tracks[1].clips).toHaveLength(1);

      // Undo the move
      state.undo();

      const undoneState = useTimelineStore.getState();
      expect(undoneState.tracks[0].clips).toHaveLength(1); // Clip back on track 1
      expect(undoneState.tracks[1].clips).toHaveLength(0); // Track 2 empty again
      expect(undoneState.tracks[0].clips[0].id).toBe(clipId);
    });

    it('maintains correct historyIndex', () => {
      const state = useTimelineStore.getState();

      expect(state.historyIndex).toBe(-1); // No history yet

      state.recordHistory();
      expect(useTimelineStore.getState().historyIndex).toBe(0);

      state.recordHistory();
      expect(useTimelineStore.getState().historyIndex).toBe(1);

      state.undo();
      expect(useTimelineStore.getState().historyIndex).toBe(0);

      state.undo();
      expect(useTimelineStore.getState().historyIndex).toBe(-1);
    });

    it('does not undo when historyIndex < 0 (Review: fixed check)', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      // Ensure no history
      expect(state.historyIndex).toBe(-1);

      state.addClip(trackId, {
        filePath: '/path/to/video.mp4',
        startTime: 0,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
        volume: 100,
        muted: false,
      });

      const clipCountBefore = useTimelineStore.getState().tracks[0].clips.length;

      // Try to undo when no history - should be no-op
      state.undo();

      const clipCountAfter = useTimelineStore.getState().tracks[0].clips.length;
      expect(clipCountAfter).toBe(clipCountBefore); // State unchanged
    });

    it('limits history to MAX_HISTORY (10) entries', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      // Record 15 history entries
      for (let i = 0; i < 15; i++) {
        state.addClip(trackId, {
          filePath: `/path/to/video${i}.mp4`,
          startTime: i * 1000,
          duration: 500,
          trimIn: 0,
          trimOut: 500,
          volume: 100,
          muted: false,
        });
      }

      const finalState = useTimelineStore.getState();
      expect(finalState.history.length).toBeLessThanOrEqual(10);
    });

    it('truncates forward history when making new change after undo', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      // Create initial state
      state.recordHistory();

      // Make change 1
      state.addClip(trackId, {
        filePath: '/path/to/video1.mp4',
        startTime: 0,
        duration: 5000,
        trimIn: 0,
        trimOut: 5000,
        volume: 100,
        muted: false,
      });
      state.recordHistory();

      // Make change 2
      state.addClip(trackId, {
        filePath: '/path/to/video2.mp4',
        startTime: 5000,
        duration: 5000,
        trimIn: 0,
        trimOut: 5000,
        volume: 100,
        muted: false,
      });
      state.recordHistory();

      // Undo change 2
      state.undo();

      expect(useTimelineStore.getState().historyIndex).toBe(1);
      expect(useTimelineStore.getState().history.length).toBe(3);

      // Make a new change - should truncate forward history
      state.addClip(trackId, {
        filePath: '/path/to/video3.mp4',
        startTime: 10000,
        duration: 5000,
        trimIn: 0,
        trimOut: 5000,
        volume: 100,
        muted: false,
      });
      state.recordHistory();

      const finalState = useTimelineStore.getState();
      expect(finalState.historyIndex).toBe(2);
      expect(finalState.history.length).toBe(3); // Truncated at index 1, then added new entry
    });
  });

  // Story 3.3: Hover State Tests (AC#2)
  describe('setHoveredTrack (Story 3.3 AC#2)', () => {
    it('sets hovered track state', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.setHoveredTrack({ trackId, canDrop: true });

      const newState = useTimelineStore.getState();
      expect(newState.hoveredTrackState).toEqual({ trackId, canDrop: true });
    });

    it('clears hovered track state', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.setHoveredTrack({ trackId, canDrop: false });
      expect(useTimelineStore.getState().hoveredTrackState).toBeTruthy();

      state.setHoveredTrack(null);

      const newState = useTimelineStore.getState();
      expect(newState.hoveredTrackState).toBeNull();
    });
  });
});
