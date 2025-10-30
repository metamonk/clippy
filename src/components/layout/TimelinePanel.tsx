import { forwardRef, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Timeline } from "@/components/timeline/Timeline";
import { TrackManagementControls } from "@/components/timeline/TrackManagementControls";

export const TimelinePanel = forwardRef<HTMLDivElement>((_props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Measure container dimensions for timeline canvas
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({ width: clientWidth, height: clientHeight });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

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
      aria-label="Timeline Editor"
    >
      {/* Track Management Toolbar */}
      <TrackManagementControls />

      {/* Timeline Canvas */}
      <div ref={containerRef} className="flex-1 w-full min-h-0">
        {dimensions.width > 0 && dimensions.height > 0 && (
          <Timeline width={dimensions.width} height={dimensions.height} />
        )}
      </div>
    </div>
  );
});

TimelinePanel.displayName = "TimelinePanel";
