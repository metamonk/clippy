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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { RecordingControls } from './RecordingControls';
import { PermissionPrompt } from './PermissionPrompt';
import { AudioSourceSelector } from './AudioSourceSelector';
import { CameraSelector } from './CameraSelector';
import WebcamPreview from './WebcamPreview';
import { useRecordingStore } from '@/stores/recordingStore';
import {
  checkScreenRecordingPermission,
  checkCameraPermission,
  startScreenRecording,
  startWebcamRecording,
  stopRecording,
  stopWebcamRecording,
} from '@/lib/tauri/recording';
import { Monitor, Clock, Camera } from 'lucide-react';

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
  const [recordingMode, setRecordingMode] = useState<'screen' | 'webcam'>('screen');
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Recording store
  const status = useRecordingStore((state) => state.status);
  const recordingId = useRecordingStore((state) => state.recordingId);
  const elapsedMs = useRecordingStore((state) => state.elapsedMs);
  const selectedCamera = useRecordingStore((state) => state.selectedCamera);
  const startRecording = useRecordingStore((state) => state.startRecording);
  const stopRecordingStore = useRecordingStore((state) => state.stopRecording);
  const updateElapsedTime = useRecordingStore((state) => state.updateElapsedTime);
  const setError = useRecordingStore((state) => state.setError);
  const setStopping = useRecordingStore((state) => state.setStopping);

  const isRecording = status === 'recording';
  const isStopping = status === 'stopping';

  // Check permissions when panel opens or recording mode changes
  useEffect(() => {
    if (open) {
      if (recordingMode === 'screen') {
        checkPermission();
      } else if (recordingMode === 'webcam') {
        checkCameraPermissionStatus();
      }
    }
  }, [open, recordingMode]);

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

  const checkCameraPermissionStatus = async () => {
    try {
      const granted = await checkCameraPermission();
      setHasCameraPermission(granted);

      if (!granted) {
        toast.warning('Camera Permission Required', {
          description: 'Please grant camera permission in System Preferences',
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      toast.error('Camera Permission Check Failed', {
        description: errorMessage,
      });
      setHasCameraPermission(false);
    }
  };

  const handleStartRecording = async () => {
    try {
      let id: string;

      if (recordingMode === 'screen') {
        // Check screen recording permission first
        const granted = await checkScreenRecordingPermission();
        if (!granted) {
          setShowPermissionPrompt(true);
          return;
        }

        // Start screen recording
        id = await startScreenRecording();
        toast.success('Recording Started', {
          description: 'Screen recording is now active',
        });
      } else if (recordingMode === 'webcam') {
        // Check camera permission first
        const granted = await checkCameraPermission();
        if (!granted) {
          toast.error('Camera Permission Required', {
            description: 'Please grant camera permission to record from webcam',
          });
          return;
        }

        // Ensure a camera is selected
        if (!selectedCamera) {
          toast.error('No Camera Selected', {
            description: 'Please select a camera before recording',
          });
          return;
        }

        // Start webcam recording
        // Get microphone setting from store
        const enableMicrophone = useRecordingStore.getState().audioSources.microphone;
        id = await startWebcamRecording(selectedCamera.id, enableMicrophone);
        toast.success('Webcam Recording Started', {
          description: enableMicrophone
            ? 'Webcam recording with microphone is now active'
            : 'Webcam recording is now active',
        });
      } else {
        throw new Error('Invalid recording mode');
      }

      startRecording(id);
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

      let filePath: string;
      if (recordingMode === 'webcam') {
        filePath = await stopWebcamRecording(recordingId);
      } else {
        filePath = await stopRecording(recordingId);
      }

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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {recordingMode === 'screen' ? (
                <Monitor className="w-6 h-6 text-blue-600" />
              ) : (
                <Camera className="w-6 h-6 text-purple-600" />
              )}
              <DialogTitle className="text-xl">Recording</DialogTitle>
            </div>
            <DialogDescription>
              Record your screen or webcam for demonstrations and tutorials
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={recordingMode}
            onValueChange={(value: string) => setRecordingMode(value as 'screen' | 'webcam')}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="screen" disabled={isRecording}>
                <Monitor className="w-4 h-4 mr-2" />
                Screen
              </TabsTrigger>
              <TabsTrigger value="webcam" disabled={isRecording}>
                <Camera className="w-4 h-4 mr-2" />
                Webcam
              </TabsTrigger>
            </TabsList>

            <TabsContent value="screen" className="space-y-6 py-4">
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
            </TabsContent>

            <TabsContent value="webcam" className="space-y-6 py-4">
              {/* Camera Selection */}
              {!isRecording && hasCameraPermission && (
                <CameraSelector
                  onCameraSelected={(cameraId) => {
                    console.log('Camera selected:', cameraId);
                  }}
                />
              )}

              {/* Webcam Preview */}
              {!isRecording && selectedCamera && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Preview</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreview(!showPreview)}
                    >
                      {showPreview ? 'Hide Preview' : 'Show Preview'}
                    </Button>
                  </div>
                  {showPreview && (
                    <WebcamPreview
                      cameraIndex={selectedCamera.id}
                      active={showPreview}
                      onError={(error) => {
                        toast.error('Camera Preview Error', {
                          description: error,
                        });
                      }}
                    />
                  )}
                </div>
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
              {!isRecording && hasCameraPermission && selectedCamera && (
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-md text-sm">
                  <p className="font-semibold mb-2">Ready to Record</p>
                  <ul className="list-disc list-inside space-y-1 ml-2 text-gray-700 dark:text-gray-300">
                    <li>Click "Record Webcam" to start</li>
                    <li>Camera will be captured at native resolution (capped at 1080p)</li>
                    <li>Recording at 30 FPS</li>
                    <li>Click "Stop Recording" when finished</li>
                    <li>Recording will be saved automatically</li>
                  </ul>
                </div>
              )}
            </TabsContent>
          </Tabs>
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
