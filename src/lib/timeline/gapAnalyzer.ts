/**
 * Gap Analyzer for Timeline Composition
 * Story 5.4: Gap Handling with Black Frames
 *
 * Detects gaps in timeline tracks where no clips exist.
 * Supports gaps at start, middle, and end of timeline.
 * Provides per-track gap analysis for multi-track timelines.
 *
 * All timestamps in MILLISECONDS (ADR-005)
 */

import type { Track, Timeline } from '@/types/timeline';

/**
 * Detailed gap information with track context
 * Extends the basic Gap interface from clipOperations with additional metadata
 */
export interface GapSegment {
  /** Track ID where gap exists */
  trackId: string;
  /** Track type (video or audio) */
  trackType: 'video' | 'audio';
  /** Gap start time in milliseconds */
  startTime: number;
  /** Gap end time in milliseconds */
  endTime: number;
  /** Gap duration in milliseconds (calculated: endTime - startTime) */
  duration: number;
  /** Gap position type for categorization */
  position: 'start' | 'middle' | 'end';
}

/**
 * Gap analysis result for entire timeline
 */
export interface TimelineGapAnalysis {
  /** All gap segments across all tracks */
  gaps: GapSegment[];
  /** Total number of gaps */
  totalGaps: number;
  /** Whether ANY track has gaps */
  hasGaps: boolean;
  /** Tracks with gaps (track IDs) */
  tracksWithGaps: string[];
}

/**
 * Analyze timeline for gaps across all tracks
 * Detects gaps at start, middle, and end positions
 *
 * Algorithm:
 * 1. For each track, sort clips by startTime
 * 2. Check for gap before first clip (startTime > 0)
 * 3. Check for gaps between consecutive clips
 * 4. Check for gap after last clip (endTime < totalDuration)
 *
 * @param timeline - Timeline with tracks and clips
 * @returns Complete gap analysis with all gap segments
 */
export function analyzeTimelineGaps(timeline: Timeline): TimelineGapAnalysis {
  const gaps: GapSegment[] = [];
  const tracksWithGaps = new Set<string>();

  // Analyze each track independently
  for (const track of timeline.tracks) {
    const trackGaps = analyzeTrackGaps(track, timeline.totalDuration);
    gaps.push(...trackGaps);

    if (trackGaps.length > 0) {
      tracksWithGaps.add(track.id);
    }
  }

  return {
    gaps,
    totalGaps: gaps.length,
    hasGaps: gaps.length > 0,
    tracksWithGaps: Array.from(tracksWithGaps),
  };
}

/**
 * Analyze a single track for gaps
 * Detects gaps at start (before first clip), middle (between clips), and end (after last clip)
 *
 * @param track - Track to analyze
 * @param timelineDuration - Total timeline duration in milliseconds
 * @returns Array of gap segments found on this track
 */
