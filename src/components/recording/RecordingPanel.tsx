/**
 * RecordingPanel Component
 *
 * Main panel for screen recording with permission checks, controls,
 * and status feedback. Displays as a modal/dialog with recording
 * controls and real-time status.
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RecordingControls } from './RecordingControls';
import { PermissionPrompt } from './PermissionPrompt';
import { AudioSourceSelector } from './AudioSourceSelector';
import { useRecordingStore } from '@/stores/recordingStore';
import {
  checkScreenRecordingPermission,
  startScreenRecording,
  stopRecording,
} from '@/lib/tauri/recording';
import { Monitor, Clock } from 'lucide-react';

export interface RecordingPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Format milliseconds to MM:SS
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function RecordingPanel({ open, onOpenChange }: RecordingPanelProps) {
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // Recording store
  const status = useRecordingStore((state) => state.status);
  const recordingId = useRecordingStore((state) => state.recordingId);
  const elapsedMs = useRecordingStore((state) => state.elapsedMs);
  const startRecording = useRecordingStore((state) => state.startRecording);
  const stopRecordingStore = useRecordingStore((state) => state.stopRecording);
  const updateElapsedTime = useRecordingStore((state) => state.updateElapsedTime);
  const setError = useRecordingStore((state) => state.setError);
  const setStopping = useRecordingStore((state) => state.setStopping);

  const isRecording = status === 'recording';
  const isStopping = status === 'stopping';

  // Check permission when panel opens
  useEffect(() => {
    if (open) {
      checkPermission();
    }
  }, [open]);

  // Update elapsed time during recording
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - (useRecordingStore.getState().startTime || 0);
      updateElapsedTime(elapsed);
    }, 100); // Update every 100ms for smooth display

    return () => clearInterval(interval);
  }, [isRecording, updateElapsedTime]);

  const checkPermission = async () => {
    try {
      const granted = await checkScreenRecordingPermission();
      setHasPermission(granted);

      if (!granted) {
        setShowPermissionPrompt(true);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      toast.error('Permission Check Failed', {
        description: errorMessage,
      });
      setHasPermission(false);
      setShowPermissionPrompt(true);
    }
  };

  const handleStartRecording = async () => {
    try {
      // Check permission first
      const granted = await checkScreenRecordingPermission();
      if (!granted) {
        setShowPermissionPrompt(true);
        return;
      }

      // Start recording
      const id = await startScreenRecording();
      startRecording(id);

      toast.success('Recording Started', {
        description: 'Screen recording is now active',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      toast.error('Failed to Start Recording', {
        description: errorMessage,
      });
    }
  };

  const handleStopRecording = async () => {
    if (!recordingId) return;

    try {
      setStopping();

      const filePath = await stopRecording(recordingId);
      stopRecordingStore(filePath);

      toast.success('Recording Saved', {
        description: `Recording saved to ${filePath}`,
        duration: 5000,
      });

      // Close panel after successful stop
      onOpenChange(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      toast.error('Failed to Stop Recording', {
        description: errorMessage,
      });
    }
  };

  const handlePermissionGranted = () => {
    setHasPermission(true);
    setShowPermissionPrompt(false);
  };

  const handlePermissionDenied = () => {
    setHasPermission(false);
    // Keep permission prompt open so user can try again
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Monitor className="w-6 h-6 text-blue-600" />
              <DialogTitle className="text-xl">Screen Recording</DialogTitle>
            </div>
            <DialogDescription>
              Record your screen for demonstrations and tutorials
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Audio Source Selection */}
            {!isRecording && hasPermission && (
              <AudioSourceSelector />
            )}

            {/* Recording Controls */}
            <div className="flex flex-col items-center gap-4">
              <RecordingControls
                isRecording={isRecording}
                isStopping={isStopping}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
              />

              {/* Duration Display */}
              {isRecording && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-mono">
                    {formatDuration(elapsedMs)}
                  </span>
                </div>
              )}
            </div>

            {/* Information */}
            {!isRecording && hasPermission && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md text-sm">
                <p className="font-semibold mb-2">Ready to Record</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-700 dark:text-gray-300">
                  <li>Click "Record Screen" to start</li>
                  <li>Full screen will be captured at 30 FPS</li>
                  <li>Audio sources configured above will be captured</li>
                  <li>Click "Stop Recording" when finished</li>
                  <li>Recording will be saved automatically</li>
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Permission Prompt Dialog */}
      <PermissionPrompt
        open={showPermissionPrompt}
        onOpenChange={setShowPermissionPrompt}
        onPermissionGranted={handlePermissionGranted}
        onPermissionDenied={handlePermissionDenied}
      />
    </>
  );
}
