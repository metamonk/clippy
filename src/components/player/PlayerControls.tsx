import { useEffect } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { usePlayerStore } from "@/stores/playerStore";
import { formatTime } from "@/lib/utils/timeUtils";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

/**
 * PlayerControls Component
 *
 * Custom playback controls for the video player.
 * Provides play/pause button, time display, and keyboard shortcuts.
 *
 * Note: This component complements Video.js built-in controls.
 * For this story, Video.js built-in controls are sufficient to meet ACs.
 * This component is scaffolded for future timeline integration (Story 1.7).
 */
export function PlayerControls() {
  const { isPlaying, currentTime, duration, togglePlayPause, seek } =
    usePlayerStore();

  // Handle slider seek
  const handleSliderChange = (value: number[]) => {
    const newTime = (value[0] / 100) * duration;
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
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

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
          togglePlayPause();
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
            seek(Math.min(duration, currentTime + 1 / 30));
          } else {
            // 5s forward
            seek(Math.min(duration, currentTime + 5));
          }
          break;
        case "Home":
          e.preventDefault();
          seek(0);
          break;
        case "End":
          e.preventDefault();
          seek(duration);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [togglePlayPause, seek, currentTime, duration]);

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-3 bg-gray-50 border-t border-gray-200",
        "rounded-b-lg"
      )}
    >
      {/* Play/Pause Button */}
      <button
        onClick={togglePlayPause}
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
        <span className="font-mono">{formatTime(duration)}</span>
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
          aria-valuetext={`${Math.round(progress)}% - ${formatTime(currentTime)} of ${formatTime(duration)}`}
        />
      </div>
    </div>
  );
}
