/**
 * Timeline Clip Operations
 * Utilities for multi-clip sequencing, gap detection, and collision prevention
 * All timestamps in MILLISECONDS (ADR-005)
 */

import type { Clip, Track } from '@/types/timeline';
import { v4 as uuidv4 } from 'uuid';

/**
 * Gap between two clips on a timeline
 */
export interface Gap {
  startTime: number; // Gap start position (ms)
  endTime: number; // Gap end position (ms)
  duration: number; // Gap duration (ms)
}

/**
 * Calculate the sequential position for a new clip on a track
 * Returns the start time where the new clip should be placed to be end-to-end with existing clips
 *
 * @param track - The track to calculate position for
 * @returns Start time in milliseconds (0 if track is empty, or end time of last clip)
 */
export function calculateSequentialPosition(track: Track): number {
  if (track.clips.length === 0) {
    return 0; // First clip starts at timeline origin
  }

  // Find the last clip by startTime (clips should already be sorted in store)
  const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime);
  const lastClip = sortedClips[sortedClips.length - 1];

  // New clip starts where last clip ends
  // Effective duration = trimOut - trimIn
  const effectiveDuration = lastClip.trimOut - lastClip.trimIn;
  return lastClip.startTime + effectiveDuration;
}

/**
 * Detect gaps between clips on a track
 * A gap exists when there is time between the end of one clip and the start of the next
 *
 * @param track - The track to analyze
 * @returns Array of gaps found between clips
 */
export function detectGaps(track: Track): Gap[] {
  const gaps: Gap[] = [];

  if (track.clips.length < 2) {
    return gaps; // No gaps possible with 0 or 1 clip
  }

  const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime);

  for (let i = 0; i < sortedClips.length - 1; i++) {
    const currentClip = sortedClips[i];
    const nextClip = sortedClips[i + 1];

    // Calculate where current clip ends
    const currentEnd = currentClip.startTime + (currentClip.trimOut - currentClip.trimIn);

    // Calculate gap size
    const gapSize = nextClip.startTime - currentEnd;

    // Only add if there's an actual gap (positive duration)
    if (gapSize > 0) {
      gaps.push({
        startTime: currentEnd,
        endTime: nextClip.startTime,
        duration: gapSize,
      });
    }
  }

  return gaps;
}

/**
 * Check if a clip would overlap with existing clips on a track
 * Used for collision detection when positioning clips
 *
 * @param clip - The clip to check (with proposed startTime)
 * @param track - The track to check against
 * @param excludeClipId - Optional clip ID to exclude (useful when moving existing clip)
 * @returns true if clip would overlap, false if position is valid
 */
export function detectClipOverlap(
  clip: Clip,
  track: Track,
  excludeClipId?: string
): boolean {
  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + (clip.trimOut - clip.trimIn);

  for (const existingClip of track.clips) {
    // Skip the clip being moved (if repositioning existing clip)
    if (excludeClipId && existingClip.id === excludeClipId) {
      continue;
    }

    const existingStart = existingClip.startTime;
    const existingEnd = existingClip.startTime + (existingClip.trimOut - existingClip.trimIn);

    // Check for overlap: clip starts before existing ends AND clip ends after existing starts
    const overlaps =
      clipStart < existingEnd && clipEnd > existingStart;

    if (overlaps) {
      return true;
    }
  }

  return false;
}

/**
 * Validate that a clip's position is valid (no negative time, no overlaps)
 *
 * @param clip - The clip to validate
 * @param track - The track the clip belongs to
 * @param excludeClipId - Optional clip ID to exclude from overlap check
 * @returns true if position is valid, false otherwise
 */
export function validateClipPosition(
  clip: Clip,
  track: Track,
  excludeClipId?: string
): boolean {
  // Check for negative start time
  if (clip.startTime < 0) {
    return false;
  }

  // Check for overlaps with other clips
  if (detectClipOverlap(clip, track, excludeClipId)) {
    return false;
  }

  return true;
}

/**
 * Find the clip at a specific time position on a track
 * Used for playback to determine which clip should be playing
 *
 * @param track - The track to search
 * @param time - The timeline position in milliseconds
 * @returns The clip at that position, or null if no clip exists
 */
export function findClipAtTime(track: Track, time: number): Clip | null {
  for (const clip of track.clips) {
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + (clip.trimOut - clip.trimIn);

    // Check if time falls within this clip's range
    if (time >= clipStart && time < clipEnd) {
      return clip;
    }
  }

  return null;
}

/**
 * Find the first clip at a specific time position across all tracks
 * Searches all tracks to find any clip at the given timeline position
 *
 * @param tracks - Array of tracks to search
 * @param time - The timeline position in milliseconds
 * @returns Object with clip and trackId, or null if no clip exists at that position
 */
export function findClipAtPlayhead(
  tracks: Track[],
  time: number
): { clip: Clip; trackId: string } | null {
  for (const track of tracks) {
    const clip = findClipAtTime(track, time);
    if (clip) {
      return { clip, trackId: track.id };
    }
  }
  return null;
}

/**
 * Get the effective duration of a clip (accounting for trim)
 *
 * @param clip - The clip to calculate duration for
 * @returns Effective duration in milliseconds
 */
export function getEffectiveDuration(clip: Clip): number {
  return clip.trimOut - clip.trimIn;
}

