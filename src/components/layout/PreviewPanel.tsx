import { forwardRef } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/stores/playerStore";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { PlayerControls } from "@/components/player/PlayerControls";

export const PreviewPanel = forwardRef<HTMLDivElement>((_props, ref) => {
  const currentVideo = usePlayerStore((state) => state.currentVideo);

  return (
    <div
      ref={ref}
      className={cn(
        "h-2/5 bg-gray-50 rounded-lg shadow-sm",
        "flex flex-col",
        "border border-gray-200",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      )}
      tabIndex={0}
      role="region"
      aria-label="Video Preview"
    >
      {currentVideo ? (
        <>
          <div className="flex-1 p-4 flex items-center justify-center bg-black rounded-t-lg">
            <VideoPlayer src={currentVideo.filePath} />
          </div>
          <PlayerControls />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
          <Play className="w-12 h-12 text-gray-400" />
          <p className="text-gray-600 text-center text-sm">
            No video loaded. Select a file from the media library to preview.
          </p>
        </div>
      )}
    </div>
  );
});

PreviewPanel.displayName = "PreviewPanel";
