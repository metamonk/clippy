import { forwardRef } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/stores/playerStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { PlayerControls } from "@/components/player/PlayerControls";

export const PreviewPanel = forwardRef<HTMLDivElement>((_props, ref) => {
  const currentVideo = usePlayerStore((state) => state.currentVideo);
  const mode = usePlayerStore((state) => state.mode);
  const playheadPosition = usePlayerStore((state) => state.playheadPosition);
  const tracks = useTimelineStore((state) => state.tracks);

  // Intelligently determine which video to load based on mode (ADR-007)
  let videoSrc: string | null = null;

  if (mode === 'timeline') {
    // Timeline mode: VideoPlayer renders entire timeline internally
    // Just check if we have any tracks with clips
    const hasContent = tracks.some(track => track.clips && track.clips.length > 0);
    videoSrc = hasContent ? 'timeline' : null; // Sentinel value for timeline mode
  } else {
    // Preview mode: Load the selected library video
    videoSrc = currentVideo ? currentVideo.filePath : null;
  }

  return (
    <div
      ref={ref}
      className={cn(
        "flex-1 min-h-0 bg-gray-50 rounded-lg shadow-sm",
        "flex flex-col",
        "border border-gray-200",
        "overflow-hidden",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      )}
      tabIndex={0}
      role="region"
      aria-label="Video Preview"
    >
      {videoSrc ? (
        <>
          <div className="flex-1 p-4 flex items-center justify-center bg-black rounded-t-lg overflow-hidden min-h-0">
            <VideoPlayer src={videoSrc} />
          </div>
          <div className="flex-shrink-0">
            <PlayerControls />
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
          <Play className="w-12 h-12 text-gray-400" />
          <p className="text-gray-600 text-center text-sm">
            {mode === 'timeline'
              ? 'No clips on timeline. Add clips from the media library.'
              : 'No video loaded. Select a file from the media library to preview.'}
          </p>
        </div>
      )}
    </div>
  );
});

PreviewPanel.displayName = "PreviewPanel";
