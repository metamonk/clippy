import { useRef, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { usePlayerStore } from "@/stores/playerStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useDevSettingsStore } from "@/stores/devSettingsStore";
import { toast } from "sonner";
import { getPlaybackFps, recordPlaybackFrame, resetFpsCounter, type PerformanceMetrics } from "@/lib/tauri/performance";

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
 * Timeline render progress event
 */
interface RenderProgressEvent {
  progress: number; // 0-100
  status: string;
}

/**
 * VideoPlayer Component (Full Timeline Pre-Render Architecture)
 *
 * MPV-based video player via Tauri backend for universal codec support.
 * Supports HEVC/H.265, ProRes, DNxHD, VP9, AV1, and more.
 *
 * Architecture:
 * - Preview Mode: Plays single video file directly
 * - Timeline Mode: Renders entire timeline to temp file, then plays it
 *   - 1:1 time mapping (no offsets needed)
 *   - Cache-based (only re-render on timeline changes)
 */
export function VideoPlayer({
  src,
  onTimeUpdate,
  onEnded: _onEnded,
}: VideoPlayerProps) {
  const [mpvInitialized, setMpvInitialized] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [fpsMetrics, setFpsMetrics] = useState<PerformanceMetrics | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const frameUpdateIntervalRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSrcRef = useRef<string>("");
  const lastTimelineHashRef = useRef<string>("");
  const renderedTimelinePathRef = useRef<string | null>(null);

  const {
    setDuration,
    setCurrentTime,
    isPlaying,
    setPlayheadPosition,
    mode,
    seekTarget,
    clearSeekTarget,
  } = usePlayerStore();

  const timelineStore = useTimelineStore();
  const { showFpsOverlay } = useDevSettingsStore();

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
    resetFpsCounter().catch(console.error);

    // Listen for timeline render progress events
    const unlistenPromise = listen<RenderProgressEvent>('timeline-render-progress', (event) => {
      console.log('[VideoPlayer] Render progress:', event.payload);
      setRenderProgress(event.payload.progress);
    });

    // Cleanup on unmount
    return () => {
      invoke<MpvResponse>('mpv_stop').catch(console.error);
      unlistenPromise.then(unlisten => unlisten());
    };
  }, []);

  // Calculate timeline hash for cache invalidation
  const getTimelineHash = (): string => {
    if (!timelineStore.tracks || timelineStore.tracks.length === 0) return '';

    // Simple hash based on timeline structure
    const hashData = {
      tracks: timelineStore.tracks.length,
      duration: timelineStore.totalDuration,
      clips: timelineStore.tracks.flatMap((t: any) => t.clips.map((c: any) => ({
        id: c.id,
        path: c.filePath,
        start: c.startTime,
        trimIn: c.trimIn,
        trimOut: c.trimOut,
      }))),
    };

    return JSON.stringify(hashData);
  };

  // Load video file when src changes (preview mode)
  useEffect(() => {
    if (!mpvInitialized || !src || mode === 'timeline') return;
    if (src === lastSrcRef.current) return;

    const loadVideo = async () => {
      try {
        console.log('[VideoPlayer] Loading video (preview mode):', src);
        setVideoLoaded(false);
        setVideoDimensions(null);

        const response = await invoke<MpvResponse>('mpv_load_file', {
          filePath: src,
        });

        if (!response.success) {
          throw new Error(response.message);
        }

        lastSrcRef.current = src;
        setVideoLoaded(true);

        // Get video dimensions
        const dimsResponse = await invoke<MpvResponse>('mpv_get_video_dimensions');
        if (dimsResponse.success && dimsResponse.data?.width && dimsResponse.data?.height) {
          setVideoDimensions({
            width: dimsResponse.data.width,
            height: dimsResponse.data.height,
          });
        }

        // Get duration
        const durationResponse = await invoke<MpvResponse>('mpv_get_duration');
        if (durationResponse.success && durationResponse.data?.duration !== undefined) {
          setDuration(durationResponse.data.duration);
        }

        console.log('[VideoPlayer] Video loaded successfully');
      } catch (error) {
        console.error('[VideoPlayer] Failed to load video:', error);
        toast.error('Failed to load video', {
          description: String(error),
          duration: 5000,
        });
      }
    };

    loadVideo();
  }, [src, mpvInitialized, mode, setDuration]);

  // Render and load timeline (timeline mode)
  useEffect(() => {
    if (!mpvInitialized || mode !== 'timeline' || !timelineStore.tracks || timelineStore.tracks.length === 0) return;

    const timelineHash = getTimelineHash();
    if (timelineHash === lastTimelineHashRef.current && renderedTimelinePathRef.current) {
      console.log('[VideoPlayer] Timeline unchanged, using cached render');
      return;
    }

    const renderAndLoadTimeline = async () => {
      try {
        console.log('[VideoPlayer] Rendering timeline...');
        setIsRendering(true);
        setRenderProgress(0);
        setVideoLoaded(false);

        // Construct timeline object from store
        const timeline = {
          tracks: timelineStore.tracks,
          totalDuration: timelineStore.totalDuration,
        };

        // Render entire timeline to single file
        const renderResponse = await invoke<any>('cmd_render_timeline', {
          timeline,
        });

        if (!renderResponse.success) {
          throw new Error(renderResponse.message);
        }

        const timelinePath = renderResponse.data.output_path;
        const timelineDuration = renderResponse.data.duration; // milliseconds

        console.log('[VideoPlayer] Timeline rendered:', timelinePath, 'duration:', timelineDuration, 'ms');

        // Load rendered timeline file into MPV
        const loadResponse = await invoke<MpvResponse>('mpv_load_file', {
          filePath: timelinePath,
        });

        if (!loadResponse.success) {
          throw new Error(loadResponse.message);
        }

        // Store rendered timeline info
        renderedTimelinePathRef.current = timelinePath;
        lastTimelineHashRef.current = timelineHash;

        // Set duration (convert ms to seconds)
        setDuration(timelineDuration / 1000);

        // Get video dimensions
        const dimsResponse = await invoke<MpvResponse>('mpv_get_video_dimensions');
        if (dimsResponse.success && dimsResponse.data?.width && dimsResponse.data?.height) {
          setVideoDimensions({
            width: dimsResponse.data.width,
            height: dimsResponse.data.height,
          });
        }

        setVideoLoaded(true);
        setIsRendering(false);

        console.log('[VideoPlayer] Timeline loaded successfully');

        // Start playback if player is in playing state
        if (isPlaying) {
          await invoke<MpvResponse>('mpv_play');
        }
      } catch (error) {
        console.error('[VideoPlayer] Failed to render/load timeline:', error);
        setIsRendering(false);
        toast.error('Failed to render timeline', {
          description: String(error),
          duration: 5000,
        });
      }
    };

    renderAndLoadTimeline();
  }, [mpvInitialized, mode, timelineStore.tracks, timelineStore.totalDuration, setDuration, isPlaying]);

  // Handle seek operations
  useEffect(() => {
    if (!videoLoaded || seekTarget === null) return;

    const performSeek = async () => {
      try {
        console.log('[VideoPlayer] Seeking to:', seekTarget);
        const response = await invoke<MpvResponse>('mpv_seek', {
          timeSeconds: seekTarget,
        });

        if (response.success) {
          setCurrentTime(seekTarget);

          // In timeline mode, update playhead position (seconds to ms)
          if (mode === 'timeline') {
            setPlayheadPosition(seekTarget * 1000);
          }
        } else {
          console.error('[VideoPlayer] Seek failed:', response.message);
        }
      } catch (error) {
        console.error('[VideoPlayer] Seek error:', error);
      } finally {
        clearSeekTarget();
      }
    };

    performSeek();
  }, [seekTarget, videoLoaded, setCurrentTime, setPlayheadPosition, mode, clearSeekTarget]);

  // Sync play/pause state with MPV and update playhead during playback
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
              // Get current time from MPV
              const timeResponse = await invoke<MpvResponse>('mpv_get_time');
              if (timeResponse.success && timeResponse.data?.time !== undefined) {
                const currentTime = timeResponse.data.time;
                setCurrentTime(currentTime);
                onTimeUpdate?.(currentTime);

                // In timeline mode, playhead = MPV time (1:1 mapping!)
                if (mode === 'timeline') {
                  setPlayheadPosition(currentTime * 1000); // seconds to ms
                }

                // Record frame for FPS counter
                await recordPlaybackFrame();
              }
            } catch (error) {
              console.error('[VideoPlayer] Failed to update playhead:', error);
            }

            animationFrameRef.current = requestAnimationFrame(updatePlayhead);
          };

          updatePlayhead();
        } else {
          // Pause playback
          await invoke<MpvResponse>('mpv_pause');

          // Cancel animation frame
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
        }
      } catch (error) {
        console.error('[VideoPlayer] Failed to control playback:', error);
      }
    };

    controlPlayback();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, videoLoaded, setCurrentTime, setPlayheadPosition, mode, onTimeUpdate]);

  // Update FPS metrics overlay
  useEffect(() => {
    if (!showFpsOverlay) return;

    const interval = setInterval(async () => {
      try {
        const metrics = await getPlaybackFps();
        setFpsMetrics(metrics);
      } catch (error) {
        console.error('[VideoPlayer] Failed to get FPS metrics:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [showFpsOverlay]);

  // Update frame thumbnails for canvas
  useEffect(() => {
    if (!videoLoaded) return;

    const updateFrame = async () => {
      try {
        const response = await invoke<MpvResponse>('mpv_capture_frame');
        if (response.success && response.data?.frame && canvasRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          const img = new Image();
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
          };
          img.src = `data:image/png;base64,${response.data.frame}`;
        }
      } catch (error) {
        console.error('[VideoPlayer] Failed to capture frame:', error);
      }
    };

    frameUpdateIntervalRef.current = window.setInterval(updateFrame, 100);

    return () => {
      if (frameUpdateIntervalRef.current) {
        clearInterval(frameUpdateIntervalRef.current);
        frameUpdateIntervalRef.current = null;
      }
    };
  }, [videoLoaded]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      {/* Canvas for video frames */}
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full object-contain"
        style={{ display: videoLoaded ? 'block' : 'none' }}
      />

      {/* Loading indicator */}
      {!videoLoaded && !isRendering && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white/70">Loading video...</div>
        </div>
      )}

      {/* Timeline rendering progress */}
      {isRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <div className="text-white text-lg mb-2">Rendering timeline...</div>
            <div className="text-white/70">{Math.round(renderProgress)}%</div>
            <div className="w-64 h-2 bg-white/20 rounded-full mt-4 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${renderProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* FPS Overlay (Story 5.8 AC#1) */}
      {showFpsOverlay && fpsMetrics && (
        <div className="absolute top-2 left-2 bg-black/80 text-white text-xs font-mono p-2 rounded">
          <div>FPS: {fpsMetrics.current_fps.toFixed(1)}</div>
          <div>Avg: {fpsMetrics.average_fps.toFixed(1)}</div>
          <div>Frames: {fpsMetrics.total_frames}</div>
          <div>Time: {fpsMetrics.uptime_seconds.toFixed(1)}s</div>
        </div>
      )}

      {/* Video dimensions info */}
      {videoDimensions && (
        <div className="absolute bottom-2 right-2 bg-black/80 text-white/50 text-xs font-mono px-2 py-1 rounded">
          {videoDimensions.width} × {videoDimensions.height}
        </div>
      )}
    </div>
  );
}
