import { useRef, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlayerStore } from "@/stores/playerStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useCompositionStore } from "@/stores/compositionStore";
import { useDevSettingsStore } from "@/stores/devSettingsStore";
import { toast } from "sonner";
import { setMpvVolume, applyMpvFadeFilters, clearMpvAudioFilters } from "@/lib/tauri/mpv";
import { analyzeTimelineGaps, areAllTracksInGap, type TimelineGapAnalysis } from "@/lib/timeline/gapAnalyzer";
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
  const [isInGap, setIsInGap] = useState(false);
  const [fpsMetrics, setFpsMetrics] = useState<PerformanceMetrics | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const frameUpdateIntervalRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSrcRef = useRef<string>("");
  const lastFrameTimeRef = useRef<number>(0); // For gap playhead tracking (Story 5.4 AC#5)

  // Cache gap analysis to avoid recalculating on every frame (performance optimization)
  const gapAnalysisCache = useRef<TimelineGapAnalysis | null>(null);
  const gapAnalysisCacheKey = useRef<string>('');

  // Track rendered segment playback (Story 5.8: Multi-track composition)
  const renderedSegmentRef = useRef<{
    isPlayingSegment: boolean;
    segmentStartTime: number; // Timeline position where segment starts (ms)
    segmentDuration: number; // Duration of the segment (ms)
  }>({
    isPlayingSegment: false,
    segmentStartTime: 0,
    segmentDuration: 0,
  });

  // Track currently loaded clip (for single-track transitions)
  const loadedClipRef = useRef<string | null>(null);

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

  // Composition state for timeline mode (Story 5.2 AC#3)
  const {
    setCompositionTime,
    activeClips,
  } = useCompositionStore();

  // Developer settings for FPS overlay (Story 5.8 AC#1)
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

    // Reset FPS counter on mount (Story 5.8 AC#1)
    resetFpsCounter().catch(console.error);

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

        // Clear rendered segment tracking when loading a new video
        renderedSegmentRef.current.isPlayingSegment = false;
        loadedClipRef.current = null;

        // MPV's loadfile with 'replace' mode automatically stops the current file
        // The backend now properly ignores EndFile events from the replace operation
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

  // ADR-008: Multi-track composition rendering (Hybrid Smart Segment Pre-Rendering)
  // Detect when activeClips requires multi-track composition and render segment
  // Also handle single-track playback when transitioning from multi-track
  useEffect(() => {
    if (mode !== 'timeline') return;
    if (!mpvInitialized) return; // Only require MPV to be initialized, not videoLoaded

    const videoClips = activeClips.filter(ac => ac.trackType === 'video');

    // No video clips active - this is a gap or empty timeline
    if (videoClips.length === 0) {
      console.log('[VideoPlayer] No active video clips at current position');
      return;
    }

    const isMultiTrack = videoClips.length > 1;

    if (isMultiTrack) {
      console.log(`[VideoPlayer] Multi-track composition detected: ${videoClips.length} video tracks active`);

      const renderAndLoadSegment = async () => {
        try {
          // Get current playhead position from store (not from dependencies to avoid re-running on every frame)
          const currentPlayhead = usePlayerStore.getState().playheadPosition;

          // Prevent re-rendering if we're already playing a segment at this position
          if (renderedSegmentRef.current.isPlayingSegment &&
              Math.abs(renderedSegmentRef.current.segmentStartTime - currentPlayhead) < 100) {
            console.log('[VideoPlayer] Already playing segment at this position, skipping re-render');
            return;
          }

          console.log('[VideoPlayer] Rendering multi-track segment...');

          // Classify segment type
          const classifyResponse = await invoke<any>('cmd_classify_segment_type', {
            activeClips: activeClips,
          });

          if (!classifyResponse.success) {
            throw new Error(classifyResponse.message);
          }

          console.log('[VideoPlayer] Segment classified as:', classifyResponse.data.segment_type);

          if (classifyResponse.data.segment_type === 'complex') {
            // Calculate segment duration based on shortest remaining clip duration
            // The segment should last until the first clip ends (composition changes)
            const segmentDuration = Math.min(...videoClips.map(vc => {
              const clipStart = vc.clip.startTime;
              const clipDuration = vc.clip.trimOut - vc.clip.trimIn;
              const clipEnd = clipStart + clipDuration;
              const remainingDuration = clipEnd - currentPlayhead;
              return remainingDuration;
            }));

            console.log('[VideoPlayer] Segment duration:', segmentDuration, 'ms');

            // Render the segment
            // Note: Rust backend expects u64 integers, so convert to integers
            const renderResponse = await invoke<any>('cmd_render_segment', {
              activeClips: activeClips,
              startTime: Math.floor(currentPlayhead),
              duration: Math.floor(segmentDuration),
            });

            if (!renderResponse.success) {
              throw new Error(renderResponse.message);
            }

            const segmentPath = renderResponse.data.output_path;
            console.log('[VideoPlayer] Segment rendered:', segmentPath);

            // Track that we're playing a rendered segment
            renderedSegmentRef.current = {
              isPlayingSegment: true,
              segmentStartTime: currentPlayhead,
              segmentDuration: segmentDuration,
            };

            // Load rendered segment into MPV
            const loadResponse = await invoke<MpvResponse>('mpv_load_file', {
              filePath: segmentPath,
            });

            if (!loadResponse.success) {
              throw new Error(loadResponse.message);
            }

            console.log('[VideoPlayer] Rendered segment loaded into MPV successfully');

            // Mark video as loaded for playback loop
            setVideoLoaded(true);

            // Start playback if player is in playing state
            const currentlyPlaying = usePlayerStore.getState().isPlaying;
            if (currentlyPlaying) {
              await invoke<MpvResponse>('mpv_play');
            }
          }
        } catch (error) {
          console.error('[VideoPlayer] Failed to render multi-track segment:', error);
          // Clear segment tracking on error
          renderedSegmentRef.current.isPlayingSegment = false;
          toast.error('Failed to render multi-track composition', {
            description: String(error),
            duration: 5000,
          });
        }
      };

      renderAndLoadSegment();
    } else if (videoClips.length === 1) {
      // Single-track: load the clip's file directly (Hybrid Smart Segment)
      const singleClip = videoClips[0];
      const clipFilePath = singleClip.clip.filePath;

      const loadSingleClip = async () => {
        try {
          // Check if we need to load a different clip or transition from segment
          const needsLoad =
            renderedSegmentRef.current.isPlayingSegment || // Transitioning from multi-track segment
            loadedClipRef.current !== clipFilePath; // Different clip file

          if (!needsLoad) {
            console.log('[VideoPlayer] Clip already loaded:', clipFilePath);
            return; // Already playing the correct clip
          }

          console.log('[VideoPlayer] Loading single-track clip:', clipFilePath, 'relativeTime:', singleClip.relativeTime + 'ms');

          // Clear segment tracking if transitioning from multi-track
          if (renderedSegmentRef.current.isPlayingSegment) {
            console.log('[VideoPlayer] Transitioning from multi-track to single-track');
            renderedSegmentRef.current.isPlayingSegment = false;
          }

          // Load the single clip's file
          const loadResponse = await invoke<MpvResponse>('mpv_load_file', {
            filePath: clipFilePath,
          });

          if (!loadResponse.success) {
            throw new Error(loadResponse.message);
          }

          // Track which clip is loaded
          loadedClipRef.current = clipFilePath;

          // Mark video as loaded for playback loop
          setVideoLoaded(true);

          console.log('[VideoPlayer] Single clip loaded, seeking to relative time:', singleClip.relativeTime);

          // Seek to the correct position within the clip
          const clipRelativeTime = singleClip.relativeTime / 1000; // Convert ms to seconds
          await invoke<MpvResponse>('mpv_seek', {
            timeSeconds: clipRelativeTime,
          });

          // Resume playback if playing
          const currentlyPlaying = usePlayerStore.getState().isPlaying;
          if (currentlyPlaying) {
            await invoke<MpvResponse>('mpv_play');
          }
        } catch (error) {
          console.error('[VideoPlayer] Failed to load single clip:', error);
          toast.error('Failed to load clip', {
            description: String(error),
            duration: 5000,
          });
        }
      };

      loadSingleClip();
    }
  }, [activeClips, mode, mpvInitialized]); // Only trigger on activeClips change, not every playhead update

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

    // In timeline mode, playhead moves freely through entire timeline
    // (clip selection is for editing purposes only, not playback restriction)
    const targetTimeMs = playheadPosition;

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
              const now = performance.now();
              const deltaTime = lastFrameTimeRef.current > 0 ? now - lastFrameTimeRef.current : 0;
              lastFrameTimeRef.current = now;

              let currentTimeMs: number;

              // Story 5.4 AC#5: During gaps, advance playhead based on system time (not MPV time)
              if (isInGap) {
                // Get current playhead position and advance by delta time
                const currentPlayhead = usePlayerStore.getState().playheadPosition;
                currentTimeMs = currentPlayhead + deltaTime;
              } else {
                // Not in gap: get time from MPV
                const timeResponse = await invoke<MpvResponse>('mpv_get_time');
                if (!timeResponse.success || timeResponse.data?.time === undefined) {
                  return; // Skip this frame if MPV time unavailable
                }
                const currentVideoTime = timeResponse.data.time;

                // Story 5.8: Calculate timeline position based on playback mode
                if (renderedSegmentRef.current.isPlayingSegment) {
                  // Playing rendered multi-track segment: offset by segment start time
                  const segmentTimeMs = currentVideoTime * 1000;
                  currentTimeMs = renderedSegmentRef.current.segmentStartTime + segmentTimeMs;

                  // Check if segment has ended
                  if (segmentTimeMs >= renderedSegmentRef.current.segmentDuration) {
                    console.log('[VideoPlayer] Rendered segment ended, clearing tracking');
                    renderedSegmentRef.current.isPlayingSegment = false;
                    // Continue to the next part of timeline
                    currentTimeMs = renderedSegmentRef.current.segmentStartTime + renderedSegmentRef.current.segmentDuration;
                  }
                } else {
                  // Playing single clip in timeline mode: offset by clip's start time
                  const compositionState = useCompositionStore.getState();
                  const currentActiveClips = compositionState.activeClips.filter(ac => ac.trackType === 'video');

                  if (currentActiveClips.length === 1) {
                    // Single clip: timeline position = clip start + MPV time
                    const activeClip = currentActiveClips[0];
                    currentTimeMs = activeClip.clip.startTime + (currentVideoTime * 1000);
                  } else {
                    // Fallback: use MPV time directly (shouldn't happen in timeline mode)
                    currentTimeMs = currentVideoTime * 1000;
                  }
                }
              }

                // Only update playhead in timeline mode
                const currentMode = usePlayerStore.getState().mode;
                if (currentMode === 'timeline') {
                  // Story 5.2 AC#3: Use composition state when in timeline mode
                  // Update composition time (this triggers clip query updates)
                  setCompositionTime(currentTimeMs);

                  // Timeline mode: playhead flows freely through entire timeline
                  // Clip selection is for editing only, not playback restriction
                  setPlayheadPosition(currentTimeMs);

                  // Story 5.4 AC#1, AC#2: Handle gaps with black frame rendering
                  const timelineState = useTimelineStore.getState();
                  const timeline = {
                    tracks: timelineState.tracks,
                    totalDuration: timelineState.totalDuration,
                  };

                  // Cache gap analysis - only recalculate when timeline structure changes
                  const cacheKey = `${timeline.tracks.length}-${timeline.totalDuration}-${timeline.tracks.map(t => t.clips.length).join(',')}`;
                  if (gapAnalysisCacheKey.current !== cacheKey) {
                    gapAnalysisCache.current = analyzeTimelineGaps(timeline);
                    gapAnalysisCacheKey.current = cacheKey;
                  }

                  // Only show black frame if ALL tracks are in a gap (not just one empty track)
                  // This allows multi-track compositions where some tracks may be empty
                  const allTracksInGap = areAllTracksInGap(currentTimeMs, timeline);

                  if (allTracksInGap) {
                    // In gap - pause MPV and render black frame (Story 5.4 AC#2)
                    if (!isInGap) {
                      console.log(`[VideoPlayer] Entering gap at ${currentTimeMs}ms (all tracks empty)`);
                      setIsInGap(true);

                      // Pause MPV during gap to prevent audio/video from continuing
                      await invoke<MpvResponse>('mpv_pause');
                    }
                  } else {
                    // Not in gap - ensure MPV is playing if player is playing
                    if (isInGap) {
                      console.log(`[VideoPlayer] Exiting gap at ${currentTimeMs}ms`);
                      setIsInGap(false);

                      // Resume MPV playback
                      if (usePlayerStore.getState().isPlaying) {
                        await invoke<MpvResponse>('mpv_play');
                      }
                    }
                  }

                  // Story 5.3: Clip transitions now handled by the activeClips effect (lines 242-401)
                  // This old logic is disabled to prevent conflicts with the new effect-based approach

                  // Check if timeline has ended (Story 5.3 AC#7)
                  const timelineEnded = useCompositionStore.getState().isEndOfTimeline(currentTimeMs);
                  if (timelineEnded && usePlayerStore.getState().isPlaying) {
                    console.log('[VideoPlayer] End of timeline reached, stopping playback');

                    // Stop playback
                    usePlayerStore.getState().pause();
                    await invoke<MpvResponse>('mpv_pause');

                    // Reset playhead to timeline start
                    setPlayheadPosition(0);
                    setCompositionTime(0);

                    // Show completion toast
                    toast.success('Playback complete', {
                      description: 'Timeline playback finished',
                    });
                  }
                }
                // In preview mode, playhead stays at 0 and doesn't move
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

          // Reset frame time tracking (Story 5.4 AC#5)
          lastFrameTimeRef.current = 0;
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

  // Apply volume and fade filters for selected clip during playback (Story 3.9.1/3.10.1)
  useEffect(() => {
    if (!videoLoaded || !isPlaying || mode !== 'timeline' || !selectedClip) {
      // Clear filters when not playing or no clip selected
      if (videoLoaded && !isPlaying) {
        clearMpvAudioFilters().catch(console.error);
      }
      return;
    }

    const applyAudioFilters = async () => {
      try {
        // Apply volume control (Story 3.9.1)
        const clipVolume = selectedClip.volume !== undefined ? selectedClip.volume * 200 : 100; // Convert 0-1 to 0-200
        const clipMuted = selectedClip.muted ?? false;

        await setMpvVolume(clipVolume, clipMuted);
        console.log(`[VideoPlayer] Applied volume: ${clipVolume}%, muted: ${clipMuted}`);

        // Apply fade filters if present (Story 3.10.1)
        const fadeIn = selectedClip.fadeIn ?? 0;
        const fadeOut = selectedClip.fadeOut ?? 0;

        if (fadeIn > 0 || fadeOut > 0) {
          // Calculate clip duration from trim points
          const clipDuration = selectedClip.trimOut - selectedClip.trimIn;

          await applyMpvFadeFilters(fadeIn, fadeOut, clipDuration);
          console.log(`[VideoPlayer] Applied fades: in=${fadeIn}ms, out=${fadeOut}ms, duration=${clipDuration}ms`);
        } else {
          // Clear fade filters if no fades specified
          await clearMpvAudioFilters();
        }
      } catch (error) {
        console.error('[VideoPlayer] Failed to apply audio filters:', error);
      }
    };

    applyAudioFilters();
  }, [videoLoaded, isPlaying, mode, selectedClip]);

  // FPS monitoring: Poll metrics when overlay is enabled (Story 5.8 AC#1)
  useEffect(() => {
    if (!showFpsOverlay || !videoLoaded) return;

    const pollFps = async () => {
      try {
        const metrics = await getPlaybackFps();
        setFpsMetrics(metrics);
      } catch (error) {
        console.error('[VideoPlayer] Failed to get FPS metrics:', error);
      }
    };

    // Poll FPS every 500ms when overlay is enabled
    const fpsIntervalId = setInterval(pollFps, 500);

    // Initial poll
    pollFps();

    return () => clearInterval(fpsIntervalId);
  }, [showFpsOverlay, videoLoaded]);

  // Frame capture and rendering loop (Story 5.4 AC#2: Black frame rendering)
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions (use video dimensions if available, or default)
    if (videoDimensions) {
      canvas.width = videoDimensions.width;
      canvas.height = videoDimensions.height;
    } else {
      // Default canvas size when no video loaded
      canvas.width = 1920;
      canvas.height = 1080;
    }

    // Render black frame when in gap (Story 5.4 AC#2)
    const renderBlackFrame = () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    // Capture and draw frames at ~15 FPS
    const captureFrame = async () => {
      try {
        // Record frame for FPS tracking (Story 5.8 AC#1)
        if (videoLoaded && isPlaying) {
          recordPlaybackFrame().catch(console.error);
        }

        // If in gap, render black frame instead of capturing from MPV (Story 5.4 AC#2)
        if (isInGap) {
          renderBlackFrame();
          return;
        }

        // If not in gap and video loaded, capture frame from MPV
        if (videoLoaded) {
          const response = await invoke<MpvResponse>('mpv_capture_frame');
          if (response.success && response.data?.frame) {
            // Convert base64 to image and draw to canvas
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = `data:image/jpeg;base64,${response.data.frame}`;
          }
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
  }, [videoLoaded, videoDimensions, isInGap, isPlaying]);

  return (
    <div className="w-full h-full flex items-center justify-center bg-black relative">
      {!mpvInitialized && (
        <div className="text-white text-center">
          <div className="text-xl mb-2">🎬 Initializing MPV Player...</div>
          <div className="text-sm text-gray-400">Universal codec support loading</div>
        </div>
      )}

      {mpvInitialized && !videoLoaded && !isInGap && (
        <div className="text-white text-center">
          <div className="text-xl mb-2">📂 Loading Video...</div>
          <div className="text-sm text-gray-400">Processing with libmpv</div>
        </div>
      )}

      {/* Canvas always rendered when MPV initialized (for gap black frames or video) - Story 5.4 AC#2 */}
      {mpvInitialized && (videoLoaded || isInGap) && (
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

      {mpvInitialized && videoLoaded && !videoDimensions && !isInGap && (
        <div className="text-white text-center">
          <div className="text-xl mb-2">⚙️ Preparing Video...</div>
          <div className="text-sm text-gray-400">Getting video dimensions</div>
        </div>
      )}

      {/* FPS Overlay - Story 5.8 AC#1 */}
      {showFpsOverlay && fpsMetrics && (
        <div className="absolute top-4 right-4 bg-black/80 text-white px-3 py-2 rounded-lg font-mono text-sm border border-green-500/50">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">FPS:</span>
              <span className={fpsMetrics.current_fps >= 60 ? "text-green-400" : fpsMetrics.current_fps >= 30 ? "text-yellow-400" : "text-red-400"}>
                {fpsMetrics.current_fps.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Avg:</span>
              <span className="text-gray-300">{fpsMetrics.average_fps.toFixed(1)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Frames:</span>
              <span className="text-gray-300">{fpsMetrics.total_frames}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Uptime:</span>
              <span className="text-gray-300">{fpsMetrics.uptime_seconds.toFixed(1)}s</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
