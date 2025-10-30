import { useEffect } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { usePlayerStore } from "@/stores/playerStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { formatTime } from "@/lib/utils/timeUtils";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

/**
 * PlayerControls Component
 *
 * Custom playback controls for the video player.
 * Provides play/pause button, time display, and keyboard shortcuts.
 *
 * Implements ADR-007 Focus Context System:
 * - Automatically switches to timeline mode when timeline has clips
 * - Falls back to preview mode when playing library videos
 * - "Last interaction wins" - intelligent mode switching based on content
 */
export function PlayerControls() {
  const { isPlaying, currentTime, duration, togglePlayPause, seek, setFocusContext, focusContext, currentVideo, mode } =
    usePlayerStore();

  // Subscribe to timeline to detect if there are clips for auto-mode switching
  const tracks = useTimelineStore((state) => state.tracks);
  const timelineDuration = useTimelineStore((state) => state.totalDuration);

  // Check if timeline has any clips for intelligent mode switching
  const hasTimelineClips = tracks.some(track => track.clips.length > 0);

  // Use timeline duration in timeline mode, otherwise use video duration
  const displayDuration = mode === 'timeline' ? timelineDuration / 1000 : duration;

  // Handle play/pause with intelligent mode switching (ADR-007)
  const handlePlayPause = () => {
    // SMART AUTO-DETECTION:
    // 1. If user just interacted with timeline (focusContext='timeline'), play timeline composition
    // 2. Otherwise if user selected a library video (focusContext='source' and currentVideo exists), play that
    // 3. Otherwise if timeline has clips, switch to timeline and play composition
    // 4. Otherwise stay in current mode

    if (focusContext === 'timeline') {
      // User clicked/dragged on timeline - play timeline composition
      // (mode already set to 'timeline' by Timeline/Playhead components)
    } else if (focusContext === 'source' && currentVideo) {
      // User selected a library video - keep preview mode
    } else if (hasTimelineClips) {
      // No explicit focus, but timeline has clips - default to timeline playback
      setFocusContext('timeline');
    }

    togglePlayPause();
  };

  // Handle slider seek
  const handleSliderChange = (value: number[]) => {
    const newTime = (value[0] / 100) * displayDuration;
    seek(newTime);
  };

  // Handle restart button - seek to 0 and pause
  const handleRestart = () => {
    seek(0);
    if (isPlaying) {
      togglePlayPause(); // Pause if currently playing
    }
  };

  // Calculate progress percentage
  const progress = displayDuration > 0 ? (currentTime / displayDuration) * 100 : 0;

  // Keyboard shortcuts: Space, Arrow keys, Home, End
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Skip if focused on input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            // Frame backward (1/30s for 30fps)
            seek(Math.max(0, currentTime - 1 / 30));
          } else {
            // 5s backward
            seek(Math.max(0, currentTime - 5));
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            // Frame forward (1/30s for 30fps)
            seek(Math.min(displayDuration, currentTime + 1 / 30));
          } else {
            // 5s forward
            seek(Math.min(displayDuration, currentTime + 5));
          }
          break;
        case "Home":
          e.preventDefault();
          seek(0);
          break;
        case "End":
          e.preventDefault();
          seek(displayDuration);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [handlePlayPause, seek, currentTime, displayDuration]);

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-3 bg-gray-50 border-t border-gray-200",
        "rounded-b-lg"
      )}
    >
      {/* Play/Pause Button */}
      <button
        onClick={handlePlayPause}
        className={cn(
          "p-2 rounded-md bg-white border border-gray-300",
          "hover:bg-gray-100 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        )}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 text-gray-700" />
        ) : (
          <Play className="w-5 h-5 text-gray-700" />
        )}
      </button>

      {/* Restart Button */}
      <button
        onClick={handleRestart}
        className={cn(
          "p-2 rounded-md bg-white border border-gray-300",
          "hover:bg-gray-100 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        )}
        aria-label="Restart"
        title="Restart video (or press Home)"
      >
        <RotateCcw className="w-5 h-5 text-gray-700" />
      </button>

      {/* Time Display */}
      <div className="flex items-center gap-2 text-sm text-gray-600 min-w-[120px]">
        <span className="font-mono">{formatTime(currentTime)}</span>
        <span>/</span>
        <span className="font-mono">{formatTime(displayDuration)}</span>
      </div>

      {/* Progress Slider */}
      <div className="flex-1">
        <Slider
          value={[progress]}
          onValueChange={handleSliderChange}
          max={100}
          step={0.1}
          className="cursor-pointer"
          aria-label="Video progress"
          aria-valuetext={`${Math.round(progress)}% - ${formatTime(currentTime)} of ${formatTime(displayDuration)}`}
        />
      </div>
    </div>
  );
}
