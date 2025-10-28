import { useRef, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerStore } from "@/stores/playerStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { toast } from "sonner";

/**
 * VideoPlayer props
 */
interface VideoPlayerProps {
  /** Video file path to play (original file system path, not converted) */
  src: string;

  /** Callback on time updates */
  onTimeUpdate?: (currentTime: number) => void;

  /** Callback when video ends */
  onEnded?: () => void;
}

/**
 * MPV command response structure
 */
interface MpvResponse {
  success: boolean;
  message: string;
  data?: {
    time?: number;
    duration?: number;
    is_playing?: boolean;
    width?: number;
    height?: number;
    frame?: string;
  };
}

/**
 * VideoPlayer Component
 *
 * MPV-based video player via Tauri backend for universal codec support.
 * Supports HEVC/H.265, ProRes, DNxHD, VP9, AV1, and more.
 * Syncs with playerStore for timeline integration.
 */
export function VideoPlayer({
  src,
  onTimeUpdate,
  onEnded: _onEnded,
}: VideoPlayerProps) {
  const [mpvInitialized, setMpvInitialized] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const frameUpdateIntervalRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSrcRef = useRef<string>("");

  const {
    setDuration,
    setCurrentTime,
    isPlaying,
    playheadPosition,
    setPlayheadPosition,
    mode,
    seekTarget,
    clearSeekTarget,
  } = usePlayerStore();

  // Get selected clip from timeline for trim boundary enforcement
  const { selectedClipId, getClip } = useTimelineStore();
  const selectedClip = selectedClipId ? getClip(selectedClipId) : undefined;

  // Initialize MPV player on mount
  useEffect(() => {
    const initMpv = async () => {
      try {
        console.log('[VideoPlayer] Initializing MPV...');
        const response = await invoke<MpvResponse>('mpv_init');

        if (response.success) {
          setMpvInitialized(true);
          console.log('[VideoPlayer] MPV initialized successfully');
        } else {
          throw new Error(response.message);
        }
      } catch (error) {
        console.error('[VideoPlayer] Failed to initialize MPV:', error);
        toast.error('Failed to initialize video player', {
          description: String(error),
          duration: 5000,
        });
      }
    };

    initMpv();

    // Cleanup on unmount
    return () => {
      invoke<MpvResponse>('mpv_stop').catch(console.error);
    };
  }, []);

  // Load video file when src changes and MPV is initialized
  useEffect(() => {
    if (!mpvInitialized || !src || src === lastSrcRef.current) return;

    const loadVideo = async () => {
      try {
        console.log('[VideoPlayer] Loading video:', src);
        setVideoLoaded(false);
        setVideoDimensions(null);

        // MPV uses raw filesystem paths directly
        // Backend waits for FileLoaded event before returning
        const loadResponse = await invoke<MpvResponse>('mpv_load_file', {
          filePath: src,
        });

        if (!loadResponse.success) {
          throw new Error(loadResponse.message);
        }

        // File is now loaded, get duration (should be available immediately)
        const durationResponse = await invoke<MpvResponse>('mpv_get_duration');
        if (!durationResponse.success || !durationResponse.data?.duration) {
          throw new Error('Failed to get video duration');
        }

        // Get video dimensions
        const dimensionsResponse = await invoke<MpvResponse>('mpv_get_video_dimensions');
        if (dimensionsResponse.success && dimensionsResponse.data?.width && dimensionsResponse.data?.height) {
          setVideoDimensions({
            width: dimensionsResponse.data.width as number,
            height: dimensionsResponse.data.height as number,
          });
        }

        const duration = durationResponse.data.duration;
        console.log('[VideoPlayer] Video loaded, duration:', duration);
        setDuration(duration);
        setVideoLoaded(true);
        lastSrcRef.current = src;

        toast.success('Video loaded successfully', {
          description: `Duration: ${Math.round(duration)}s | Universal codec support (HEVC, ProRes, etc.)`,
        });
      } catch (error) {
        console.error('[VideoPlayer] Failed to load video:', error);
        toast.error('Failed to load video', {
          description: String(error),
          duration: 5000,
        });
      }
    };

    loadVideo();
  }, [mpvInitialized, src, setDuration]);

  // Handle seek operations from PlayerControls (slider, keyboard shortcuts)
  useEffect(() => {
    if (!videoLoaded || seekTarget === null) return;

    const performSeek = async () => {
      try {
        console.log('[VideoPlayer] Seeking to:', seekTarget);
        const response = await invoke<MpvResponse>('mpv_seek', {
          timeSeconds: seekTarget,
        });

        if (response.success) {
          // Update current time after successful seek
          setCurrentTime(seekTarget);

          // In timeline mode, also update playhead position
          if (mode === 'timeline') {
            setPlayheadPosition(seekTarget * 1000);
          }
        } else {
          console.error('[VideoPlayer] Seek failed:', response.message);
          toast.error('Seek failed', {
            description: response.message,
          });
        }
      } catch (error) {
        console.error('[VideoPlayer] Seek error:', error);
        toast.error('Seek failed', {
          description: String(error),
        });
      } finally {
        // Clear seek target to allow subsequent seeks to the same position
        clearSeekTarget();
      }
    };

    performSeek();
  }, [seekTarget, videoLoaded, setCurrentTime, setPlayheadPosition, mode, clearSeekTarget]);

  // Poll for time updates when video is loaded (needed for MPV since there's no DOM event)
  useEffect(() => {
    if (!videoLoaded) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await invoke<MpvResponse>('mpv_get_time');
        if (response.success && response.data?.time !== undefined) {
          const currentTime = response.data.time;
          setCurrentTime(currentTime);
          onTimeUpdate?.(currentTime);
        }
      } catch (error) {
        console.error('[VideoPlayer] Failed to get current time:', error);
      }
    }, 100); // Poll every 100ms for smooth updates

    return () => clearInterval(pollInterval);
  }, [videoLoaded, setCurrentTime, onTimeUpdate]);

  // Sync playhead position to MPV player (when timeline is scrubbed)
  useEffect(() => {
    // Only sync with timeline if in timeline mode
    if (mode !== 'timeline') return;

    if (!videoLoaded) return;

    let targetTimeMs = playheadPosition;

    // Constrain scrubbing to trim boundaries if a clip is selected
    if (selectedClip) {
      const clipStartTime = selectedClip.startTime;
      const clipTrimIn = clipStartTime + selectedClip.trimIn;
      const clipTrimOut = clipStartTime + selectedClip.trimOut;

      // Clamp playhead to [trimIn, trimOut] range
      targetTimeMs = Math.max(clipTrimIn, Math.min(clipTrimOut, targetTimeMs));
    }

    // Convert playhead position (ms) to seconds
    const targetTimeSeconds = targetTimeMs / 1000;

    // Seek MPV player
    const seekToPosition = async () => {
      try {
        // Get current time from MPV
        const timeResponse = await invoke<MpvResponse>('mpv_get_time');
        if (timeResponse.success && timeResponse.data?.time !== undefined) {
          const currentVideoTime = timeResponse.data.time;

          // Only seek if the difference is significant (> 100ms to avoid unnecessary seeks during playback)
          if (Math.abs(currentVideoTime - targetTimeSeconds) > 0.1) {
            await invoke<MpvResponse>('mpv_seek', {
              timeSeconds: targetTimeSeconds,
            });
          }
        }
      } catch (error) {
        console.error('[VideoPlayer] Failed to seek:', error);
      }
    };

    seekToPosition();
  }, [playheadPosition, selectedClip, videoLoaded]);

  // Sync play/pause state with MPV and manage playhead updates during playback
  useEffect(() => {
    if (!videoLoaded) return;

    const controlPlayback = async () => {
      try {
        if (isPlaying) {
          // Start playback
          const response = await invoke<MpvResponse>('mpv_play');
          if (!response.success) {
            console.error('[VideoPlayer] Failed to start playback:', response.message);
            return;
          }

          // Start requestAnimationFrame loop to sync playhead with MPV during playback
          const updatePlayhead = async () => {
            try {
              const timeResponse = await invoke<MpvResponse>('mpv_get_time');
              if (timeResponse.success && timeResponse.data?.time !== undefined) {
                const currentVideoTime = timeResponse.data.time;
                const currentTimeMs = currentVideoTime * 1000;

                // Only update playhead in timeline mode
                const currentMode = usePlayerStore.getState().mode;
                if (currentMode === 'timeline') {
                  // Check if we have a selected clip with trim boundaries
                  if (selectedClip) {
                    const clipStartTime = selectedClip.startTime;
                    const clipTrimIn = clipStartTime + selectedClip.trimIn;
                    const clipTrimOut = clipStartTime + selectedClip.trimOut;

                    // If playback exceeds trimOut boundary, stop playback
                    if (currentTimeMs >= clipTrimOut) {
                      usePlayerStore.getState().pause();
                      setPlayheadPosition(clipTrimOut);
                      await invoke<MpvResponse>('mpv_pause');
                      return;
                    }

                    // Clamp playhead to trim boundaries
                    const clampedPosition = Math.max(clipTrimIn, Math.min(clipTrimOut, currentTimeMs));
                    setPlayheadPosition(clampedPosition);
                  } else {
                    // No trim boundaries, update normally
                    setPlayheadPosition(currentTimeMs);
                  }
                }
                // In preview mode, playhead stays at 0 and doesn't move
              }
            } catch (error) {
              console.error('[VideoPlayer] Error in playhead update:', error);
            }

            // Continue loop while playing
            if (usePlayerStore.getState().isPlaying) {
              animationFrameRef.current = requestAnimationFrame(updatePlayhead);
            }
          };

          animationFrameRef.current = requestAnimationFrame(updatePlayhead);
        } else {
          // Pause playback
          await invoke<MpvResponse>('mpv_pause');

          // Cancel animation frame loop
          if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
        }
      } catch (error) {
        console.error('[VideoPlayer] Playback control error:', error);
      }
    };

    controlPlayback();

    // Cleanup on unmount or when isPlaying changes
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, setPlayheadPosition, selectedClip, videoLoaded]);

  // Frame capture and rendering loop
  useEffect(() => {
    if (!videoLoaded || !canvasRef.current || !videoDimensions) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions to match video
    canvas.width = videoDimensions.width;
    canvas.height = videoDimensions.height;

    // Capture and draw frames at ~15 FPS
    const captureFrame = async () => {
      try {
        const response = await invoke<MpvResponse>('mpv_capture_frame');
        if (response.success && response.data?.frame) {
          // Convert base64 to image and draw to canvas
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = `data:image/jpeg;base64,${response.data.frame}`;
        }
      } catch (error) {
        console.error('[VideoPlayer] Failed to capture frame:', error);
      }
    };

    // Start frame capture interval (15 FPS = ~67ms per frame)
    const intervalId = window.setInterval(captureFrame, 67);
    frameUpdateIntervalRef.current = intervalId;

    // Initial frame capture
    captureFrame();

    return () => {
      if (frameUpdateIntervalRef.current !== null) {
        clearInterval(frameUpdateIntervalRef.current);
        frameUpdateIntervalRef.current = null;
      }
    };
  }, [videoLoaded, videoDimensions]);

  return (
    <div className="w-full h-full flex items-center justify-center bg-black">
      {!mpvInitialized && (
        <div className="text-white text-center">
          <div className="text-xl mb-2">🎬 Initializing MPV Player...</div>
          <div className="text-sm text-gray-400">Universal codec support loading</div>
        </div>
      )}

      {mpvInitialized && !videoLoaded && (
        <div className="text-white text-center">
          <div className="text-xl mb-2">📂 Loading Video...</div>
          <div className="text-sm text-gray-400">Processing with libmpv</div>
        </div>
      )}

      {mpvInitialized && videoLoaded && videoDimensions && (
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full object-contain"
          style={{
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        />
      )}

      {mpvInitialized && videoLoaded && !videoDimensions && (
        <div className="text-white text-center">
          <div className="text-xl mb-2">⚙️ Preparing Video...</div>
          <div className="text-sm text-gray-400">Getting video dimensions</div>
        </div>
      )}
    </div>
  );
}
