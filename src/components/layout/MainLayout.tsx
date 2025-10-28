import { useRef, useEffect, useState } from "react";
import { PreviewPanel } from "./PreviewPanel";
import { TimelinePanel } from "./TimelinePanel";
import { MediaLibraryPanel } from "./MediaLibraryPanel";
import { ExportDialog } from "../export/ExportDialog";
import { Download } from "lucide-react";
import type { Timeline } from "@/types/timeline";

export function MainLayout() {
  const mediaLibraryRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // TODO: Replace with actual timeline from timeline store
  // This is a placeholder for testing export functionality
  const mockTimeline: Timeline = {
    tracks: [],
    totalDuration: 0,
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Handle Tab key for custom focus cycling
      if (event.key === "Tab") {
        event.preventDefault();

        const panels = [mediaLibraryRef, previewRef, timelineRef];
        const currentIndex = panels.findIndex(
          (ref) => ref.current === document.activeElement
        );

        let nextIndex: number;
        if (event.shiftKey) {
          // Shift+Tab: cycle backwards
          nextIndex = currentIndex <= 0 ? panels.length - 1 : currentIndex - 1;
        } else {
          // Tab: cycle forwards
          nextIndex = currentIndex === -1 || currentIndex >= panels.length - 1
            ? 0
            : currentIndex + 1;
        }

        panels[nextIndex]?.current?.focus();
      }

      // Handle Enter key to activate focused panel (placeholder for future functionality)
      if (event.key === "Enter") {
        const focusedPanel = document.activeElement;
        if (
          focusedPanel === mediaLibraryRef.current ||
          focusedPanel === previewRef.current ||
          focusedPanel === timelineRef.current
        ) {
          // Placeholder: In future stories, this will trigger panel-specific actions
          // For now, just ensure the panel stays focused (visual feedback via focus ring)
          event.preventDefault();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <>
      <div className="flex h-screen w-screen bg-gray-50 gap-2 p-2">
        <div className="flex flex-col flex-1 gap-2">
          <PreviewPanel ref={previewRef} />
          <TimelinePanel ref={timelineRef} />
        </div>
        <MediaLibraryPanel ref={mediaLibraryRef} />

        {/* Export button - floating in bottom right */}
        <button
          onClick={() => setShowExportDialog(true)}
          className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg transition-colors"
          title="Export Video"
        >
          <Download className="w-5 h-5" />
          <span className="font-medium">Export</span>
        </button>
      </div>

      {/* Export dialog */}
      <ExportDialog
        timeline={mockTimeline}
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
      />
    </>
  );
}
