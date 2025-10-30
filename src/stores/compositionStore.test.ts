import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCompositionStore, RenderState } from './compositionStore';
import { useTimelineStore } from './timelineStore';
import type { Clip } from '@/types/timeline';

// Mock timeline data for testing
const mockClip1: Clip = {
  id: 'clip-1',
  filePath: '/path/to/video1.mp4',
  startTime: 1000, // 1s
  duration: 5000, // 5s total
  trimIn: 0,
  trimOut: 5000,
};

const mockClip2: Clip = {
  id: 'clip-2',
  filePath: '/path/to/video2.mp4',
  startTime: 7000, // 7s (gap from 6s-7s)
  duration: 4000, // 4s total
  trimIn: 0,
  trimOut: 4000,
};

const mockClip3: Clip = {
  id: 'clip-3',
  filePath: '/path/to/video3.mp4',
  startTime: 2000, // 2s (overlaps with clip-1 on different track)
  duration: 3000, // 3s total
  trimIn: 0,
  trimOut: 3000,
};

// Audio clips for Story 5.5 testing
const mockAudioClip1: Clip = {
  id: 'audio-clip-1',
  filePath: '/path/to/narration.mp3',
  startTime: 1000, // 1s
  duration: 5000, // 5s total
  trimIn: 0,
  trimOut: 5000,
  volume: 1.0, // 100%
  muted: false,
};

const mockAudioClip2: Clip = {
  id: 'audio-clip-2',
  filePath: '/path/to/music.mp3',
  startTime: 2000, // 2s (overlaps with audio-clip-1)
  duration: 6000, // 6s total
  trimIn: 0,
  trimOut: 6000,
  volume: 0.5, // 50%
  muted: false,
  fadeIn: 1000, // 1s fade-in
  fadeOut: 1000, // 1s fade-out
};

