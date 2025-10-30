import { Trash2, Video, Music } from 'lucide-react';
import { useTimelineStore } from '@/stores/timelineStore';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
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

  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [trackToRemove, setTrackToRemove] = useState<string | null>(null);

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

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
        {/* Track Count */}
        <span className="text-sm font-medium text-gray-700">
          {tracks.length} {tracks.length === 1 ? 'Track' : 'Tracks'}
        </span>

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
