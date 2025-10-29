/**
 * RecordingPanel Component
 *
 * Main panel for screen recording with permission checks, controls,
 * and status feedback. Displays as a modal/dialog with recording
 * controls and real-time status.
 */

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { RecordingControls } from './RecordingControls';
import { PermissionPrompt } from './PermissionPrompt';
import { AudioSourceSelector } from './AudioSourceSelector';
import { CameraSelector } from './CameraSelector';
import { RecordingConfigSection } from './RecordingConfigSection';
import WebcamPreview from './WebcamPreview';
import { WindowSelector } from './WindowSelector';
import { RecordingModeToggle } from './RecordingModeToggle';
import { useRecordingStore } from '@/stores/recordingStore';
import { useMediaLibraryStore } from '@/stores/mediaLibraryStore';
import {
  checkScreenRecordingPermission,
  checkCameraPermission,
  startScreenRecording,
  startWebcamRecording,
  startPipRecording,
  stopRecording,
  stopWebcamRecording,
  stopPipRecording,
  pauseRecording,
  resumeRecording,
  cancelRecording,
  checkDiskSpace,
  sendRecordingNotification,
} from '@/lib/tauri/recording';
import { importMedia } from '@/lib/tauri/media';
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
  const [screenMode, setScreenMode] = useState<'fullscreen' | 'window'>('fullscreen'); // Story 4.1
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Recording store
  const status = useRecordingStore((state) => state.status);
  const recordingId = useRecordingStore((state) => state.recordingId);
  const elapsedMs = useRecordingStore((state) => state.elapsedMs);
  const selectedCamera = useRecordingStore((state) => state.selectedCamera);
  const recordingMode = useRecordingStore((state) => state.recordingMode); // Story 4.4
  const selectedWindowId = useRecordingStore((state) => state.selectedWindowId); // Story 4.1
  const frameRate = useRecordingStore((state) => state.frameRate); // Story 4.2
  const resolution = useRecordingStore((state) => state.resolution); // Story 4.2
  const audioSources = useRecordingStore((state) => state.audioSources); // Story 4.2
  const pipPosition = useRecordingStore((state) => state.pipPosition); // Story 4.5/4.6
  const pipSize = useRecordingStore((state) => state.pipSize); // Story 4.5/4.6
  const startRecordingStore = useRecordingStore((state) => state.startRecording);
  const stopRecordingStore = useRecordingStore((state) => state.stopRecording);
  const pauseRecordingStore = useRecordingStore((state) => state.pauseRecording);
  const resumeRecordingStore = useRecordingStore((state) => state.resumeRecording);
  const cancelRecordingStore = useRecordingStore((state) => state.cancelRecording);
  const updateElapsedTime = useRecordingStore((state) => state.updateElapsedTime);
  const setError = useRecordingStore((state) => state.setError);
  const setStopping = useRecordingStore((state) => state.setStopping);

  // Media library store
  const addMediaFile = useMediaLibraryStore((state) => state.addMediaFile);

  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const isStopping = status === 'stopping';

  // Check permissions when panel opens or recording mode changes
  useEffect(() => {
    if (open) {
      if (recordingMode === 'screen') {
        checkPermission();
      } else if (recordingMode === 'webcam' || recordingMode === 'pip') {
        // Webcam and PiP modes both need camera permission
        checkCameraPermissionStatus();
        // PiP mode also needs screen recording permission
        if (recordingMode === 'pip') {
          checkPermission();
        }
      }
    }
  }, [open, recordingMode]);

  // Update elapsed time during recording (but not when paused)
  useEffect(() => {
    if (!isRecording || isPaused) return;

    const interval = setInterval(() => {
      const state = useRecordingStore.getState();
      const elapsed = Date.now() - (state.startTime || 0) - state.pausedMs;
      updateElapsedTime(elapsed);
    }, 100); // Update every 100ms for smooth display

    return () => clearInterval(interval);
  }, [isRecording, isPaused, updateElapsedTime]);

  // Periodic disk space monitoring during recording
  useEffect(() => {
    if (!isRecording || isPaused) return;

    const checkInterval = setInterval(async () => {
      try {
        // Check disk space in recordings directory (~/Documents/clippy/recordings)
        const homeDir = await invoke<string>('cmd_get_home_dir');
        const recordingsPath = `${homeDir}/Documents/clippy/recordings`;
        const availableBytes = await checkDiskSpace(recordingsPath);
        const availableMB = availableBytes / (1024 * 1024);

        // If less than 100MB available, warn user
        if (availableMB < 100) {
          toast.warning('Low Disk Space', {
            description: `Only ${availableMB.toFixed(0)}MB available. Recording may stop soon.`,
            duration: 5000,
          });
        }

        // If less than 50MB, stop recording gracefully
        if (availableMB < 50 && recordingId) {
          toast.error('Disk Space Exhausted', {
            description: 'Recording stopped due to low disk space.',
            duration: 10000,
          });
          await handleStopRecording();
        }
      } catch (err) {
        console.error('Failed to check disk space:', err);
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(checkInterval);
  }, [isRecording, isPaused, recordingId]);

  // Listen for window-closed event from backend (Story 4.1 - AC #7, Subtask 6.4-6.5)
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      // Only listen during window recording
      if (isRecording && screenMode === 'window' && recordingMode === 'screen') {
        unlisten = await listen('window-closed', async () => {
          toast.error('Window Closed', {
            description: 'The selected window closed during recording. Attempting to save partial recording...',
            duration: 8000,
          });

          // Attempt to stop recording gracefully to save partial recording (Subtask 6.5)
          if (recordingId) {
            try {
              await handleStopRecording();
            } catch (err) {
              console.error('Failed to save partial recording:', err);
              toast.error('Failed to Save Recording', {
                description: 'Could not save partial recording after window closure',
              });
            }
          }
        });
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [isRecording, screenMode, recordingMode, recordingId]);

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
      // Pre-recording disk space check (AC #8, #9)
      try {
        const homeDir = await invoke<string>('cmd_get_home_dir');
        const recordingsPath = `${homeDir}/Documents/clippy/recordings`;
        const availableBytes = await checkDiskSpace(recordingsPath);
        const availableMB = availableBytes / (1024 * 1024);

        // Estimate file size: 5MB/min (as per AC #9)
        // Warn if less than 10 minutes of recording space available
        const estimatedMinutes = availableMB / 5;

        if (estimatedMinutes < 10) {
          toast.warning('Low Disk Space', {
            description: `Only ~${Math.floor(estimatedMinutes)} minutes of recording space available (${availableMB.toFixed(0)}MB free)`,
            duration: 8000,
          });

          // Don't block recording, just warn
        }
      } catch (err) {
        console.error('Failed to check disk space before recording:', err);
        // Don't block recording on disk check failure
      }

      let id: string;

      if (recordingMode === 'screen') {
        // Story 4.1: Validate window selection if in window mode (AC #1, #2)
        if (screenMode === 'window' && !selectedWindowId) {
          toast.error('No Window Selected', {
            description: 'Please select a window to record',
          });
          return;
        }

        // Check screen recording permission first
        const granted = await checkScreenRecordingPermission();
        if (!granted) {
          setShowPermissionPrompt(true);
          return;
        }

        // Build recording config (Story 4.2)
        const config = {
          mode: 'screen' as const,
          frameRate,
          resolution,
          systemAudio: audioSources.systemAudio,
          microphone: audioSources.microphone,
          screenRecordingMode: screenMode === 'window' ? ('window' as const) : ('fullscreen' as const),
          selectedWindowId: selectedWindowId ?? undefined,
        };

        // Start screen recording
        id = await startScreenRecording(config);

        // Send native macOS notification (AC #4)
        try {
          await sendRecordingNotification(
            'Recording Started',
            'Screen recording is now active'
          );
        } catch (err) {
          console.error('Failed to send notification:', err);
          // Don't block recording on notification failure
        }

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

        // Send native macOS notification (AC #4)
        try {
          await sendRecordingNotification(
            'Webcam Recording Started',
            enableMicrophone
              ? 'Webcam recording with microphone is now active'
              : 'Webcam recording is now active'
          );
        } catch (err) {
          console.error('Failed to send notification:', err);
          // Don't block recording on notification failure
        }

        toast.success('Webcam Recording Started', {
          description: enableMicrophone
            ? 'Webcam recording with microphone is now active'
            : 'Webcam recording is now active',
        });
      } else if (recordingMode === 'pip') {
        // Story 4.6: PiP recording (screen + webcam simultaneously)
        // Check both screen and camera permissions
        const screenGranted = await checkScreenRecordingPermission();
        if (!screenGranted) {
          setShowPermissionPrompt(true);
          return;
        }

        const cameraGranted = await checkCameraPermission();
        if (!cameraGranted) {
          toast.error('Camera Permission Required', {
            description: 'Please grant camera permission to record with PiP mode',
          });
          return;
        }

        // Ensure a camera is selected
        if (!selectedCamera) {
          toast.error('No Camera Selected', {
            description: 'Please select a camera before starting PiP recording',
          });
          return;
        }

        // Get PiP configuration from store
        // Use defaults if not configured (bottom-right corner, 320x180)
        const pipX = pipPosition?.x ?? 1600; // Default: right side (1920 - 320)
        const pipY = pipPosition?.y ?? 900; // Default: bottom (1080 - 180)
        const pipWidth = pipSize?.width ?? 320;
        const pipHeight = pipSize?.height ?? 180;

        // Generate output path
        const homeDir = await invoke<string>('cmd_get_home_dir');
        const outputPath = `${homeDir}/Documents/clippy/recordings/pip-${Date.now()}.mp4`;

        // Start PiP recording
        id = await startPipRecording(
          selectedCamera.id,
          pipX,
          pipY,
          pipWidth,
          pipHeight,
          outputPath
        );

        // Send native macOS notification
        try {
          await sendRecordingNotification(
            'PiP Recording Started',
            'Screen and webcam recording is now active'
          );
        } catch (err) {
          console.error('Failed to send notification:', err);
          // Don't block recording on notification failure
        }

        toast.success('PiP Recording Started', {
          description: 'Screen and webcam recording with picture-in-picture is now active',
        });
      } else {
        throw new Error('Invalid recording mode');
      }

      startRecordingStore(id);
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
      } else if (recordingMode === 'pip') {
        // Story 4.6: Stop PiP recording
        filePath = await stopPipRecording(recordingId);
      } else {
        // Screen recording mode
        filePath = await stopRecording(recordingId);
      }

      stopRecordingStore(filePath);

      // Import the recording to the media library
      try {
        const mediaFile = await importMedia(filePath);
        addMediaFile(mediaFile);

        toast.success('Recording Saved', {
          description: `Recording saved and imported to library`,
          duration: 5000,
        });
      } catch (importErr) {
        // Recording was saved but import failed - still show success but warn
        console.error('Failed to import recording to library:', importErr);
        toast.success('Recording Saved', {
          description: `Recording saved to ${filePath}, but failed to import to library`,
          duration: 5000,
        });
      }

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

  const handlePauseRecording = async () => {
    if (!recordingId) return;

    try {
      await pauseRecording(recordingId);
      pauseRecordingStore();

      toast.info('Recording Paused', {
        description: 'Click Resume to continue recording',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      toast.error('Failed to Pause Recording', {
        description: errorMessage,
      });
    }
  };

  const handleResumeRecording = async () => {
    if (!recordingId) return;

    try {
      await resumeRecording(recordingId);
      resumeRecordingStore();

      toast.success('Recording Resumed', {
        description: 'Recording is now active again',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      toast.error('Failed to Resume Recording', {
        description: errorMessage,
      });
    }
  };

  const handleCancelRecording = async () => {
    if (!recordingId) return;

    try {
      await cancelRecording(recordingId);
      cancelRecordingStore();

      toast.info('Recording Cancelled', {
        description: 'Partial recording has been discarded',
      });

      // Close panel after cancel
      onOpenChange(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      toast.error('Failed to Cancel Recording', {
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
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

          {/* Recording Mode Toggle - Story 4.4 */}
          {!isRecording && <RecordingModeToggle />}

          <div className="space-y-6 py-4 overflow-y-auto flex-1">
            {/* Screen Recording Mode (Story 4.1) */}
            {recordingMode === 'screen' && (
              <>
              {/* Screen Recording Mode Toggle (Story 4.1 - AC #1) */}
              {!isRecording && hasPermission && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Recording Mode</label>
                    <Tabs value={screenMode} onValueChange={(v: string) => setScreenMode(v as 'fullscreen' | 'window')}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="fullscreen">Full Screen</TabsTrigger>
                        <TabsTrigger value="window">Window</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {/* Window Selector - Story 4.1 - AC #2 */}
                  {screenMode === 'window' && (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">Select Window</label>
                      <WindowSelector />
                    </div>
                  )}
                </div>
              )}

              {/* Audio Source Selection */}
              {!isRecording && hasPermission && (
                <AudioSourceSelector />
              )}

              {/* Recording Configuration (Story 4.2 - AC #1-6) */}
              {!isRecording && hasPermission && (
                <RecordingConfigSection />
              )}

              {/* Recording Controls */}
              <div className="flex flex-col items-center gap-4">
                <RecordingControls
                  isRecording={isRecording}
                  isPaused={isPaused}
                  isStopping={isStopping}
                  onStartRecording={handleStartRecording}
                  onStopRecording={handleStopRecording}
                  onPauseRecording={handlePauseRecording}
                  onResumeRecording={handleResumeRecording}
                  onCancelRecording={handleCancelRecording}
                />

                {/* Duration Display */}
                {(isRecording || isPaused) && (
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
              </>
            )}

            {/* Webcam Recording Mode */}
            {recordingMode === 'webcam' && (
              <>
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
                  isPaused={isPaused}
                  isStopping={isStopping}
                  onStartRecording={handleStartRecording}
                  onStopRecording={handleStopRecording}
                  onPauseRecording={handlePauseRecording}
                  onResumeRecording={handleResumeRecording}
                  onCancelRecording={handleCancelRecording}
                />

                {/* Duration Display */}
                {(isRecording || isPaused) && (
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
              </>
            )}

            {/* PiP Recording Mode (Story 4.4) */}
            {recordingMode === 'pip' && (
              <>
              {/* Camera Preview - Always visible in pip mode (AC #1, #5) */}
              {!isRecording && hasCameraPermission && selectedCamera && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Webcam Preview</label>
                  <WebcamPreview
                    cameraIndex={selectedCamera.id}
                    active={true}
                    onError={(error) => {
                      toast.error('Camera Preview Error', {
                        description: error,
                      });
                    }}
                  />
                </div>
              )}

              {/* Camera Selection */}
              {!isRecording && hasCameraPermission && (
                <CameraSelector
                  onCameraSelected={(cameraId) => {
                    console.log('Camera selected for PiP:', cameraId);
                  }}
                />
              )}

              {/* Screen Recording Configuration */}
              {!isRecording && hasPermission && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Screen Recording Mode</label>
                    <Tabs value={screenMode} onValueChange={(v: string) => setScreenMode(v as 'fullscreen' | 'window')}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="fullscreen">Full Screen</TabsTrigger>
                        <TabsTrigger value="window">Window</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {/* Window Selector */}
                  {screenMode === 'window' && (
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">Select Window</label>
                      <WindowSelector />
                    </div>
                  )}
                </div>
              )}

              {/* Audio Source Selection */}
              {!isRecording && hasPermission && hasCameraPermission && (
                <AudioSourceSelector />
              )}

              {/* Recording Configuration */}
              {!isRecording && hasPermission && hasCameraPermission && (
                <RecordingConfigSection />
              )}

              {/* Recording Controls */}
              <div className="flex flex-col items-center gap-4">
                <RecordingControls
                  isRecording={isRecording}
                  isPaused={isPaused}
                  isStopping={isStopping}
                  onStartRecording={handleStartRecording}
                  onStopRecording={handleStopRecording}
                  onPauseRecording={handlePauseRecording}
                  onResumeRecording={handleResumeRecording}
                  onCancelRecording={handleCancelRecording}
                />

                {/* Duration Display */}
                {(isRecording || isPaused) && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-mono">
                      {formatDuration(elapsedMs)}
                    </span>
                  </div>
                )}
              </div>

              {/* Information */}
              {!isRecording && hasPermission && hasCameraPermission && selectedCamera && (
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-md text-sm">
                  <p className="font-semibold mb-2">Ready for PiP Recording</p>
                  <ul className="list-disc list-inside space-y-1 ml-2 text-gray-700 dark:text-gray-300">
                    <li>Click "Record Screen" to start recording screen and webcam simultaneously</li>
                    <li>Webcam will appear as overlay on screen recording</li>
                    <li>Recording at 30 FPS with real-time composition</li>
                    <li>Configure PiP position and size in Story 4.5 settings</li>
                    <li>Click "Stop Recording" when finished</li>
                  </ul>
                </div>
              )}
              </>
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