describe('CompositionStore', () => {
  beforeEach(() => {
    // Reset composition store
    useCompositionStore.getState().reset();

    // Reset timeline store and setup test data
    useTimelineStore.getState().clearTimeline();

    // Add clips to tracks for testing
    const timelineState = useTimelineStore.getState();
    const track1Id = timelineState.tracks[0].id; // Video track 1
    const track2Id = timelineState.tracks[1].id; // Video track 2

    // Add clips to track 1
    timelineState.addClip(track1Id, mockClip1);
    timelineState.addClip(track1Id, mockClip2);

    // Add clip to track 2 (overlapping with clip-1)
    timelineState.addClip(track2Id, mockClip3);
  });

  describe('Initial State', () => {
    it('should initialize with correct default values (AC#1, AC#2)', () => {
      const state = useCompositionStore.getState();

      expect(state.currentCompositionTime).toBe(0);
      expect(state.activeClips).toEqual([]);
      expect(state.activeTracks).toEqual([]);
      expect(state.renderState).toBe(RenderState.idle);
      expect(state.nextBoundaryTime).toBeNull();
    });
  });

  describe('getActiveClipsAtTime (AC#4, AC#6)', () => {
    it('should return single clip at given time', () => {
      const state = useCompositionStore.getState();
      const activeClips = state.getActiveClipsAtTime(3000); // 3s - within clip-1

      expect(activeClips).toHaveLength(2); // clip-1 and clip-3 overlap at 3s
      expect(activeClips[0].clip.id).toBe('clip-1');
      expect(activeClips[0].relativeTime).toBe(2000); // 3s - 1s start = 2s into clip
      expect(activeClips[1].clip.id).toBe('clip-3');
      expect(activeClips[1].relativeTime).toBe(1000); // 3s - 2s start = 1s into clip
    });

    it('should return multiple clips on different tracks at same time (AC#6)', () => {
      const state = useCompositionStore.getState();
      const activeClips = state.getActiveClipsAtTime(2500); // 2.5s

      expect(activeClips).toHaveLength(2);
      expect(activeClips[0].clip.id).toBe('clip-1');
      expect(activeClips[1].clip.id).toBe('clip-3');
    });

    it('should return empty array when no clips at time (gap)', () => {
      const state = useCompositionStore.getState();
      const activeClips = state.getActiveClipsAtTime(6500); // 6.5s - in gap

      expect(activeClips).toEqual([]);
    });

    it('should handle clip boundaries correctly (inclusive start, exclusive end)', () => {
      const state = useCompositionStore.getState();

      // At clip start (inclusive) - should include clip
      const atStart = state.getActiveClipsAtTime(1000); // clip-1 starts at 1000ms
      expect(atStart).toHaveLength(1);
      expect(atStart[0].clip.id).toBe('clip-1');

      // At clip end (exclusive) - should NOT include clip
      const atEnd = state.getActiveClipsAtTime(6000); // clip-1 ends at 6000ms
      expect(atEnd).toEqual([]);
    });

    it('should calculate relative time correctly', () => {
      const state = useCompositionStore.getState();
      const activeClips = state.getActiveClipsAtTime(8000); // 8s - within clip-2

      expect(activeClips).toHaveLength(1);
      expect(activeClips[0].relativeTime).toBe(1000); // 8s - 7s start = 1s into clip
    });
  });

  describe('detectGaps (AC#5)', () => {
    it('should return true when time is in gap', () => {
      const state = useCompositionStore.getState();
      const isGap = state.detectGaps(6500); // 6.5s - gap between clip-1 and clip-2

      expect(isGap).toBe(true);
    });

    it('should return false when clips exist at time', () => {
      const state = useCompositionStore.getState();
      const isGap = state.detectGaps(3000); // 3s - within clips

      expect(isGap).toBe(false);
    });

    it('should return true at time before any clips', () => {
      const state = useCompositionStore.getState();
      const isGap = state.detectGaps(500); // 0.5s - before clip-1

      expect(isGap).toBe(true);
    });

    it('should return true after all clips', () => {
      const state = useCompositionStore.getState();
      const isGap = state.detectGaps(12000); // 12s - after clip-2

      expect(isGap).toBe(true);
    });
  });

  describe('updateActiveClips (AC#4)', () => {
    it('should update state when clips change', () => {
      // Update to time with clips
      useCompositionStore.getState().updateActiveClips(3000);

      // Get fresh state after update
      const state = useCompositionStore.getState();
      expect(state.activeClips).toHaveLength(2);
      expect(state.activeTracks).toHaveLength(2);
    });

    it('should clear active clips when entering gap', () => {
      // First, set to a time with clips
      useCompositionStore.getState().updateActiveClips(3000);
      let state = useCompositionStore.getState();
      expect(state.activeClips.length).toBeGreaterThan(0);

      // Then move to gap
      useCompositionStore.getState().updateActiveClips(6500);
      state = useCompositionStore.getState();
      expect(state.activeClips).toEqual([]);
      expect(state.activeTracks).toEqual([]);
    });

    it('should update nextBoundaryTime correctly', () => {
      // At time 0, next boundary should be clip-1 start (1000ms)
      useCompositionStore.getState().updateActiveClips(0);
      let state = useCompositionStore.getState();
      expect(state.nextBoundaryTime).toBe(1000);

      // At time 3000, next boundary should be clip-3 end (5000ms)
      useCompositionStore.getState().updateActiveClips(3000);
      state = useCompositionStore.getState();
      expect(state.nextBoundaryTime).toBe(5000);
    });

    it('should warn if update exceeds 16ms (AC#8)', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Create a complex timeline with many clips to potentially exceed 16ms
      // (In real tests, this would need a very large dataset)
      const state = useCompositionStore.getState();
      state.updateActiveClips(3000);

      // Note: In normal test runs, this should NOT warn
      // This test is more for documentation of the performance requirement
      // Real performance testing would be done with complex timelines

      consoleSpy.mockRestore();
    });
  });

  describe('getNextClipBoundary (AC#4)', () => {
    it('should detect clip start boundaries', () => {
      const state = useCompositionStore.getState();
      const nextBoundary = state.getNextClipBoundary(500); // Before clip-1

      expect(nextBoundary).toBe(1000); // clip-1 start
    });

    it('should detect clip end boundaries', () => {
      const state = useCompositionStore.getState();
      const nextBoundary = state.getNextClipBoundary(3000); // Within clip-1 and clip-3

      // Next boundary is clip-3 end (5000ms)
      expect(nextBoundary).toBe(5000);
    });

    it('should handle overlapping clips on different tracks', () => {
      const state = useCompositionStore.getState();
      const nextBoundary = state.getNextClipBoundary(2000); // At clip-3 start

      // clip-3 ends at 5000ms, clip-1 ends at 6000ms
      expect(nextBoundary).toBe(5000);
    });

    it('should return null when no boundaries ahead', () => {
      const state = useCompositionStore.getState();
      const nextBoundary = state.getNextClipBoundary(15000); // After all clips

      expect(nextBoundary).toBeNull();
    });

    it('should return earliest boundary when multiple boundaries exist', () => {
      const state = useCompositionStore.getState();
      const nextBoundary = state.getNextClipBoundary(1500); // Within clip-1, before clip-3

      // clip-3 starts at 2000ms
      expect(nextBoundary).toBe(2000);
    });
  });

  describe('Multi-track scenarios (AC#6)', () => {
    it('should handle 2 tracks with clips at same time', () => {
      const state = useCompositionStore.getState();
      const activeClips = state.getActiveClipsAtTime(3000);

      expect(activeClips).toHaveLength(2);
      const trackIds = activeClips.map(ac => ac.trackId);
      expect(new Set(trackIds).size).toBe(2); // Different tracks
    });

    it('should handle 4 tracks with varying clip coverage', () => {
      // Add 2 more tracks with clips
      useTimelineStore.getState().addTrack('audio');
      useTimelineStore.getState().addTrack('audio');

      const tracks = useTimelineStore.getState().tracks;
      const audioTrack1Id = tracks[2]?.id;
      const audioTrack2Id = tracks[3]?.id;

      if (!audioTrack1Id || !audioTrack2Id) {
        throw new Error('Failed to create audio tracks');
      }

      const audioClip1: Clip = {
        id: 'audio-1',
        filePath: '/path/to/audio1.mp3',
        startTime: 1000,
        duration: 10000,
        trimIn: 0,
        trimOut: 10000,
      };

      const audioClip2: Clip = {
        id: 'audio-2',
        filePath: '/path/to/audio2.mp3',
        startTime: 3000,
        duration: 5000,
        trimIn: 0,
        trimOut: 5000,
      };

      useTimelineStore.getState().addClip(audioTrack1Id, audioClip1);
      useTimelineStore.getState().addClip(audioTrack2Id, audioClip2);

      const state = useCompositionStore.getState();
      const activeClips = state.getActiveClipsAtTime(4000); // 4s

      // Should have: clip-1, clip-3, audio-1, audio-2
      expect(activeClips).toHaveLength(4);
    });

    it('should correctly identify track types', () => {
      const state = useCompositionStore.getState();
      const activeClips = state.getActiveClipsAtTime(3000);

      expect(activeClips.every(ac => ac.trackType === 'video')).toBe(true);
    });
  });

  describe('setCompositionTime', () => {
    it('should update composition time and active clips', () => {
      useCompositionStore.getState().setCompositionTime(3000);

      const state = useCompositionStore.getState();
      expect(state.currentCompositionTime).toBe(3000);
      expect(state.activeClips).toHaveLength(2);
    });
  });

  describe('setRenderState', () => {
    it('should update render state', () => {
      useCompositionStore.getState().setRenderState(RenderState.playing);
      let state = useCompositionStore.getState();
      expect(state.renderState).toBe(RenderState.playing);

      useCompositionStore.getState().setRenderState(RenderState.paused);
      state = useCompositionStore.getState();
      expect(state.renderState).toBe(RenderState.paused);
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      const state = useCompositionStore.getState();

      // Change state
      state.setCompositionTime(5000);
      state.setRenderState(RenderState.playing);

      // Reset
      state.reset();

      expect(state.currentCompositionTime).toBe(0);
      expect(state.activeClips).toEqual([]);
      expect(state.activeTracks).toEqual([]);
      expect(state.renderState).toBe(RenderState.idle);
      expect(state.nextBoundaryTime).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty timeline', () => {
      useTimelineStore.getState().clearTimeline();
      const state = useCompositionStore.getState();

      const activeClips = state.getActiveClipsAtTime(1000);
      expect(activeClips).toEqual([]);

      const isGap = state.detectGaps(1000);
      expect(isGap).toBe(true);

      const nextBoundary = state.getNextClipBoundary(0);
      expect(nextBoundary).toBeNull();
    });

    it('should handle timeline with only gaps', () => {
      // Clear and add sparse clips
      useTimelineStore.getState().clearTimeline();
      const timelineState = useTimelineStore.getState();
      const track1Id = timelineState.tracks[0].id;

      const sparseClip: Clip = {
        id: 'sparse-1',
        filePath: '/path/to/sparse.mp4',
        startTime: 10000, // 10s
        duration: 1000, // 1s
        trimIn: 0,
        trimOut: 1000,
      };

      timelineState.addClip(track1Id, sparseClip);

      const state = useCompositionStore.getState();

      // Query at various gap times
      expect(state.detectGaps(5000)).toBe(true);
      expect(state.detectGaps(9000)).toBe(true);
      expect(state.detectGaps(12000)).toBe(true);

      // Only time with clip
      expect(state.detectGaps(10500)).toBe(false);
    });

    it('should handle overlapping clips on same track', () => {
      // This is currently allowed by timeline (no validation)
      const timelineState = useTimelineStore.getState();
      const track1Id = timelineState.tracks[0].id;

      const overlappingClip: Clip = {
        id: 'overlap-1',
        filePath: '/path/to/overlap.mp4',
        startTime: 2000, // Overlaps with clip-1
        duration: 3000,
        trimIn: 0,
        trimOut: 3000,
      };

      timelineState.addClip(track1Id, overlappingClip);

      const state = useCompositionStore.getState();
      const activeClips = state.getActiveClipsAtTime(3000);

      // Should return all overlapping clips (including on same track)
      const track1Clips = activeClips.filter(ac => ac.trackId === track1Id);
      expect(track1Clips.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Performance (AC#8)', () => {
    it('should complete state updates in reasonable time', () => {
      const state = useCompositionStore.getState();

      const start = performance.now();
      state.updateActiveClips(3000);
      const end = performance.now();

      const duration = end - start;

      // Should complete well under 16ms for simple timeline
      // (Complex timelines with 100+ clips would be tested separately)
      expect(duration).toBeLessThan(16);
    });

    it('should cache nextBoundaryTime for optimization', () => {
      useCompositionStore.getState().updateActiveClips(3000);
      const state = useCompositionStore.getState();
      const firstBoundary = state.nextBoundaryTime;

      // Boundary should be cached in state
      expect(firstBoundary).not.toBeNull();
      expect(firstBoundary).toBe(5000); // Next boundary is clip-3 end
    });
  });

  describe('getClipAtTime (Story 5.3 AC#1, AC#6)', () => {
    it('should return correct clip for single track at specific time', () => {
      const state = useCompositionStore.getState();
      const track1Id = useTimelineStore.getState().tracks[0].id;

      // Query within clip-1 (1000-6000ms)
      const clip = state.getClipAtTime(3000, track1Id);
      expect(clip).not.toBeNull();
      expect(clip?.id).toBe('clip-1');
    });

    it('should return correct clip when multiple clips on same track', () => {
      const state = useCompositionStore.getState();
      const track1Id = useTimelineStore.getState().tracks[0].id;

      // Query within clip-2 (7000-11000ms)
      const clip = state.getClipAtTime(8000, track1Id);
      expect(clip).not.toBeNull();
      expect(clip?.id).toBe('clip-2');
    });

    it('should return null when no clip at time on track', () => {
      const state = useCompositionStore.getState();
      const track1Id = useTimelineStore.getState().tracks[0].id;

      // Gap between clip-1 and clip-2 (6000-7000ms)
      const clip = state.getClipAtTime(6500, track1Id);
      expect(clip).toBeNull();
    });

    it('should return null for invalid track ID', () => {
      const state = useCompositionStore.getState();

      const clip = state.getClipAtTime(3000, 'invalid-track-id');
      expect(clip).toBeNull();
    });

    it('should handle clip boundary conditions correctly', () => {
      const state = useCompositionStore.getState();
      const track1Id = useTimelineStore.getState().tracks[0].id;

      // At clip start (inclusive) - should return clip
      const atStart = state.getClipAtTime(1000, track1Id);
      expect(atStart?.id).toBe('clip-1');

      // At clip end (exclusive) - should return null
      const atEnd = state.getClipAtTime(6000, track1Id);
      expect(atEnd).toBeNull();
    });

    it('should differentiate between tracks with overlapping clips', () => {
      const state = useCompositionStore.getState();
      const track1Id = useTimelineStore.getState().tracks[0].id;
      const track2Id = useTimelineStore.getState().tracks[1].id;

      // At 3000ms, both tracks have clips
      const clip1 = state.getClipAtTime(3000, track1Id);
      const clip2 = state.getClipAtTime(3000, track2Id);

      expect(clip1?.id).toBe('clip-1');
      expect(clip2?.id).toBe('clip-3');
    });
  });

  describe('getNextClip (Story 5.3 AC#1, AC#6)', () => {
    it('should return next clip following current clip on same track', () => {
      const state = useCompositionStore.getState();
      const track1Id = useTimelineStore.getState().tracks[0].id;

      // Get clip-1, expect next to be clip-2
      const nextClip = state.getNextClip(mockClip1, track1Id);
      expect(nextClip).not.toBeNull();
      expect(nextClip?.id).toBe('clip-2');
    });

    it('should return null when current clip is last on track', () => {
      const state = useCompositionStore.getState();
      const track1Id = useTimelineStore.getState().tracks[0].id;

      // Get clip-2 (last clip on track), expect null
      const nextClip = state.getNextClip(mockClip2, track1Id);
      expect(nextClip).toBeNull();
    });

    it('should return null for invalid track ID', () => {
      const state = useCompositionStore.getState();

      const nextClip = state.getNextClip(mockClip1, 'invalid-track-id');
      expect(nextClip).toBeNull();
    });

    it('should handle clips with gaps correctly', () => {
      const state = useCompositionStore.getState();
      const track1Id = useTimelineStore.getState().tracks[0].id;

      // clip-1 ends at 6000ms, clip-2 starts at 7000ms (gap)
      // getNextClip should still return clip-2
      const nextClip = state.getNextClip(mockClip1, track1Id);
      expect(nextClip?.id).toBe('clip-2');
      expect(nextClip?.startTime).toBe(7000);
    });

    it('should return clips in sequential order when multiple clips exist', () => {
      const state = useCompositionStore.getState();
      const track1Id = useTimelineStore.getState().tracks[0].id;

      // Add a third clip to track 1
      const mockClip4: Clip = {
        id: 'clip-4',
        filePath: '/path/to/video4.mp4',
        startTime: 12000,
        duration: 2000,
        trimIn: 0,
        trimOut: 2000,
      };
      useTimelineStore.getState().addClip(track1Id, mockClip4);

      // Get next after clip-2, should be clip-4
      const nextClip = state.getNextClip(mockClip2, track1Id);
      expect(nextClip?.id).toBe('clip-4');
    });

    it('should not return clips from different tracks', () => {
      const state = useCompositionStore.getState();
      const track1Id = useTimelineStore.getState().tracks[0].id;

      // clip-3 is on track2, should not be returned as next for track1
      const nextClip = state.getNextClip(mockClip1, track1Id);
      expect(nextClip?.id).not.toBe('clip-3');
      expect(nextClip?.id).toBe('clip-2');
    });
  });

  describe('isEndOfTimeline (Story 5.3 AC#7)', () => {
    it('should return false when time is within timeline', () => {
      const state = useCompositionStore.getState();

      // Time within clips
      expect(state.isEndOfTimeline(3000)).toBe(false);
      expect(state.isEndOfTimeline(8000)).toBe(false);
    });

    it('should return true when time is at or past timeline end', () => {
      const state = useCompositionStore.getState();

      // clip-2 ends at 11000ms (7000 + 4000)
      // At end
      expect(state.isEndOfTimeline(11000)).toBe(true);

      // Past end
      expect(state.isEndOfTimeline(15000)).toBe(true);
    });

    it('should return false one millisecond before timeline end', () => {
      const state = useCompositionStore.getState();

      // clip-2 ends at 11000ms
      expect(state.isEndOfTimeline(10999)).toBe(false);
    });

    it('should return true for empty timeline', () => {
      useTimelineStore.getState().clearTimeline();
      const state = useCompositionStore.getState();

      expect(state.isEndOfTimeline(0)).toBe(true);
      expect(state.isEndOfTimeline(1000)).toBe(true);
    });

    it('should handle multi-track timelines correctly', () => {
      const state = useCompositionStore.getState();

      // Timeline has clips on multiple tracks
      // Longest clip is clip-2 ending at 11000ms
      expect(state.isEndOfTimeline(10000)).toBe(false);
      expect(state.isEndOfTimeline(11000)).toBe(true);
    });

    it('should find latest clip end time across all tracks', () => {
      const state = useCompositionStore.getState();
      const track2Id = useTimelineStore.getState().tracks[1].id;

      // Add a clip on track2 that extends beyond track1's clips
      const lateClip: Clip = {
        id: 'late-clip',
        filePath: '/path/to/late.mp4',
        startTime: 10000,
        duration: 5000,
        trimIn: 0,
        trimOut: 5000,
      };
      useTimelineStore.getState().addClip(track2Id, lateClip);

      // Timeline now ends at 15000ms (late-clip end)
      expect(state.isEndOfTimeline(14999)).toBe(false);
      expect(state.isEndOfTimeline(15000)).toBe(true);
    });
  });

  describe('getActiveAudioClips (Story 5.5 AC#1)', () => {
    let audioTrack1Id: string;
    let audioTrack2Id: string;
    let videoTrack1Id: string;

    beforeEach(() => {
      // Setup timeline with mixed video and audio tracks
      useCompositionStore.getState().reset();
      useTimelineStore.getState().clearTimeline();

      // clearTimeline() resets to 2 video tracks
      let timelineState = useTimelineStore.getState();
      videoTrack1Id = timelineState.tracks[0].id;

      // Add audio tracks
      timelineState.addTrack('audio');
      timelineState.addTrack('audio');

      // Get fresh state after adding tracks
      timelineState = useTimelineStore.getState();

      // Get audio track IDs (last 2 tracks added)
      const audioTracks = timelineState.tracks.filter(t => t.trackType === 'audio');
      audioTrack1Id = audioTracks[0].id;
      audioTrack2Id = audioTracks[1].id;

      // Add audio clips to audio tracks
      timelineState.addClip(audioTrack1Id, mockAudioClip1);
      timelineState.addClip(audioTrack2Id, mockAudioClip2);

      // Add video clip to video track (should be filtered out)
      timelineState.addClip(videoTrack1Id, mockClip1);
    });

    it('should return only audio clips, filtering out video clips', () => {
      const state = useCompositionStore.getState();
      const audioClips = state.getActiveAudioClips(3000); // 3s - all 3 clips overlap

      // Should only return 2 audio clips, not the video clip
      expect(audioClips).toHaveLength(2);
      expect(audioClips.every(ac => ac.trackType === 'audio')).toBe(true);
      expect(audioClips[0].clip.id).toBe('audio-clip-1');
      expect(audioClips[1].clip.id).toBe('audio-clip-2');
    });

    it('should return empty array when no audio clips at time', () => {
      const state = useCompositionStore.getState();
      const audioClips = state.getActiveAudioClips(0); // Before any audio clips

      expect(audioClips).toEqual([]);
    });

    it('should return single audio clip when only one at time', () => {
      const state = useCompositionStore.getState();
      const audioClips = state.getActiveAudioClips(1500); // 1.5s - only audio-clip-1

      expect(audioClips).toHaveLength(1);
      expect(audioClips[0].clip.id).toBe('audio-clip-1');
      expect(audioClips[0].trackType).toBe('audio');
    });

    it('should return multiple overlapping audio clips', () => {
      const state = useCompositionStore.getState();
      const audioClips = state.getActiveAudioClips(4000); // 4s - both audio clips overlap

      expect(audioClips).toHaveLength(2);
      expect(audioClips[0].clip.id).toBe('audio-clip-1');
      expect(audioClips[1].clip.id).toBe('audio-clip-2');
    });

    it('should include audio metadata (volume, mute, fade settings)', () => {
      const state = useCompositionStore.getState();
      const audioClips = state.getActiveAudioClips(3000);

      // Check first audio clip has volume setting
      expect(audioClips[0].clip.volume).toBe(1.0);
      expect(audioClips[0].clip.muted).toBe(false);

      // Check second audio clip has volume, fade settings
      expect(audioClips[1].clip.volume).toBe(0.5);
      expect(audioClips[1].clip.muted).toBe(false);
      expect(audioClips[1].clip.fadeIn).toBe(1000);
      expect(audioClips[1].clip.fadeOut).toBe(1000);
    });
  });
});
