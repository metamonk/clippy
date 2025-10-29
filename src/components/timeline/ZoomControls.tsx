import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useTimelineStore } from '@/stores/timelineStore';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

/**
 * ZoomControls Component
 *
 * Provides UI controls for zooming in/out on the timeline
 * - Zoom slider (0.1x to 10x)
 * - Zoom in/out buttons
 * - Fit to window button
 * - Zoom level display
 *
 * Story 3.6: Timeline Zoom and Precision Editing
 */
export function ZoomControls() {
  const zoomLevel = useTimelineStore((state) => state.viewConfig.zoomLevel);
  const setZoomLevel = useTimelineStore((state) => state.setZoomLevel);
  const zoomIn = useTimelineStore((state) => state.zoomIn);
  const zoomOut = useTimelineStore((state) => state.zoomOut);
  const tracks = useTimelineStore((state) => state.tracks);

  /**
   * Fit entire timeline to visible window
   * Calculates zoom level required to show all clips
   */
  const handleFitToWindow = () => {
    // Find maximum end time across all tracks
    const maxDuration = tracks.reduce((max, track) => {
      const trackEndTime = track.clips.reduce((trackMax, clip) => {
        const clipEndTime = clip.startTime + (clip.trimOut - clip.trimIn);
        return Math.max(trackMax, clipEndTime);
      }, 0);
      return Math.max(max, trackEndTime);
    }, 0);

    // If no clips, default to 1.0x zoom
    if (maxDuration === 0) {
      setZoomLevel(1.0);
      return;
    }

    // Assume typical timeline container width (will be refined in Timeline component)
    const containerWidth = 1200; // px
    const BASE_PIXELS_PER_SECOND = 100; // From zoomUtils

    // Calculate zoom level to fit timeline
    const requiredPixelsPerSecond = (containerWidth / (maxDuration / 1000));
    const fitZoomLevel = requiredPixelsPerSecond / BASE_PIXELS_PER_SECOND;

    setZoomLevel(fitZoomLevel);
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-200">
      {/* Zoom Out Button */}
      <Button
        onClick={zoomOut}
        variant="ghost"
        size="sm"
        title="Zoom out (Cmd+-)"
        className="h-8 w-8 p-0"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>

      {/* Zoom Slider */}
      <div className="flex items-center gap-2 min-w-[200px]">
        <Slider
          value={[zoomLevel ?? 1.0]}
          onValueChange={([value]) => setZoomLevel(value)}
          min={0.1}
          max={10.0}
          step={0.1}
          className="flex-1"
          aria-label="Timeline zoom level"
        />
      </div>

      {/* Zoom Level Display */}
      <span className="text-sm font-mono text-gray-700 min-w-[60px] text-center">
        {((zoomLevel ?? 1.0) * 100).toFixed(0)}%
      </span>

      {/* Zoom In Button */}
      <Button
        onClick={zoomIn}
        variant="ghost"
        size="sm"
        title="Zoom in (Cmd+=)"
        className="h-8 w-8 p-0"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>

      {/* Fit to Window Button */}
      <Button
        onClick={handleFitToWindow}
        variant="outline"
        size="sm"
        title="Fit timeline to window"
        className="h-8"
      >
        <Maximize2 className="h-4 w-4 mr-1" />
        Fit
      </Button>
    </div>
  );
}