/**
 * Split a clip at a specific time position
 * Creates two new clips from the original, adjusting trim points and positions
 *
 * @param clip - The clip to split
 * @param splitTime - The timeline position to split at (ms)
 * @returns Tuple of [firstClip, secondClip] or null if split is invalid
 */
export function splitClipAtTime(clip: Clip, splitTime: number): [Clip, Clip] | null {
  // Round splitTime immediately to ensure integer arithmetic throughout
  splitTime = Math.round(splitTime);

  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + (clip.trimOut - clip.trimIn);

  // Validate split point is within clip bounds (not at edges)
  if (splitTime <= clipStart || splitTime >= clipEnd) {
    return null;
  }

  // Calculate split point relative to clip's internal timeline
  // All values are integers now since we rounded splitTime at the start
  const splitOffset = splitTime - clipStart;
  const splitPointInFile = clip.trimIn + splitOffset;

  // First clip: from original start to split point
  const firstClip: Clip = {
    id: uuidv4(),
    filePath: clip.filePath,
    startTime: clip.startTime, // Keep original startTime
    duration: clip.duration,
    trimIn: clip.trimIn,
    trimOut: splitPointInFile,
    fadeIn: clip.fadeIn,
    fadeOut: 0,
    volume: clip.volume,
    muted: clip.muted,
    audioTracks: clip.audioTracks,
    transform: clip.transform,
  };

  // Second clip: from split point to original end
  // Use rounded splitTime directly to ensure no gap
  const secondClip: Clip = {
    id: uuidv4(),
    filePath: clip.filePath,
    startTime: splitTime, // This is exactly where first clip ends
    duration: clip.duration,
    trimIn: splitPointInFile,
    trimOut: clip.trimOut,
    fadeIn: 0,
    fadeOut: clip.fadeOut,
    volume: clip.volume,
    muted: clip.muted,
    audioTracks: clip.audioTracks,
    transform: clip.transform,
  };

  return [firstClip, secondClip];
}

/**
 * Calculate the shift amount for ripple delete
 * Returns the effective duration of the deleted clip
 *
 * @param deletedClip - The clip being deleted
 * @returns Shift amount in milliseconds
 */
export function calculateRippleShift(deletedClip: Clip): number {
  return deletedClip.trimOut - deletedClip.trimIn;
}

/**
 * Delete a clip from a clips array with optional ripple
 * If ripple=true, shifts all subsequent clips left by the deleted clip's duration
 * If ripple=false, leaves a gap at the deleted position
 *
 * @param clips - Array of clips on the track
 * @param clipId - ID of the clip to delete
 * @param ripple - Whether to shift subsequent clips left (ripple delete)
 * @returns New clips array with clip removed and positions adjusted if ripple=true
 */
export function deleteClip(clips: Clip[], clipId: string, ripple: boolean): Clip[] {
  const clipIndex = clips.findIndex((c) => c.id === clipId);

  if (clipIndex === -1) {
    return clips; // Clip not found, return unchanged
  }

  const deletedClip = clips[clipIndex];
  const clipDuration = calculateRippleShift(deletedClip);

  // Remove the clip
  const updatedClips = clips.filter((c) => c.id !== clipId);

  // If ripple delete, shift subsequent clips left
  if (ripple) {
    return updatedClips.map((clip) => {
      if (clip.startTime > deletedClip.startTime) {
        return {
          ...clip,
          startTime: clip.startTime - clipDuration,
        };
      }
      return clip;
    });
  }

  // Gap delete: leave clips at current positions
  return updatedClips;
}

/**
 * Maximum allowed fade duration per AC #3 (5 seconds)
 */
export const MAX_FADE_DURATION_MS = 5000;

/**
 * Validate fade durations for a clip
 * Ensures that fade durations meet all requirements:
 * - Non-negative values
 * - Not exceeding maximum allowed duration (5 seconds per AC #3)
 * - Combined fadeIn + fadeOut not exceeding clip's effective duration
 *
 * @param clip - The clip to validate
 * @param fadeIn - Proposed fade-in duration in milliseconds (optional, defaults to clip's fadeIn)
 * @param fadeOut - Proposed fade-out duration in milliseconds (optional, defaults to clip's fadeOut)
 * @returns true if fade durations are valid, false otherwise
 */
export function validateFadeDuration(
  clip: Clip,
  fadeIn?: number,
  fadeOut?: number
): boolean {
  const effectiveDuration = getEffectiveDuration(clip);
  const proposedFadeIn = fadeIn !== undefined ? fadeIn : (clip.fadeIn ?? 0);
  const proposedFadeOut = fadeOut !== undefined ? fadeOut : (clip.fadeOut ?? 0);

  // Check non-negative
  if (proposedFadeIn < 0 || proposedFadeOut < 0) {
    console.warn('Fade durations must be non-negative');
    return false;
  }

  // Check max duration (5 seconds = 5000ms per AC #3)
  if (proposedFadeIn > MAX_FADE_DURATION_MS || proposedFadeOut > MAX_FADE_DURATION_MS) {
    console.warn(`Fade durations must not exceed ${MAX_FADE_DURATION_MS}ms (5 seconds)`);
    return false;
  }

  // Check doesn't exceed clip duration
  if (proposedFadeIn + proposedFadeOut > effectiveDuration) {
    console.warn(`Combined fade durations (${proposedFadeIn + proposedFadeOut}ms) exceed clip duration (${effectiveDuration}ms)`);
    return false;
  }

  return true;
}
