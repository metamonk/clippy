import { forwardRef } from "react";
import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaLibraryStore } from "@/stores/mediaLibraryStore";
import { MediaImport } from "@/components/media-library/MediaImport";
import { MediaItem } from "@/components/media-library/MediaItem";

export const MediaLibraryPanel = forwardRef<HTMLDivElement>((_props, ref) => {
  const mediaFiles = useMediaLibraryStore((state) => state.mediaFiles);

  return (
    <div
      ref={ref}
      className={cn(
        "w-80 flex-shrink-0 bg-gray-100 rounded-lg shadow-sm",
        "flex flex-col",
        "border border-gray-200",
        "overflow-hidden",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      )}
      tabIndex={0}
      role="region"
      aria-label="Media Library"
    >
      {/* Import zone at the top */}
      <MediaImport />

      {/* Media files list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {mediaFiles.length === 0 ? (
          /* Empty state - shown only when no files imported */
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <FolderOpen className="w-12 h-12 text-gray-400" />
            <p className="text-gray-600 text-center text-sm">
              No media imported yet. Drag files above or click Import Video.
            </p>
          </div>
        ) : (
          /* Display imported files */
          <div className="space-y-3">
            {mediaFiles.map((file) => (
              <MediaItem key={file.id} mediaFile={file} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

MediaLibraryPanel.displayName = "MediaLibraryPanel";
