import React, { useState, useCallback } from 'react';
import { Trash2, Video, Music, Scissors, RotateCcw, Clock } from 'lucide-react';
import { useTimelineStore } from '@/stores/timelineStore';
import { usePlayerStore } from '@/stores/playerStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getEffectiveDuration } from '@/lib/timeline/clipOperations';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * TrackManagementControls Component
 *
 * Provides UI controls for adding and removing timeline tracks
 * - Add Video Track
 * - Add Audio Track
 * - Track count display
 * - Keyboard shortcut: Cmd+T to add track (TODO)
 *
 * Story 4.9: Timeline Track Management UI
 */
export function TrackManagementControls() {
  const tracks = useTimelineStore((state) => state.tracks);
  const addTrack = useTimelineStore((state) => state.addTrack);
  const removeTrack = useTimelineStore((state) => state.removeTrack);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const getClip = useTimelineStore((state) => state.getClip);
  const resetTrim = useTimelineStore((state) => state.resetTrim);
  const splitClip = useTimelineStore((state) => state.splitClip);
  const fixedDuration = useTimelineStore((state) => state.fixedDuration);
  const setFixedDuration = useTimelineStore((state) => state.setFixedDuration);

  const playheadPosition = usePlayerStore((state) => state.playheadPosition);

  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [trackToRemove, setTrackToRemove] = useState<string | null>(null);
  const [durationInput, setDurationInput] = useState<string>('');

  // Format duration as MM:SS
  const formatDuration = (ms: number | null): string => {
    if (ms === null) return '';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Parse MM:SS to milliseconds
  const parseDuration = (input: string): number | null => {
    const match = input.match(/^(\d+):(\d{2})$/);
    if (!match) return null;
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    if (seconds >= 60) return null;
    return (minutes * 60 + seconds) * 1000;
  };

  // Find clip at playhead position
  const findClipAtPlayhead = useCallback(() => {
    for (const track of tracks) {
      for (const clip of track.clips) {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + getEffectiveDuration(clip);

        if (playheadPosition >= clipStart && playheadPosition < clipEnd) {
          return clip;
        }
      }
    }
    return null;
  }, [tracks, playheadPosition]);

  // Check if selected clip has been trimmed
  const selectedClip = selectedClipId ? getClip(selectedClipId) : null;
  const showResetButton = selectedClip && (
    selectedClip.trimIn > 0 || selectedClip.trimOut < selectedClip.duration
  );

  // Check if playhead is over a clip (for split button)
  const clipAtPlayhead = findClipAtPlayhead();
  const showSplitButton = clipAtPlayhead !== null;

  /**
   * Add a video track to the timeline
   */
  const handleAddVideoTrack = () => {
    addTrack('video');
  };

  /**
   * Add an audio track to the timeline
   */
  const handleAddAudioTrack = () => {
    addTrack('audio');
  };

  /**
   * Request to remove last track (with confirmation)
   */
  const handleRequestRemoveTrack = () => {
    if (tracks.length > 2) {
      // Get last track ID
      const lastTrack = tracks[tracks.length - 1];
      setTrackToRemove(lastTrack.id);
      setShowRemoveDialog(true);
    }
  };

  /**
   * Confirm and remove track
   */
  const handleConfirmRemove = () => {
    if (trackToRemove) {
      removeTrack(trackToRemove);
      setTrackToRemove(null);
    }
    setShowRemoveDialog(false);
  };

  /**
   * Handle split button click
   */
  const handleSplit = () => {
    const clip = findClipAtPlayhead();
    if (clip) {
      splitClip(clip.id, playheadPosition);
    }
  };

  /**
   * Handle reset trim button click
   */
  const handleResetTrim = () => {
    if (selectedClipId) {
      resetTrim(selectedClipId);
    }
  };

  /**
   * Handle duration input change
   */
  const handleDurationInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDurationInput(e.target.value);
  };

  /**
   * Handle duration input blur (apply the value)
   */
  const handleDurationInputBlur = () => {
    if (durationInput === '') {
      // Clear fixed duration (use auto mode)
      setFixedDuration(null);
      return;
    }

    const parsed = parseDuration(durationInput);
    if (parsed !== null) {
      setFixedDuration(parsed);
    } else {
      // Invalid format - revert to current value
      setDurationInput(formatDuration(fixedDuration));
    }
  };

  /**
   * Handle duration input key press (Enter to apply)
   */
  const handleDurationInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  /**
   * Update input field when fixedDuration changes externally
   */
  React.useEffect(() => {
    setDurationInput(formatDuration(fixedDuration));
  }, [fixedDuration]);

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
        {/* Left side: Track management */}
        <div className="flex items-center gap-2">
          {/* Track Count */}
          <span className="text-sm font-medium text-gray-700">
            {tracks.length} {tracks.length === 1 ? 'Track' : 'Tracks'}
          </span>

          <div className="h-4 w-px bg-gray-300" />

          {/* Timeline Duration Input */}
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-gray-500" />
            <Input
              type="text"
              value={durationInput}
              onChange={handleDurationInputChange}
              onBlur={handleDurationInputBlur}
              onKeyDown={handleDurationInputKeyDown}
              placeholder="MM:SS"
              className="h-8 w-20 text-sm"
              title="Timeline duration (MM:SS format, leave empty for auto)"
            />
          </div>

          <div className="h-4 w-px bg-gray-300" />

          {/* Add Video Track Button */}
          <Button
            onClick={handleAddVideoTrack}
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            title="Add video track (Cmd+T)"
          >
            <Video className="h-4 w-4" />
            Video
          </Button>

          {/* Add Audio Track Button */}
          <Button
            onClick={handleAddAudioTrack}
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            title="Add audio track"
          >
            <Music className="h-4 w-4" />
            Audio
          </Button>

          {/* Remove Track Button (only if more than 2 tracks) */}
          {tracks.length > 2 && (
            <>
              <div className="h-4 w-px bg-gray-300" />
              <Button
                onClick={handleRequestRemoveTrack}
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                title="Remove last track"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </>
          )}
        </div>

        {/* Right side: Clip operations */}
        <div className="flex items-center gap-2">
          {/* Split Button */}
          {showSplitButton && (
            <Button
              onClick={handleSplit}
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              title="Split clip at playhead (Cmd+B)"
            >
              <Scissors className="h-4 w-4" />
              Split
            </Button>
          )}

          {/* Reset Trim Button */}
          {showResetButton && (
            <Button
              onClick={handleResetTrim}
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              title="Reset clip trim to full duration"
            >
              <RotateCcw className="h-4 w-4" />
              Reset Trim
            </Button>
          )}
        </div>
      </div>

      {/* Remove Track Confirmation Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Track?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the last track from the timeline. Any clips on this track will be
              deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove Track
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
