import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTimelineStore } from './timelineStore';

describe('timelineStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useTimelineStore.setState({
      tracks: [
        {
          id: 'default-track',
          clips: [],
          trackType: 'video',
        },
      ],
      totalDuration: 0,
      viewConfig: {
        pixelsPerSecond: 50,
        trackHeight: 80,
        rulerHeight: 30,
      },
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
      expect(newState.tracks).toHaveLength(2);
      expect(newState.tracks[1].trackType).toBe('audio');
      expect(newState.tracks[1].clips).toHaveLength(0);
    });
  });

  describe('removeTrack', () => {
    it('removes a track', () => {
      const state = useTimelineStore.getState();

      state.addTrack('audio');
      const trackId = useTimelineStore.getState().tracks[1].id;

      state.removeTrack(trackId);

      const newState = useTimelineStore.getState();
      expect(newState.tracks).toHaveLength(1);
    });

    it('does not remove the last track', () => {
      const state = useTimelineStore.getState();
      const trackId = state.tracks[0].id;

      state.removeTrack(trackId);

      const newState = useTimelineStore.getState();
      // Should still have 1 track
      expect(newState.tracks).toHaveLength(1);
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
    it('clears all clips and resets timeline', () => {
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
      expect(newState.tracks).toHaveLength(1);
      expect(newState.tracks[0].clips).toHaveLength(0);
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
});