export function analyzeTrackGaps(track: Track, timelineDuration: number): GapSegment[] {
  const gaps: GapSegment[] = [];

  // Empty track is one large gap from 0 to timeline end
  if (track.clips.length === 0) {
    if (timelineDuration > 0) {
      gaps.push({
        trackId: track.id,
        trackType: track.trackType,
        startTime: 0,
        endTime: timelineDuration,
        duration: timelineDuration,
        position: 'start', // Entire timeline is a start gap
      });
    }
    return gaps;
  }

  // Sort clips by startTime for sequential analysis
  const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime);

  // Check for gap at timeline start (before first clip)
  const firstClip = sortedClips[0];
  if (firstClip.startTime > 0) {
    gaps.push({
      trackId: track.id,
      trackType: track.trackType,
      startTime: 0,
      endTime: firstClip.startTime,
      duration: firstClip.startTime,
      position: 'start',
    });
  }

  // Check for gaps between consecutive clips (middle gaps)
  for (let i = 0; i < sortedClips.length - 1; i++) {
    const currentClip = sortedClips[i];
    const nextClip = sortedClips[i + 1];

    // Calculate where current clip ends
    const currentClipDuration = currentClip.trimOut - currentClip.trimIn;
    const currentClipEnd = currentClip.startTime + currentClipDuration;

    // Gap exists if next clip starts after current clip ends
    const gapDuration = nextClip.startTime - currentClipEnd;
    if (gapDuration > 0) {
      gaps.push({
        trackId: track.id,
        trackType: track.trackType,
        startTime: currentClipEnd,
        endTime: nextClip.startTime,
        duration: gapDuration,
        position: 'middle',
      });
    }
  }

  // Check for gap at timeline end (after last clip)
  const lastClip = sortedClips[sortedClips.length - 1];
  const lastClipDuration = lastClip.trimOut - lastClip.trimIn;
  const lastClipEnd = lastClip.startTime + lastClipDuration;

  if (lastClipEnd < timelineDuration) {
    gaps.push({
      trackId: track.id,
      trackType: track.trackType,
      startTime: lastClipEnd,
      endTime: timelineDuration,
      duration: timelineDuration - lastClipEnd,
      position: 'end',
    });
  }

  return gaps;
}

/**
 * Check if a specific time position falls within a gap
 * Used during playback to determine if black frame/silence should be rendered
 *
 * @param time - Timeline position in milliseconds
 * @param gaps - Array of gap segments to check against
 * @returns The gap segment if time is within a gap, null otherwise
 */
export function isTimeInGap(time: number, gaps: GapSegment[]): GapSegment | null {
  for (const gap of gaps) {
    // Inclusive start, exclusive end (consistent with clip boundary logic)
    if (time >= gap.startTime && time < gap.endTime) {
      return gap;
    }
  }
  return null;
}

/**
 * Get all gaps affecting a specific time across all tracks
 * Returns gaps for each track at the given time
 *
 * @param time - Timeline position in milliseconds
 * @param gaps - Array of gap segments from timeline analysis
 * @returns Array of gaps that overlap with the given time
 */
export function getGapsAtTime(time: number, gaps: GapSegment[]): GapSegment[] {
  return gaps.filter(gap => time >= gap.startTime && time < gap.endTime);
}

/**
 * Determine if ALL tracks have gaps at a specific time
 * Used to decide if entire composition should show black frame
 * (vs compositing only active tracks per multi-track strategy)
 *
 * @param time - Timeline position in milliseconds
 * @param timeline - Timeline with tracks and clips
 * @returns true if all tracks have gaps at this time, false otherwise
 */
export function areAllTracksInGap(time: number, timeline: Timeline): boolean {
  if (timeline.tracks.length === 0) {
    return true; // Empty timeline is always in gap
  }

  const analysis = analyzeTimelineGaps(timeline);
  const gapsAtTime = getGapsAtTime(time, analysis.gaps);

  // Check if we have a gap for EVERY track
  const tracksInGap = new Set(gapsAtTime.map(gap => gap.trackId));
  return tracksInGap.size === timeline.tracks.length;
}

/**
 * Get next gap boundary after current time
 * Used for optimization: jump to next gap start/end to minimize detection checks
 *
 * @param currentTime - Current timeline position in milliseconds
 * @param gaps - Array of gap segments
 * @returns Next gap boundary time (start or end), or null if no future gaps
 */
export function getNextGapBoundary(currentTime: number, gaps: GapSegment[]): number | null {
  let earliestBoundary: number | null = null;

  for (const gap of gaps) {
    // Check gap start boundary
    if (gap.startTime > currentTime) {
      if (earliestBoundary === null || gap.startTime < earliestBoundary) {
        earliestBoundary = gap.startTime;
      }
    }

    // Check gap end boundary
    if (gap.endTime > currentTime) {
      if (earliestBoundary === null || gap.endTime < earliestBoundary) {
        earliestBoundary = gap.endTime;
      }
    }
  }

  return earliestBoundary;
}
