import { useRef, useEffect } from "react";
import videojs from "video.js";
import type Player from "video.js/dist/types/player";
import { usePlayerStore } from "@/stores/playerStore";
import { useTimelineStore } from "@/stores/timelineStore";

/**
 * VideoPlayer props
 */
interface VideoPlayerProps {
  /** Video file path to play */
  src: string;

  /** Callback when player is ready */
  onReady?: (player: Player) => void;

  /** Callback on time updates */
  onTimeUpdate?: (currentTime: number) => void;

  /** Callback when video ends */
  onEnded?: () => void;
}

/**
 * VideoPlayer Component
 *
 * React wrapper for Video.js player with proper lifecycle management.
 * Handles Video.js initialization, cleanup, and event binding.
 *
 * IMPORTANT: Video.js requires careful lifecycle management:
 * 1. Create instance after DOM mount
 * 2. Store instance in ref for imperative control
 * 3. Clean up on unmount to prevent memory leaks
 * 4. Re-initialize when src changes
 */
export function VideoPlayer({
  src,
  onReady,
  onTimeUpdate,
  onEnded,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const {
    setDuration,
    setCurrentTime,
    isPlaying,
    playheadPosition,
    setPlayheadPosition,
  } = usePlayerStore();

  // Get selected clip from timeline for trim boundary enforcement
  const { selectedClipId, getClip } = useTimelineStore();
  const selectedClip = selectedClipId ? getClip(selectedClipId) : undefined;

  // Initialize Video.js player on mount
  useEffect(() => {
    if (!playerRef.current && videoRef.current) {
      const player = videojs(videoRef.current, {
        controls: true,
        fluid: true,
        responsive: true,
        preload: "auto",
        autoplay: false,
        html5: {
          nativeVideoTracks: true,
          nativeAudioTracks: true,
          nativeTextTracks: true,
        },
      });

      playerRef.current = player;

      // Bind event listeners
      player.on("loadedmetadata", () => {
        const duration = player.duration();
        if (duration && !isNaN(duration)) {
          setDuration(duration);
        }
      });

      player.on("timeupdate", () => {
        const currentTime = player.currentTime();
        if (currentTime !== undefined && !isNaN(currentTime)) {
          setCurrentTime(currentTime);
          onTimeUpdate?.(currentTime);
        }
      });

      player.on("ended", () => {
        onEnded?.();
      });

      player.on("error", () => {
        console.error("Video.js error:", player.error());
      });

      onReady?.(player);
    }
  }, [onReady, onTimeUpdate, onEnded, setDuration, setCurrentTime]);

  // Update source when src prop changes
  useEffect(() => {
    const player = playerRef.current;
    if (player && src) {
      player.src({
        src,
        type: "video/mp4",
      });
    }
  }, [src]);

  // Sync playhead position to video player (when timeline is scrubbed)
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    let targetTimeMs = playheadPosition;

    // Constrain scrubbing to trim boundaries if a clip is selected
    if (selectedClip) {
      const clipStartTime = selectedClip.startTime;
      const clipTrimIn = clipStartTime + selectedClip.trimIn;
      const clipTrimOut = clipStartTime + selectedClip.trimOut;

      // Clamp playhead to [trimIn, trimOut] range
      targetTimeMs = Math.max(clipTrimIn, Math.min(clipTrimOut, targetTimeMs));
    }

    // Convert playhead position (ms) to seconds for Video.js
    const targetTimeSeconds = targetTimeMs / 1000;

    // Only seek if the difference is significant (> 100ms to avoid unnecessary seeks during playback)
    const currentPlayerTime = player.currentTime();
    if (currentPlayerTime !== undefined && Math.abs(currentPlayerTime - targetTimeSeconds) > 0.1) {
      player.currentTime(targetTimeSeconds);
    }
  }, [playheadPosition, selectedClip]);

  // Sync play/pause state with store and manage playhead updates during playback
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying) {
      // Start playback
      player.play()?.catch((err) => {
        console.error("Playback error:", err);
      });

      // Start requestAnimationFrame loop to sync playhead with video during playback
      const updatePlayhead = () => {
        const currentPlayerTime = player.currentTime();
        if (currentPlayerTime !== undefined && !isNaN(currentPlayerTime)) {
          const currentTimeMs = currentPlayerTime * 1000;

          // Check if we have a selected clip with trim boundaries
          if (selectedClip) {
            const clipStartTime = selectedClip.startTime;
            const clipTrimIn = clipStartTime + selectedClip.trimIn;
            const clipTrimOut = clipStartTime + selectedClip.trimOut;

            // If playback exceeds trimOut boundary, stop playback
            if (currentTimeMs >= clipTrimOut) {
              usePlayerStore.getState().pause();
              setPlayheadPosition(clipTrimOut);
              player.pause();
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

        // Continue loop while playing
        if (usePlayerStore.getState().isPlaying) {
          animationFrameRef.current = requestAnimationFrame(updatePlayhead);
        }
      };

      animationFrameRef.current = requestAnimationFrame(updatePlayhead);
    } else {
      // Pause playback
      player.pause();

      // Cancel animation frame loop
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }

    // Cleanup on unmount or when isPlaying changes
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, setPlayheadPosition, selectedClip]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const player = playerRef.current;
      if (player) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <div data-vjs-player className="w-full h-full">
      <video
        ref={videoRef}
        className="video-js vjs-theme-fantasy vjs-big-play-centered"
      />
    </div>
  );
}
