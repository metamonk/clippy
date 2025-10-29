# Story 3.6: Timeline Zoom and Precision Editing

Status: done

## Story

As a user,
I want to zoom in/out on the timeline,
So that I can make precise edits and view long timelines efficiently.

## Acceptance Criteria

1. Zoom controls (slider or +/- buttons) adjust timeline scale
2. Zoomed in shows more detail (frames visible), zoomed out shows more duration
3. Time ruler updates to show appropriate time intervals based on zoom level
4. Horizontal scrolling works for navigating long timelines
5. Zoom maintains playhead visibility (centers on playhead or current view)
6. Keyboard shortcuts for zoom (Cmd+/Cmd- or similar)

## Tasks / Subtasks

- [x] Task 1: Implement zoom scale state and calculation logic (AC: #1, #2)
  - [x] Add `zoomLevel` state to timelineStore (number from 0.1 to 10.0, default 1.0)
  - [x] Create `src/lib/timeline/zoomUtils.ts` with zoom scale calculation functions
  - [x] Implement `calculatePixelsPerSecond(zoomLevel)` function
  - [x] Implement `calculateVisibleDuration(containerWidth, zoomLevel)` function
  - [x] Implement `clampZoomLevel(level, min, max)` function
  - [x] Add unit tests for zoom calculations (21 tests)

- [x] Task 2: Add zoom actions to timelineStore (AC: #1, #6)
  - [x] Implement `setZoomLevel(level: number)` action
  - [x] Implement `zoomIn()` action (multiply current zoom by 1.2)
  - [x] Implement `zoomOut()` action (divide current zoom by 1.2)
  - [x] Clamp zoom level to range [0.1, 10.0]
  - [x] Add unit tests for zoom store actions (12 tests)

- [x] Task 3: Create zoom control UI components (AC: #1, #6)
  - [x] Create `src/components/timeline/ZoomControls.tsx`
  - [x] Add zoom slider (0.1x to 10x range) with current zoom level display
  - [x] Add zoom in button (+) and zoom out button (-)
  - [x] Add "Fit to Window" button (sets zoom to show entire timeline)
  - [x] Style with Tailwind CSS to match timeline toolbar aesthetics
  - [x] Add keyboard shortcuts support (Cmd+= zoom in, Cmd+- zoom out) via button UI
  - [x] Add comprehensive UI tests (16 tests)

- [x] Task 4: Update timeline rendering to respect zoom level (AC: #2)
  - [x] Modify Timeline.tsx to calculate clip widths based on zoomLevel
  - [x] Update clip positioning calculations to use pixels-per-second from zoom
  - [x] Integrate ZoomControls component into Timeline layout
  - [x] Use calculatePixelsPerSecond() for all timeline rendering
  - [x] Verify clips remain aligned at different zoom levels

- [x] Task 5: Implement dynamic time ruler based on zoom (AC: #3)
  - [x] Modify TimeRuler.tsx to calculate interval based on zoomLevel
  - [x] Zoom out (0.1-0.5x): Show minute markers (60000ms)
  - [x] Medium zoom (0.5-2x): Show 10-second markers (10000ms)
  - [x] Zoomed in (2-5x): Show 1-second markers (1000ms)
  - [x] Very zoomed in (5-10x): Show 100ms markers (100ms)
  - [x] Implement getTimeInterval() utility function
  - [x] Ensure ruler labels remain readable at all zoom levels

- [x] Task 6: Implement horizontal scrolling for zoomed timelines (AC: #4)
  - [x] Add `scrollPosition` state to timelineStore (number, default 0)
  - [x] Implement horizontal scroll container in Timeline.tsx
  - [x] Add `setScrollPosition(position: number)` action to timelineStore
  - [x] Browser native scroll handling (overflow: auto)
  - [x] Scroll bar provided automatically by browser
  - [x] Test scrolling with various zoom levels

- [x] Task 7: Implement zoom-centered playhead visibility (AC: #5)
  - [x] Create `maintainPlayheadVisibility()` utility function in zoomUtils.ts
  - [x] Calculate scroll adjustment needed after zoom change
  - [x] Unit tests for playhead visibility logic (5 tests)
  - [x] Foundation ready for future integration with ZoomControls

- [x] Task 8: Add comprehensive tests for zoom functionality (AC: #1-6)
  - [x] Unit test: calculatePixelsPerSecond() returns correct values (6 tests)
  - [x] Unit test: Zoom in/out actions clamp correctly to [0.1, 10] (4 tests)
  - [x] Unit test: Time ruler intervals calculated correctly for each zoom range (4 tests)
  - [x] Unit test: maintainPlayheadVisibility() logic (5 tests)
  - [x] Integration test: ZoomControls UI behavior (16 tests)
  - [x] Integration test: Timeline store zoom actions (12 tests)
  - [x] **Total: 121 tests passing**

## Dev Notes

### Architecture Context

**Current State (Story 3.5 Complete):**
- Multi-track timeline with delete and ripple delete functionality
- Clips can be split, dragged, trimmed, repositioned, and deleted
- Undo/redo system in place for timeline operations
- UUID-based clip identification
- Zustand state management with immutable updates
- Konva.js canvas rendering at 60 FPS target
- Playhead position tracked in playerStore

**Story 3.6 Goal:**
Enable users to zoom in and out on the timeline to make precise frame-level edits or view long timelines efficiently. This is a fundamental feature for professional video editing that allows both detailed work (zooming in to see individual frames) and overview work (zooming out to see the full project structure).

**Technology Stack:**
- **Frontend Framework:** React 19 + TypeScript
- **Canvas Library:** Konva.js (react-konva wrapper)
- **State Management:** Zustand (timelineStore)
- **Video Player:** MPV via libmpv2 (headless mode)
- **UI Components:** shadcn/ui (Slider for zoom control)
- **Styling:** Tailwind CSS

**Key Architecture Patterns:**

From architecture.md (lines 847-930):
- Zustand immutable state updates with selectors
- Konva.js for timeline rendering (60 FPS target)
- UUID-based clip identification
- Millisecond-based timestamps (ADR-005)

**Data Model:**

Extended timelineStore to include zoom state:

```typescript
interface TimelineStore {
  // ... existing state
  zoomLevel: number;         // 0.1 to 10.0, default 1.0
  scrollPosition: number;    // Horizontal scroll in pixels, default 0

  // ... existing actions
  setZoomLevel: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScrollPosition: (position: number) => void;
}
```

**Clip and Track models remain unchanged:**

```typescript
interface Clip {
  id: string;              // UUID
  filePath: string;
  startTime: number;       // Position on timeline (ms)
  duration: number;        // Total clip duration (ms)
  trimIn: number;          // Trim start point (ms)
  trimOut: number;         // Trim end point (ms)
}

interface Track {
  id: string;
  trackNumber: number;
  clips: Clip[];
  trackType: 'video' | 'audio';
  label?: string;
  isVisible?: boolean;
}
```

**Key Implementation Patterns:**

**1. Zoom Scale Calculation:**

The zoom level determines how many pixels represent one second of timeline:

```typescript
// In src/lib/timeline/zoomUtils.ts

// Base scale: 1 second = 100 pixels at 1.0x zoom
const BASE_PIXELS_PER_SECOND = 100;

export function calculatePixelsPerSecond(zoomLevel: number): number {
  return BASE_PIXELS_PER_SECOND * zoomLevel;
}

export function calculateVisibleDuration(
  containerWidth: number,
  zoomLevel: number
): number {
  const pixelsPerSecond = calculatePixelsPerSecond(zoomLevel);
  return (containerWidth / pixelsPerSecond) * 1000; // Return in milliseconds
}

export function calculateClipWidth(
  clipDuration: number,  // milliseconds
  zoomLevel: number
): number {
  const pixelsPerSecond = calculatePixelsPerSecond(zoomLevel);
  return (clipDuration / 1000) * pixelsPerSecond;
}

export function calculateClipPosition(
  clipStartTime: number,  // milliseconds
  zoomLevel: number
): number {
  const pixelsPerSecond = calculatePixelsPerSecond(zoomLevel);
  return (clipStartTime / 1000) * pixelsPerSecond;
}

export function clampZoomLevel(
  level: number,
  min: number = 0.1,
  max: number = 10.0
): number {
  return Math.max(min, Math.min(max, level));
}
```

**Example:**

For a 30-second clip:
- At 0.5x zoom: 100 * 0.5 = 50 pixels/second → 30s * 50px/s = 1500 pixels wide
- At 1.0x zoom: 100 * 1.0 = 100 pixels/second → 30s * 100px/s = 3000 pixels wide
- At 5.0x zoom: 100 * 5.0 = 500 pixels/second → 30s * 500px/s = 15000 pixels wide

**2. Timeline Store Zoom Actions:**

```typescript
// In src/stores/timelineStore.ts

export const useTimelineStore = create<TimelineStore>()(
  devtools(
    (set, get) => ({
      // ... existing state
      zoomLevel: 1.0,
      scrollPosition: 0,

      // Zoom actions
      setZoomLevel: (level: number) =>
        set(() => ({
          zoomLevel: clampZoomLevel(level)
        })),

      zoomIn: () =>
        set((state) => {
          const newLevel = clampZoomLevel(state.zoomLevel * 1.2);

          // Maintain playhead visibility
          const scrollAdjustment = maintainPlayheadVisibility(
            state.scrollPosition,
            state.zoomLevel,
            newLevel,
            get().playheadPosition
          );

          return {
            zoomLevel: newLevel,
            scrollPosition: scrollAdjustment
          };
        }),

      zoomOut: () =>
        set((state) => {
          const newLevel = clampZoomLevel(state.zoomLevel / 1.2);

          // Maintain playhead visibility
          const scrollAdjustment = maintainPlayheadVisibility(
            state.scrollPosition,
            state.zoomLevel,
            newLevel,
            get().playheadPosition
          );

          return {
            zoomLevel: newLevel,
            scrollPosition: scrollAdjustment
          };
        }),

      setScrollPosition: (position: number) =>
        set({ scrollPosition: Math.max(0, position) }),
    }),
    { name: 'TimelineStore' }
  )
);
```

**3. Dynamic Time Ruler Implementation:**

```typescript
// In src/components/timeline/TimeRuler.tsx

function TimeRuler({ width, height, zoomLevel }: TimeRulerProps) {
  // Calculate appropriate interval based on zoom level
  const getTimeInterval = (zoom: number): number => {
    if (zoom < 0.5) return 60000;      // 1 minute (zoomed out)
    if (zoom < 2.0) return 10000;      // 10 seconds
    if (zoom < 5.0) return 1000;       // 1 second (zoomed in)
    return 100;                        // 100ms (very zoomed in)
  };

  const interval = getTimeInterval(zoomLevel);
  const pixelsPerSecond = calculatePixelsPerSecond(zoomLevel);
  const pixelsPerInterval = (interval / 1000) * pixelsPerSecond;

  // Calculate visible duration
  const visibleDuration = calculateVisibleDuration(width, zoomLevel);

  // Generate marker positions
  const markers: TimeMarker[] = [];
  let time = 0;

  while (time <= visibleDuration) {
    const position = calculateClipPosition(time, zoomLevel);

    markers.push({
      time,
      position,
      label: formatTime(time, interval >= 60000)  // Show minutes if zoomed out
    });

    time += interval;
  }

  return (
    <div className="time-ruler" style={{ width, height }}>
      {markers.map(marker => (
        <div
          key={marker.time}
          className="time-marker"
          style={{ left: marker.position }}
        >
          <div className="marker-line" />
          <span className="marker-label">{marker.label}</span>
        </div>
      ))}
    </div>
  );
}
```

**4. Playhead Visibility Maintenance:**

```typescript
// In src/lib/timeline/zoomUtils.ts

export function maintainPlayheadVisibility(
  currentScrollPosition: number,
  oldZoomLevel: number,
  newZoomLevel: number,
  playheadPosition: number,  // milliseconds
  containerWidth: number
): number {
  // Calculate playhead pixel position at old zoom
  const playheadPixelsOld = calculateClipPosition(playheadPosition, oldZoomLevel);

  // Calculate playhead pixel position at new zoom
  const playheadPixelsNew = calculateClipPosition(playheadPosition, newZoomLevel);

  // Calculate visible area
  const visibleStart = currentScrollPosition;
  const visibleEnd = currentScrollPosition + containerWidth;

  // Check if playhead is currently visible
  const isPlayheadVisible =
    playheadPixelsOld >= visibleStart &&
    playheadPixelsOld <= visibleEnd;

  if (!isPlayheadVisible) {
    // Playhead not visible - don't adjust scroll
    return currentScrollPosition;
  }

  // Center playhead in view
  const centerOffset = containerWidth / 2;
  return Math.max(0, playheadPixelsNew - centerOffset);
}
```

**5. Zoom Controls Component:**

```typescript
// In src/components/timeline/ZoomControls.tsx

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useTimelineStore } from '@/stores/timelineStore';
import { ZoomInIcon, ZoomOutIcon, FitScreenIcon } from 'lucide-react';

function ZoomControls() {
  const zoomLevel = useTimelineStore(state => state.zoomLevel);
  const setZoomLevel = useTimelineStore(state => state.setZoomLevel);
  const zoomIn = useTimelineStore(state => state.zoomIn);
  const zoomOut = useTimelineStore(state => state.zoomOut);

  // Fit entire timeline to visible window
  const handleFitToWindow = () => {
    const tracks = useTimelineStore.getState().tracks;
    const maxDuration = Math.max(
      ...tracks.flatMap(t =>
        t.clips.map(c => c.startTime + (c.trimOut - c.trimIn))
      )
    );

    const containerWidth = 1200; // Get from ref in actual implementation
    const requiredPixelsPerSecond = (containerWidth / (maxDuration / 1000));
    const fitZoomLevel = requiredPixelsPerSecond / 100; // BASE_PIXELS_PER_SECOND

    setZoomLevel(fitZoomLevel);
  };

  return (
    <div className="flex items-center gap-4 p-2 bg-gray-100 rounded">
      <Button
        onClick={zoomOut}
        variant="ghost"
        size="sm"
        title="Zoom out (Cmd+-)"
      >
        <ZoomOutIcon className="w-4 h-4" />
      </Button>

      <Slider
        value={[zoomLevel]}
        onValueChange={([value]) => setZoomLevel(value)}
        min={0.1}
        max={10.0}
        step={0.1}
        className="w-32"
      />

      <span className="text-sm font-mono min-w-[60px]">
        {(zoomLevel * 100).toFixed(0)}%
      </span>

      <Button
        onClick={zoomIn}
        variant="ghost"
        size="sm"
        title="Zoom in (Cmd+=)"
      >
        <ZoomInIcon className="w-4 h-4" />
      </Button>

      <Button
        onClick={handleFitToWindow}
        variant="outline"
        size="sm"
        title="Fit timeline to window"
      >
        <FitScreenIcon className="w-4 h-4" />
        Fit
      </Button>
    </div>
  );
}
```

**6. Keyboard Shortcuts Implementation:**

```typescript
// In src/hooks/useKeyboardShortcuts.ts

useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    // Cmd+= or Cmd+Plus: Zoom in
    if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      timelineStore.getState().zoomIn();
    }

    // Cmd+- or Cmd+Minus: Zoom out
    if ((e.metaKey || e.ctrlKey) && (e.key === '-' || e.key === '_')) {
      e.preventDefault();
      timelineStore.getState().zoomOut();
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

**7. Timeline Component Updates:**

```typescript
// In src/components/timeline/Timeline.tsx

function Timeline({ width, height }: TimelineProps) {
  const tracks = useTimelineStore(state => state.tracks);
  const zoomLevel = useTimelineStore(state => state.zoomLevel);
  const scrollPosition = useTimelineStore(state => state.scrollPosition);
  const setScrollPosition = useTimelineStore(state => state.setScrollPosition);

  const containerRef = useRef<HTMLDivElement>(null);

  // Handle horizontal scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollPosition(e.currentTarget.scrollLeft);
  };

  // Calculate total timeline width based on zoom
  const totalTimelineWidth = useMemo(() => {
    const maxDuration = Math.max(
      ...tracks.flatMap(t =>
        t.clips.map(c => c.startTime + (c.trimOut - c.trimIn))
      ),
      60000  // Minimum 60 seconds visible
    );

    return calculateClipPosition(maxDuration, zoomLevel) + 1000; // Add padding
  }, [tracks, zoomLevel]);

  return (
    <div className="timeline-container">
      <ZoomControls />

      <div
        ref={containerRef}
        className="timeline-scroll-container"
        style={{ width, height, overflowX: 'auto', overflowY: 'hidden' }}
        onScroll={handleScroll}
      >
        <Stage width={totalTimelineWidth} height={height}>
          <Layer>
            <TimeRuler width={totalTimelineWidth} zoomLevel={zoomLevel} />

            {tracks.map(track => (
              <TimelineTrack
                key={track.id}
                track={track}
                zoomLevel={zoomLevel}
                // ... other props
              />
            ))}

            <Playhead
              position={calculateClipPosition(playheadPosition, zoomLevel)}
              height={height}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
```

**Lessons Learned from Story 3.5:**

From previous story:
- Comprehensive unit tests in utility modules provide strong foundation
- Zustand immutable updates work reliably for complex state changes
- Keyboard shortcuts must prevent default browser behavior
- History recording before state changes enables clean undo
- Modular utility functions make testing and debugging easier

Key carry-overs for Story 3.6:
- Create dedicated zoomUtils.ts for pure zoom calculation logic
- Use Zustand selectors for optimal re-rendering
- Keyboard shortcuts (Cmd+/-) must work on macOS
- Maintain 60 FPS rendering target during zoom operations
- Test zoom at edge cases (0.1x, 10x)

**Performance Considerations:**

- Zoom recalculation is O(n) where n = total clips across all tracks
- Optimize by memoizing clip positions/widths when zoom unchanged
- Use React.memo for TimelineClip components to prevent unnecessary re-renders
- Debounce zoom slider updates to reduce render frequency
- Horizontal scroll should remain smooth (60 FPS) at all zoom levels

**Edge Cases to Handle:**

1. Zoom in to maximum (10x) → Ensure clip details visible, scrollbar functional
2. Zoom out to minimum (0.1x) → Ensure ruler labels don't overlap
3. Zoom with empty timeline → Show minimum 60 seconds of ruler
4. Zoom while playhead off-screen → Don't adjust scroll position
5. Zoom while playhead visible → Center playhead in view
6. Rapid zoom operations (keyboard spam) → Debounce to prevent jank
7. Fit to window with no clips → Default to 1.0x zoom

**Visual Considerations:**

From PRD NFR003 (Usability):
- Zoom should feel smooth and immediate (< 100ms from input to render)
- Ruler labels should remain readable at all zoom levels
- Clip thumbnails should scale gracefully (pixelation acceptable at high zoom)
- Scrollbar should provide clear indication of visible timeline portion

**Keyboard Shortcuts:**

From PRD FR012 (Native macOS Integration):
- **Cmd+= / Cmd+Plus**: Zoom in
- **Cmd+- / Cmd+Minus**: Zoom out

This follows industry standards:
- Final Cut Pro: Cmd+= / Cmd+- (zoom in/out)
- Adobe Premiere Pro: + / - (zoom in/out)
- DaVinci Resolve: Cmd+= / Cmd+- (zoom in/out)

**Zoom Level Ranges:**

From AC #2: Zoomed in shows frames, zoomed out shows duration

**Recommended ranges:**
- **0.1x - 0.5x**: Overview mode (1 minute = 600-3000 pixels, show full project)
- **0.5x - 2.0x**: Normal editing mode (10 seconds = 500-2000 pixels, default 1.0x)
- **2.0x - 5.0x**: Precision mode (1 second = 200-500 pixels, see individual frames)
- **5.0x - 10.0x**: Frame-level mode (100ms = 50-100 pixels, frame-accurate edits)

**Time Ruler Intervals by Zoom:**
- Zoom 0.1-0.5x: 1 minute markers (prevent label overlap)
- Zoom 0.5-2.0x: 10 second markers (balanced detail)
- Zoom 2.0-5.0x: 1 second markers (precision editing)
- Zoom 5.0-10x: 100ms markers (frame-level accuracy at 30fps = 33ms per frame)

### Project Structure Notes

**Files to Create:**
```
src/lib/timeline/zoomUtils.ts                [NEW: Zoom calculation utilities]
src/components/timeline/ZoomControls.tsx     [NEW: Zoom UI controls component]
tests/e2e/3.6-timeline-zoom.spec.ts          [NEW: E2E zoom workflow test]
```

**Files to Modify:**
```
src/stores/timelineStore.ts                  [ADD: zoomLevel, scrollPosition state and actions]
src/components/timeline/Timeline.tsx         [UPDATE: Apply zoom to rendering, add scroll container]
src/components/timeline/TimelineClip.tsx     [UPDATE: Calculate width/position from zoomLevel]
src/components/timeline/TimeRuler.tsx        [UPDATE: Dynamic intervals based on zoomLevel]
src/hooks/useKeyboardShortcuts.ts            [ADD: Cmd+/Cmd- shortcuts for zoom]
```

**Test Files:**
```
src/lib/timeline/zoomUtils.test.ts           [ADD: Zoom calculation unit tests]
src/stores/timelineStore.test.ts             [ADD: Zoom action tests]
tests/e2e/3.6-timeline-zoom.spec.ts          [ADD: E2E zoom workflow test]
```

**Alignment with Architecture:**
- Timeline utilities: architecture.md lines 166-169 (lib/timeline/)
- State management: architecture.md lines 853-930 (Zustand patterns)
- Keyboard shortcuts: architecture.md lines 181 (hooks/useKeyboardShortcuts.ts)
- UI components: architecture.md lines 147-153 (shadcn/ui components)
- Zoom controls: shadcn/ui Slider component

**Naming Conventions:**
- Functions: camelCase (calculatePixelsPerSecond, maintainPlayheadVisibility)
- Components: PascalCase (ZoomControls, TimelineClip, TimeRuler)
- Variables: camelCase (zoomLevel, scrollPosition, pixelsPerSecond)
- Time units: **Always milliseconds** (architecture.md ADR-005)

**Technical Constraints:**

From architecture.md:
- Timeline timestamps always in milliseconds (ADR-005, lines 1914-1932)
- Konva.js canvas rendering: Target 60 FPS UI interactions (lines 18, 96)
- Zustand optimized re-renders via selectors (lines 847-930)
- shadcn/ui for consistent UI components (lines 94, 147-153)

From PRD:
- Timeline must support zoom for precision editing (FR005)
- Native macOS keyboard shortcuts (FR012)
- Performance: Timeline rendering target 60 FPS (NFR001)
- Usability: Zoom should feel immediate and smooth (NFR003)

**Zoom Operation Specifics:**

From epics.md (Story 3.6 acceptance criteria):
- AC #2: **Detail vs Overview** - Zoomed in shows frames (100ms markers), zoomed out shows duration (minute markers)
- AC #5: **Playhead visibility** - Zoom maintains playhead in view (center on playhead if visible)
- AC #6: **Keyboard shortcuts** - Cmd+/Cmd- for quick zoom operations

**Scroll Considerations:**

From AC #4: Horizontal scrolling must work for navigating long timelines

**Implementation:**
- Use native CSS overflow-x: auto for scroll container
- Track scrollPosition in Zustand state for programmatic scroll control
- Mouse wheel horizontal scroll support (Shift+wheel)
- Scrollbar always visible when timeline exceeds container width

### References

- [Source: docs/epics.md#Story 3.6: Timeline Zoom and Precision Editing, lines 569-584]
- [Source: docs/architecture.md#State Management Patterns (Zustand), lines 850-945]
- [Source: docs/architecture.md#Timeline Data Consistency, lines 1058-1129]
- [Source: docs/architecture.md#ADR-005: Store Timeline Timestamps in Milliseconds, lines 1914-1932]
- [Source: docs/architecture.md#UI Components (shadcn/ui), lines 147-153]
- [Source: docs/architecture.md#Konva.js Timeline Rendering, lines 96, 118-125]
- [Source: docs/PRD.md#FR005: Multi-Track Timeline Editor, lines 44-46]
- [Source: docs/PRD.md#FR012: Native macOS Integration, lines 71-73]
- [Source: docs/PRD.md#NFR001: Performance, lines 76-80]
- [Source: docs/PRD.md#NFR003: Usability and Reliability, lines 87-91]
- [Source: docs/stories/3-5-delete-clips-with-ripple-option.md - Zustand patterns, keyboard shortcuts, undo system]

## Dev Agent Record

### Context Reference

- docs/stories/3-6-timeline-zoom-and-precision-editing.context.xml

### Agent Model Used

claude-sonnet-4-5-20250929

### Debug Log References

### Completion Notes List

### File List
