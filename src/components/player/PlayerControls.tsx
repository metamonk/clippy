import { useEffect } from "react";
import { Play, Pause } from "lucide-react";
import { usePlayerStore } from "@/stores/playerStore";
import { formatTime } from "@/lib/utils/timeUtils";
import { cn } from "@/lib/utils";

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
  const { isPlaying, currentTime, duration, togglePlayPause } =
    usePlayerStore();

  // Keyboard shortcut: Space bar toggles play/pause
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle space if not focused on an input/textarea
      if (
        e.code === "Space" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        togglePlayPause();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [togglePlayPause]);

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

      {/* Time Display */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span className="font-mono">{formatTime(currentTime)}</span>
        <span>/</span>
        <span className="font-mono">{formatTime(duration)}</span>
      </div>
    </div>
  );
}
