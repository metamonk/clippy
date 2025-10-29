# Epic Technical Specification: Multi-Track Timeline & Editing Maturity

Date: 2025-10-29
Author: zeno
Epic ID: 3
Status: In Progress
Stories: 3.1 (✅ Completed), 3.2 (✅ Completed), 3.3 (Backlog), 3.4 (Backlog), 3.5 (✅ Completed), 3.6 (✅ Completed), 3.7 (✅ Review), 3.8 (✅ Completed), 3.9 (In Review), 3.9.1 (✅ Completed), 3.10 (In Progress)

---

## Overview

Epic 3 transforms clippy from a basic single-track proof-of-concept into a professional multi-track video editor with advanced editing capabilities. This epic builds on the foundation established in Epic 1 (basic timeline) and Epic 2 (recording capabilities) to deliver sophisticated timeline operations including multi-track composition, clip manipulation (split, delete, snap), precision editing tools (zoom, waveforms), and audio control features. The technical focus is on **performance-optimized canvas rendering**, **efficient state management for complex timelines**, and **real-time audio-visual feedback** while maintaining 60 FPS UI responsiveness.

The architecture leverages **Konva.js canvas-based timeline rendering** (architecture.md lines 96, 117-127) with **Zustand immutable state management** (lines 850-945) to handle complex multi-clip, multi-track compositions. Stories 3.1-3.10 progressively enhance the timeline editor from basic multi-track support to professional-grade editing with waveform visualization, per-clip volume control, and audio fade effects—all while maintaining the 60 FPS UI interaction target specified in PRD NFR001.

## Objectives and Scope

**In Scope for Epic 3:**

- ✅ **Multi-Track Foundation** (Story 3.1 - COMPLETED): Minimum 2 tracks (video/overlay), proper layering, independent clip containers, drag-drop from media library
- ✅ **Multiple Clips Per Track** (Story 3.2 - COMPLETED): Sequential arrangement, manual positioning, gap detection, smooth playback transitions
- **Inter-Track Clip Movement** (Story 3.3): Drag clips between tracks with visual feedback, maintain timeline position, undo support
- **Split Clip Operation** (Story 3.4): Non-destructive clip splitting at playhead, independent editing of segments
- ✅ **Delete with Ripple** (Story 3.5 - COMPLETED): Delete clips with optional gap closure, multi-track ripple consistency
- ✅ **Timeline Zoom** (Story 3.6 - COMPLETED): Variable zoom levels, precision editing, keyboard shortcuts, scroll navigation
- ✅ **Snap-to-Grid/Clip** (Story 3.7 - IN REVIEW): Magnetic snapping to grid lines and clip edges, visual indicators, toggle control
- ✅ **Audio Waveforms** (Story 3.8 - COMPLETED): Visual waveform rendering, FFmpeg extraction, zoom-adaptive resolution
- 🔄 **Per-Clip Volume** (Story 3.9 - IN REVIEW): Volume slider (0-200%), mute control, FFmpeg filter export
  - ✅ **Story 3.9.1 - COMPLETED**: Preview playback volume control (addresses deferred AC #2 from Story 3.9)
- 🔄 **Audio Fade In/Out** (Story 3.10 - IN PROGRESS): Fade handles, visual curves, adjustable duration (0-5s)

**Out of Scope (Deferred to Epic 4):**

- Multi-video compositing with overlay filters (Epic 4 PiP composition backend)
- Track expansion beyond 2 tracks (deferred, framework supports 4+)
- Advanced color grading or video effects
- Keyframe animation for position/scale/rotation

**Out of Scope (Not in Project):**

- Audio plugin support (VST/AU)
- MIDI track support
- Multi-camera angle switching
- Motion tracking or stabilization

## System Architecture Alignment

Epic 3 implements the timeline editing architecture defined in `architecture.md` with the following alignments:

**Frontend Architecture (React + Konva.js):**

- `src/components/timeline/Timeline.tsx` - Main timeline canvas stage, Konva.js Stage wrapper, track rendering coordination (Stories 3.1-3.10)
- `src/components/timeline/TimelineTrack.tsx` - Individual track rendering with Konva.js Group, clip container (Story 3.1)
- `src/components/timeline/TimelineClip.tsx` - Interactive clip rendering with drag/trim, Konva.js Rect/Image shapes (Stories 3.2-3.7)
- `src/components/timeline/TimeRuler.tsx` - Time ruler with dynamic grid intervals (Stories 3.6-3.7)
- `src/components/timeline/Playhead.tsx` - Playhead indicator with seek interaction
- `src/components/timeline/WaveformShape.tsx` - Audio waveform rendering on clips (Story 3.8)
- `src/components/timeline/ClipVolumeControl.tsx` - Volume slider UI component (Story 3.9)
- `src/components/timeline/ZoomControls.tsx` - Zoom UI controls (Story 3.6)
- `src/components/timeline/DeleteClipDialog.tsx` - Delete confirmation with ripple option (Story 3.5)

**State Management (Zustand):**

- `src/stores/timelineStore.ts` - Core timeline state with tracks, clips, view config, snap state, zoom state, audio state (Stories 3.1-3.10)
- `src/stores/playerStore.ts` - Playback state synchronized with timeline (Stories 3.1-3.10)
- `src/stores/mediaLibraryStore.ts` - Media file management for timeline drag-drop

**Utility Modules:**

- `src/lib/timeline/clipOperations.ts` - Clip manipulation utilities (sequential positioning, gap detection, split logic) (Stories 3.2, 3.4)
- `src/lib/timeline/snapUtils.ts` - Snap-to-grid and snap-to-clip-edges calculations (Story 3.7)
- `src/lib/timeline/zoomUtils.ts` - Zoom level calculations, pixels-per-second conversion (Story 3.6)
- `src/lib/timeline/timeUtils.ts` - Time conversion utilities (ms ↔ pixels)
- `src/lib/waveform/waveformGenerator.ts` - Audio waveform extraction and rendering (Story 3.8)

**Backend (Rust - Tauri Commands):**

- `src-tauri/src/commands/export.rs` - FFmpeg export with volume/fade filters (Stories 3.9-3.10)
- `src-tauri/src/services/ffmpeg/exporter.rs` - FFmpeg command generation for multi-track export with audio filters

**Dependencies (from package.json):**

- **konva 9.3.22** - Canvas rendering engine for timeline
- **react-konva 19.2.0** - React wrapper for Konva.js
- **zustand 4.x** - State management
- **immer 10.2.0** - Immutable state updates (used by Zustand)
- **video.js 8.16.1** - Preview playback with multi-track compositing
- **vitest 2.x** - Unit testing framework
- **@testing-library/react 16** - Component testing

**Constraints from Architecture:**

- **Timeline timestamps MUST be in milliseconds** (ADR-005, architecture.md lines 1914-1932)
- **Target 60 FPS UI interactions** (PRD NFR001, lines 76-80)
- **Konva.js dirty region detection** for efficient canvas updates (architecture.md lines 1058-1129)
- **Zustand immutable state updates** with selectors to minimize re-renders (lines 850-945)
- **Canvas rendering optimized** - minimize full redraws, batch updates (lines 96, 117-127)

## Detailed Design

### Multi-Track Architecture (Stories 3.1-3.3)

**Track Data Model:**

```typescript
// src/types/timeline.ts

export interface Track {
  id: string;                      // UUID
  type: 'video' | 'audio';
  label: string;                   // "Track 1", "Track 2", etc.
  trackNumber: number;             // 1-based index for layering
  clips: Clip[];
  muted: boolean;                  // Track-level mute
  volume: number;                  // Track-level volume (0-200%)
}

export interface Clip {
  id: string;                      // UUID
  mediaFileId: string;             // Reference to MediaFile
  startTime: number;               // Timeline position (ms)
  duration: number;                // Original file duration (ms)
  trimIn: number;                  // Trim start (ms from file start)
  trimOut: number;                 // Trim end (ms from file start)
  volume: number;                  // Clip-level volume (0-200%)
  muted: boolean;                  // Clip-level mute
  fadeIn: number;                  // Fade in duration (ms)
  fadeOut: number;                 // Fade out duration (ms)
}

export interface Timeline {
  tracks: Track[];
  totalDuration: number;           // Calculated from all clips (ms)
}
```

**Track Layering and Rendering:**

- **Track Order:** Tracks render bottom-to-top, with Track 1 at bottom, Track 2 above, etc.
- **Visual Layering:** Each TimelineTrack component renders in a Konva.js `<Group>` with y-position based on trackNumber
- **Preview Compositing:** Video.js composites tracks using canvas overlay (Story 3.1 AC #5)
- **Future Expansion:** Data model supports 4+ tracks, UI scales vertically (architecture.md lines 166-169)

**Drag-Drop Between Tracks (Story 3.3):**

```typescript
// TimelineClip.tsx - Drag handler
const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
  const stage = e.target.getStage();
  const pointerPos = stage.getPointerPosition();

  // Calculate target track based on Y position
  const targetTrackIndex = Math.floor(
    (pointerPos.y - RULER_HEIGHT) / TRACK_HEIGHT
  );

  // Visual feedback: highlight target track
  setHoveredTrack(tracks[targetTrackIndex]?.id);

  // Snap to grid/clip edges (Story 3.7 integration)
  const newStartTime = applySnap(xToTime(e.target.x()));

  // Update clip position preview
  e.target.x(timeToX(newStartTime));
};

const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
  const targetTrackId = hoveredTrack;

  if (targetTrackId && targetTrackId !== clip.trackId) {
    // Move clip to new track
    moveClipToTrack(clip.id, targetTrackId);
  }

  clearHoveredTrack();
};
```

### Clip Operations (Stories 3.2, 3.4, 3.5)

**Sequential Positioning (Story 3.2):**

```typescript
// src/lib/timeline/clipOperations.ts

/**
 * Calculate next sequential position for clip on track.
 * Positions clip immediately after last clip, or at 0ms if track empty.
 */
export function calculateSequentialPosition(
  track: Track,
  excludeClipId?: string
): number {
  const clips = track.clips.filter(c => c.id !== excludeClipId);

  if (clips.length === 0) return 0;

  // Find rightmost clip
  const lastClip = clips.reduce((latest, clip) => {
    const clipEnd = clip.startTime + (clip.trimOut - clip.trimIn);
    const latestEnd = latest.startTime + (latest.trimOut - latest.trimIn);
    return clipEnd > latestEnd ? clip : latest;
  });

  return lastClip.startTime + (lastClip.trimOut - lastClip.trimIn);
}

/**
 * Detect gaps between clips on a track.
 * Returns array of {start, end, duration} for each gap.
 */
export function detectGaps(track: Track): Gap[] {
  const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime);
  const gaps: Gap[] = [];

  for (let i = 0; i < sortedClips.length - 1; i++) {
    const currentEnd = sortedClips[i].startTime +
      (sortedClips[i].trimOut - sortedClips[i].trimIn);
    const nextStart = sortedClips[i + 1].startTime;

    if (nextStart > currentEnd) {
      gaps.push({
        start: currentEnd,
        end: nextStart,
        duration: nextStart - currentEnd
      });
    }
  }

  return gaps;
}
```

**Split Clip Algorithm (Story 3.4):**

```typescript
// timelineStore.ts - splitClip action

splitClip: (clipId: string, splitTime: number) => {
  set(produce((state: TimelineState) => {
    const clip = state.getClip(clipId);
    if (!clip) return;

    // Validate split time is within clip bounds
    const clipEnd = clip.startTime + (clip.trimOut - clip.trimIn);
    if (splitTime <= clip.startTime || splitTime >= clipEnd) {
      return; // Invalid split position
    }

    // Calculate relative split point within trimmed duration
    const relativePosition = splitTime - clip.startTime;
    const splitPointInFile = clip.trimIn + relativePosition;

    // Create two new clips
    const clip1 = {
      ...clip,
      id: generateId(),
      // Left half: same startTime, trimOut moves to split point
      trimOut: splitPointInFile
    };

    const clip2 = {
      ...clip,
      id: generateId(),
      // Right half: startTime moves to split, trimIn moves to split point
      startTime: splitTime,
      trimIn: splitPointInFile
    };

    // Find track and replace original clip with two new clips
    const track = state.tracks.find(t =>
      t.clips.some(c => c.id === clipId)
    );

    if (track) {
      const index = track.clips.findIndex(c => c.id === clipId);
      track.clips.splice(index, 1, clip1, clip2);
    }

    state.recalculateDuration();
  }));
}
```

**Delete with Ripple (Story 3.5):**

```typescript
// timelineStore.ts - deleteClip action

deleteClip: (clipId: string, ripple: boolean) => {
  set(produce((state: TimelineState) => {
    // Find clip and track
    let deletedClip: Clip | undefined;
    let trackId: string | undefined;

    for (const track of state.tracks) {
      const index = track.clips.findIndex(c => c.id === clipId);
      if (index !== -1) {
        deletedClip = track.clips[index];
        trackId = track.id;
        track.clips.splice(index, 1);
        break;
      }
    }

    if (!deletedClip || !trackId) return;

    if (ripple) {
      // Calculate gap duration
      const clipDuration = deletedClip.trimOut - deletedClip.trimIn;

      // Shift all subsequent clips left on ALL tracks (multi-track consistency)
      for (const track of state.tracks) {
        for (const clip of track.clips) {
          if (clip.startTime > deletedClip.startTime) {
            clip.startTime -= clipDuration;
          }
        }
      }
    }

    state.recalculateDuration();
  }));
}
```

### Timeline Zoom and Precision Editing (Story 3.6)

**Zoom Architecture:**

```typescript
// src/types/timeline.ts

export interface TimelineViewConfig {
  zoomLevel: number;               // 0.1 to 10.0 (1.0 = 100 pixels/second)
  scrollPosition: number;          // Horizontal scroll (pixels)
  rulerHeight: number;             // 40px
  trackHeight: number;             // 100px
}

// src/lib/timeline/zoomUtils.ts

/**
 * Calculate pixels per second based on zoom level.
 * Base: 1.0 zoom = 100px/sec (good default for 60s timeline at 1920px width)
 */
export function calculatePixelsPerSecond(zoomLevel: number): number {
  const BASE_PPS = 100;
  return BASE_PPS * zoomLevel;
}

/**
 * Calculate grid interval (ms) for time ruler based on zoom.
 * Returns nice intervals: 100ms, 250ms, 500ms, 1s, 2s, 5s, 10s, 30s, 1m
 */
export function calculateGridInterval(zoomLevel: number): number {
  const pixelsPerMs = calculatePixelsPerSecond(zoomLevel) / 1000;
  const targetGridSpacingPx = 50; // 50px between grid lines

  const msPerGridLine = targetGridSpacingPx / pixelsPerMs;

  const intervals = [100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000];
  return intervals.find(interval => interval >= msPerGridLine) || 60000;
}

/**
 * Calculate timeline width in pixels for given duration and zoom.
 */
export function calculateTimelineWidth(
  durationMs: number,
  pixelsPerSecond: number
): number {
  return Math.ceil((durationMs / 1000) * pixelsPerSecond);
}
```

**Zoom Controls:**

```typescript
// timelineStore.ts - Zoom actions

zoomIn: () => set(produce((state) => {
  state.viewConfig.zoomLevel = Math.min(10.0, state.viewConfig.zoomLevel * 1.2);
})),

zoomOut: () => set(produce((state) => {
  state.viewConfig.zoomLevel = Math.max(0.1, state.viewConfig.zoomLevel / 1.2);
})),

setZoomLevel: (level: number) => set(produce((state) => {
  state.viewConfig.zoomLevel = Math.max(0.1, Math.min(10.0, level));
}))
```

**Keyboard Shortcuts:**

- `Cmd+Plus` / `Ctrl+Plus`: Zoom in
- `Cmd+Minus` / `Ctrl+Minus`: Zoom out
- `Cmd+0` / `Ctrl+0`: Reset zoom to 1.0

### Snap-to-Grid and Clip Edges (Story 3.7)

**Snap Architecture:**

```typescript
// src/types/timeline.ts

export interface SnapTarget {
  position: number;                // Timeline position (ms)
  type: 'grid' | 'clip-start' | 'clip-end';
  trackId?: string;                // For clip snaps
  clipId?: string;                 // For clip snaps
}

export const TIMELINE_DEFAULTS = {
  SNAP_THRESHOLD_MS: 100,          // 100ms snap threshold
  // ... other defaults
};

// src/lib/timeline/snapUtils.ts

/**
 * Find all snap targets (grid lines + clip edges) on timeline.
 */
export function findSnapTargets(
  timeline: Timeline,
  excludeClipId: string,
  zoomLevel: number
): SnapTarget[] {
  const targets: SnapTarget[] = [];

  // 1. Add clip edge targets (all tracks)
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.id === excludeClipId) continue;

      // Clip start
      targets.push({
        position: clip.startTime,
        type: 'clip-start',
        trackId: track.id,
        clipId: clip.id
      });

      // Clip end (considering trim)
      const clipEnd = clip.startTime + (clip.trimOut - clip.trimIn);
      targets.push({
        position: clipEnd,
        type: 'clip-end',
        trackId: track.id,
        clipId: clip.id
      });
    }
  }

  // 2. Add grid targets based on zoom level
  const gridInterval = calculateGridInterval(zoomLevel);
  const maxTime = timeline.totalDuration || 60000;

  for (let t = 0; t <= maxTime; t += gridInterval) {
    targets.push({ position: t, type: 'grid' });
  }

  return targets;
}

/**
 * Apply snap to target position if within threshold.
 * Returns snapped position and snap indicator for visual feedback.
 */
export function applySnap(
  targetPosition: number,
  snapTargets: SnapTarget[],
  threshold: number,
  snapEnabled: boolean
): { snappedPosition: number; snapIndicator: SnapTarget | null } {
  if (!snapEnabled) {
    return { snappedPosition: targetPosition, snapIndicator: null };
  }

  let closestTarget: SnapTarget | null = null;
  let minDistance = threshold;

  // Prioritize clip edges over grid (higher priority)
  const clipTargets = snapTargets.filter(t => t.type !== 'grid');
  const gridTargets = snapTargets.filter(t => t.type === 'grid');

  // Check clip edges first
  for (const target of clipTargets) {
    const distance = Math.abs(target.position - targetPosition);
    if (distance < minDistance) {
      minDistance = distance;
      closestTarget = target;
    }
  }

  // If no clip snap, check grid
  if (!closestTarget) {
    for (const target of gridTargets) {
      const distance = Math.abs(target.position - targetPosition);
      if (distance < minDistance) {
        minDistance = distance;
        closestTarget = target;
      }
    }
  }

  if (closestTarget) {
    return {
      snappedPosition: closestTarget.position,
      snapIndicator: closestTarget
    };
  }

  return { snappedPosition: targetPosition, snapIndicator: null };
}
```

**Visual Snap Indicator:**

```typescript
// Timeline.tsx - Render snap indicator line

{snapIndicator && (
  <Line
    points={[
      (snapIndicator.position / 1000) * pixelsPerSecond,
      0,
      (snapIndicator.position / 1000) * pixelsPerSecond,
      timelineHeight
    ]}
    stroke={
      snapIndicator.type === 'grid'
        ? '#3b82f6'  // Blue for grid snap
        : '#10b981'  // Green for clip edge snap
    }
    strokeWidth={2}
    dash={snapIndicator.type === 'grid' ? [8, 4] : undefined}
    listening={false}
  />
)}
```

### Audio Waveform Visualization (Story 3.8)

**Waveform Generation Strategy:**

```typescript
// src/lib/waveform/waveformGenerator.ts

export interface WaveformData {
  samples: number[];               // Normalized [-1, 1] amplitude samples
  sampleRate: number;              // Samples per second
  duration: number;                // Audio duration (ms)
}

/**
 * Extract waveform data from audio file using FFmpeg.
 * Downsamples to target resolution for efficient rendering.
 */
export async function extractWaveform(
  filePath: string,
  targetSamplesPerSecond: number = 100
): Promise<WaveformData> {
  // Call Rust backend via Tauri command
  return invoke('extract_waveform', {
    filePath,
    sampleRate: targetSamplesPerSecond
  });
}
```

**Backend FFmpeg Command (Rust):**

```rust
// src-tauri/src/commands/media.rs

#[tauri::command]
pub async fn extract_waveform(
    file_path: String,
    sample_rate: u32,
) -> Result<WaveformData, String> {
    // FFmpeg command to extract audio samples
    let output = Command::new("ffmpeg")
        .args(&[
            "-i", &file_path,
            "-af", &format!("aresample={}", sample_rate),  // Downsample
            "-f", "f32le",                                  // 32-bit float samples
            "-ac", "1",                                     // Mono
            "-"                                             // Output to stdout
        ])
        .output()
        .map_err(|e| format!("FFmpeg failed: {}", e))?;

    // Parse float samples, normalize to [-1, 1]
    let samples = parse_float_samples(&output.stdout)?;

    Ok(WaveformData {
        samples,
        sample_rate,
        duration: calculate_duration(&file_path)?
    })
}
```

**Waveform Rendering on Timeline:**

```typescript
// src/components/timeline/WaveformShape.tsx

export const WaveformShape: React.FC<{
  waveformData: WaveformData;
  clipWidth: number;
  clipHeight: number;
  clipStartTime: number;
  trimIn: number;
  trimOut: number;
}> = ({ waveformData, clipWidth, clipHeight, clipStartTime, trimIn, trimOut }) => {
  // Subsample waveform data for visible clip region
  const visibleSamples = getVisibleSamples(
    waveformData,
    trimIn,
    trimOut,
    clipWidth  // Subsample to clip pixel width for performance
  );

  // Generate Konva Line points for waveform shape
  const points = useMemo(() => {
    const points: number[] = [];
    const midY = clipHeight / 2;
    const amp = clipHeight * 0.4;  // 40% of clip height for waveform amplitude

    visibleSamples.forEach((sample, i) => {
      const x = (i / visibleSamples.length) * clipWidth;
      const y = midY - (sample * amp);

      points.push(x, y);
    });

    return points;
  }, [visibleSamples, clipWidth, clipHeight]);

  return (
    <Line
      points={points}
      stroke="#22c55e"
      strokeWidth={1}
      listening={false}
      opacity={0.7}
    />
  );
};
```

**Performance Optimization:**

- **Lazy Loading:** Waveforms generated on-demand when clip added to timeline
- **Caching:** Waveform data cached in mediaLibraryStore by fileId
- **Zoom-Adaptive Resolution:** Higher zoom = more samples rendered, lower zoom = fewer samples
- **Web Worker:** Waveform extraction runs in background to avoid blocking UI

### Per-Clip Volume Control (Story 3.9)

**Volume State:**

```typescript
// Clip interface includes volume and mute
export interface Clip {
  // ... other properties
  volume: number;      // 0-200%, default 100%
  muted: boolean;      // Quick mute toggle
}

// timelineStore.ts - Volume actions

setClipVolume: (clipId: string, volume: number) => {
  set(produce((state) => {
    const clip = state.getClip(clipId);
    if (clip) {
      clip.volume = Math.max(0, Math.min(200, volume));
    }
  }));
},

toggleClipMute: (clipId: string) => {
  set(produce((state) => {
    const clip = state.getClip(clipId);
    if (clip) {
      clip.muted = !clip.muted;
    }
  }));
}
```

**Volume Control UI:**

```typescript
// src/components/timeline/ClipVolumeControl.tsx

export const ClipVolumeControl: React.FC<{ clipId: string }> = ({ clipId }) => {
  const clip = useTimelineStore(state => state.getClip(clipId));
  const setVolume = useTimelineStore(state => state.setClipVolume);
  const toggleMute = useTimelineStore(state => state.toggleClipMute);

  if (!clip) return null;

  return (
    <div className="volume-control">
      <label>Volume: {clip.volume}%</label>
      <Slider
        value={[clip.volume]}
        onValueChange={([v]) => setVolume(clipId, v)}
        min={0}
        max={200}
        step={1}
        disabled={clip.muted}
      />

      <button onClick={() => toggleMute(clipId)}>
        {clip.muted ? <VolumeX /> : <Volume2 />}
      </button>
    </div>
  );
};
```

**FFmpeg Export with Volume Filter:**

```rust
// src-tauri/src/services/ffmpeg/exporter.rs

fn build_audio_filter_complex(clips: &[Clip]) -> String {
    let mut filters = Vec::new();

    for (i, clip) in clips.iter().enumerate() {
        if clip.muted {
            filters.push(format!("[{}:a]volume=0[a{}]", i, i));
        } else {
            let volume_multiplier = clip.volume / 100.0;
            filters.push(format!("[{}:a]volume={}[a{}]", i, volume_multiplier, i));
        }
    }

    // Mix all audio streams
    let audio_inputs = (0..clips.len())
        .map(|i| format!("[a{}]", i))
        .collect::<Vec<_>>()
        .join("");

    filters.push(format!("{}amix=inputs={}[aout]", audio_inputs, clips.len()));

    filters.join(";")
}
```

### Audio Fade In/Out (Story 3.10)

**Fade State:**

```typescript
export interface Clip {
  // ... other properties
  fadeIn: number;      // Fade in duration (ms), 0-5000
  fadeOut: number;     // Fade out duration (ms), 0-5000
}

// timelineStore.ts - Fade actions

setClipFadeIn: (clipId: string, duration: number) => {
  set(produce((state) => {
    const clip = state.getClip(clipId);
    if (clip) {
      clip.fadeIn = Math.max(0, Math.min(5000, duration));
    }
  }));
},

setClipFadeOut: (clipId: string, duration: number) => {
  set(produce((state) => {
    const clip = state.getClip(clipId);
    if (clip) {
      clip.fadeOut = Math.max(0, Math.min(5000, duration));
    }
  }));
}
```

**Visual Fade Curve Rendering:**

```typescript
// TimelineClip.tsx - Render fade overlay

const renderFadeOverlay = () => {
  if (clip.fadeIn === 0 && clip.fadeOut === 0) return null;

  const points: number[] = [];

  // Fade in curve (left edge)
  if (clip.fadeIn > 0) {
    const fadeInWidth = (clip.fadeIn / 1000) * pixelsPerSecond;
    points.push(0, clipHeight, fadeInWidth, 0);
  }

  // Fade out curve (right edge)
  if (clip.fadeOut > 0) {
    const fadeOutWidth = (clip.fadeOut / 1000) * pixelsPerSecond;
    const fadeOutStart = clipWidth - fadeOutWidth;
    points.push(fadeOutStart, 0, clipWidth, clipHeight);
  }

  return (
    <Shape
      sceneFunc={(ctx, shape) => {
        // Draw gradient overlay for fade visualization
        const gradient = ctx.createLinearGradient(0, 0, clipWidth, 0);

        if (clip.fadeIn > 0) {
          const fadeInRatio = (clip.fadeIn / (clip.trimOut - clip.trimIn));
          gradient.addColorStop(0, 'rgba(0,0,0,0.5)');
          gradient.addColorStop(fadeInRatio, 'rgba(0,0,0,0)');
        }

        if (clip.fadeOut > 0) {
          const fadeOutRatio = 1 - (clip.fadeOut / (clip.trimOut - clip.trimIn));
          gradient.addColorStop(fadeOutRatio, 'rgba(0,0,0,0)');
          gradient.addColorStop(1, 'rgba(0,0,0,0.5)');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, clipWidth, clipHeight);
        ctx.fillStrokeShape(shape);
      }}
      listening={false}
    />
  );
};
```

**FFmpeg Fade Filter:**

```rust
// src-tauri/src/services/ffmpeg/exporter.rs

fn build_audio_filter_with_fades(clip: &Clip) -> String {
    let mut filter = String::new();

    // Apply volume first
    let volume = if clip.muted { 0.0 } else { clip.volume / 100.0 };
    filter.push_str(&format!("volume={}", volume));

    // Apply fade in
    if clip.fade_in > 0 {
        let fade_in_sec = clip.fade_in as f64 / 1000.0;
        filter.push_str(&format!(",afade=t=in:st={}:d={}",
            clip.start_time as f64 / 1000.0,
            fade_in_sec
        ));
    }

    // Apply fade out
    if clip.fade_out > 0 {
        let fade_out_sec = clip.fade_out as f64 / 1000.0;
        let clip_end = (clip.start_time + (clip.trim_out - clip.trim_in)) as f64 / 1000.0;
        let fade_start = clip_end - fade_out_sec;

        filter.push_str(&format!(",afade=t=out:st={}:d={}",
            fade_start,
            fade_out_sec
        ));
    }

    filter
}
```

## Data Models and Type Definitions

**Complete Timeline State (Zustand):**

```typescript
// src/stores/timelineStore.ts

export interface TimelineState extends Timeline {
  // Core timeline data
  tracks: Track[];
  totalDuration: number;

  // View configuration
  viewConfig: TimelineViewConfig;

  // Selection and UI state
  selectedClipId: string | null;
  hoveredTrackState: { trackId: string; canDrop: boolean } | null;

  // History for undo/redo
  history: Pick<TimelineState, 'tracks'>[];
  historyIndex: number;

  // Snap state (Story 3.7)
  snapEnabled: boolean;
  snapThreshold: number;
  snapIndicator: SnapTarget | null;

  // Actions: Clip management
  addClip: (trackId: string, clip: Omit<Clip, 'id'>) => void;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<Omit<Clip, 'id'>>) => void;
  moveClip: (clipId: string, newStartTime: number) => boolean;
  moveClipToTrack: (clipId: string, targetTrackId: string) => boolean;

  // Actions: Clip operations
  splitClip: (clipId: string, splitTime: number) => boolean;
  deleteClip: (clipId: string, ripple: boolean) => boolean;
  resetTrim: (clipId: string) => void;

  // Actions: Track management
  addTrack: (trackType: 'video' | 'audio') => void;
  removeTrack: (trackId: string) => void;

  // Actions: View control
  setZoomLevel: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScrollPosition: (position: number) => void;

  // Actions: Snap control
  toggleSnap: () => void;
  setSnapThreshold: (threshold: number) => void;
  setSnapIndicator: (indicator: SnapTarget | null) => void;

  // Actions: Audio control
  setClipVolume: (clipId: string, volume: number) => void;
  toggleClipMute: (clipId: string) => void;
  setClipFadeIn: (clipId: string, duration: number) => void;
  setClipFadeOut: (clipId: string, duration: number) => void;

  // Actions: History
  undo: () => void;
  recordHistory: () => void;

  // Utilities
  getClip: (clipId: string) => Clip | undefined;
  getClipsForTrack: (trackId: string) => Clip[];
  getTrack: (trackId: string) => Track | undefined;
  recalculateDuration: () => void;
  clearTimeline: () => void;
}
```

## Performance Optimization Strategy

**Rendering Performance (60 FPS Target):**

1. **Konva.js Optimizations:**
   - Use `listening={false}` on non-interactive shapes (waveforms, fade overlays)
   - Batch shape updates with single `batchDraw()` call
   - Use `hitGraphEnabled={false}` on decorative layers
   - Cache complex shapes with `cache()` method

2. **React Optimizations:**
   - Zustand selectors to minimize re-renders: `useTimelineStore(state => state.tracks[0])`
   - `useMemo` for expensive calculations (waveform points, snap targets)
   - `useCallback` for event handlers passed to Konva components
   - `React.memo` on TimelineClip, TimelineTrack for component-level caching

3. **State Management:**
   - Immer for immutable updates (automatic structural sharing)
   - Debounce frequent updates (drag position, scroll)
   - Batch state changes in single `set()` call

4. **Waveform Optimization:**
   - Lazy loading: Generate on first render
   - Caching: Store in mediaLibraryStore by fileId
   - Downsampling: Match sample density to zoom level
   - Web Worker: Extract waveforms in background thread

**Memory Management:**

- **Clip Thumbnails:** Use canvas thumbnail generation, cache as base64 data URLs
- **Waveform Data:** Store as typed arrays (Float32Array) instead of number[]
- **History Stack:** Limit to 10 states (configurable)
- **Cleanup:** Remove waveform data when media file removed from library

## Testing Strategy

**Unit Tests (Vitest):**

- `clipOperations.test.ts` - Sequential positioning, gap detection, split logic (60 tests) ✅
- `snapUtils.test.ts` - Snap calculations, grid intervals, clip edge detection (25 tests) ✅
- `zoomUtils.test.ts` - Zoom calculations, grid intervals, timeline width (21 tests) ✅
- `timeUtils.test.ts` - Time/pixel conversions (20 tests) ✅
- `timelineStore.test.ts` - State management, actions, history (84 tests) ✅

**Component Tests (@testing-library/react):**

- `Timeline.test.tsx` - Track rendering, click-to-seek, snap indicator (15 tests) ✅
- `TimelineClip.test.tsx` - Drag/trim/split interactions (20 tests) ✅
- `TimelineTrack.test.tsx` - Multi-clip rendering, drop zones (12 tests)
- `WaveformShape.test.tsx` - Waveform rendering, zoom adaptation (8 tests)
- `ClipVolumeControl.test.tsx` - Volume slider, mute toggle (6 tests)
- `ZoomControls.test.tsx` - Zoom buttons, keyboard shortcuts (8 tests) ✅

**Integration Tests (E2E - Playwright):**

- `3.1-multi-track-timeline.spec.ts` - Drag clips to multiple tracks, verify layering
- `3.4-split-clip.spec.ts` - Split clip, edit segments independently
- `3.5-delete-clips.spec.ts` - Delete with/without ripple, verify gap closure
- `3.7-snap-to-grid.spec.ts` - Enable snap, verify visual indicator, test clip alignment

**Test Coverage Target:** 80%+ for utility modules, 70%+ for components

## Constraints and Technical Decisions

**ADR-005: Timeline Timestamps in Milliseconds** (architecture.md lines 1914-1932)

- **Decision:** All timeline timestamps, durations, and time-based calculations MUST use milliseconds
- **Rationale:** Millisecond precision sufficient for 60fps video (16ms per frame), avoids floating-point errors
- **Impact:** All Clip properties (startTime, duration, trimIn, trimOut, fadeIn, fadeOut) use number (ms)

**ADR-006: Canvas-Based Timeline with Konva.js**

- **Decision:** Use Konva.js for timeline rendering instead of DOM-based approach
- **Rationale:** 60 FPS performance requirement, hundreds of clips, smooth drag interactions, GPU acceleration
- **Trade-offs:** More complex than DOM, requires manual hit testing, accessibility requires extra work
- **Impact:** All timeline components use react-konva wrappers

**ADR-007: Zustand for Timeline State**

- **Decision:** Use Zustand with Immer for timeline state management
- **Rationale:** Optimized re-renders via selectors, devtools support, simpler than Redux
- **Impact:** Single timelineStore, immutable updates with Immer produce()

**ADR-008: Multi-Track Compositing Strategy**

- **Decision:** Frontend canvas layering for preview (Story 3.1), FFmpeg overlay filter for export (Epic 4)
- **Rationale:** Real-time preview requires canvas, final export quality requires FFmpeg
- **Limitation:** Preview composition may differ slightly from export (color accuracy, blending modes)

**ADR-009: Snap Priority - Clip Edges > Grid**

- **Decision:** Clip edge snapping has higher priority than grid snapping
- **Rationale:** Seamless sequencing (clip end → next clip start) more important than grid alignment
- **Impact:** applySnap() checks clip targets before grid targets

**ADR-010: Waveform Lazy Loading**

- **Decision:** Generate waveforms on-demand when clip added to timeline, not during import
- **Rationale:** Import speed more critical, many imported files may never reach timeline
- **Impact:** First clip placement may have slight delay (1-2s for 5min video)

## Risk Assessment and Mitigation

**R3.1: Canvas Rendering Performance Degradation**

- **Risk:** Timeline with 50+ clips on 4 tracks may drop below 60 FPS
- **Likelihood:** Medium (depends on zoom level, waveform complexity)
- **Mitigation:**
  - Konva.js layer caching for static elements
  - Viewport clipping (only render visible clips)
  - Waveform LOD (level of detail) based on zoom
  - Performance monitoring in dev mode
- **Testing:** Benchmark with 100 clips across 4 tracks at various zoom levels

**R3.2: Waveform Extraction Blocking UI**

- **Risk:** FFmpeg waveform extraction blocks main thread, causing UI freeze
- **Likelihood:** High (long videos, multiple clips)
- **Mitigation:**
  - Run FFmpeg in Tauri async command (Tokio runtime)
  - Show loading spinner on clip during waveform generation
  - Cache waveform data to avoid repeated extraction
  - Limit concurrent waveform extractions to 2
- **Status:** Partially mitigated (Tauri async), needs testing with 10min+ videos

**R3.3: Snap Calculation Overhead During Drag**

- **Risk:** Real-time snap calculations (every frame) cause drag stutter
- **Likelihood:** Low (tested with 50 clips, minimal overhead)
- **Mitigation:**
  - Cache snap targets, regenerate only on clip add/remove/zoom
  - Spatial indexing for large timelines (R-tree if >200 clips)
  - Throttle snap calculations to 60fps max
- **Status:** Current implementation passes 60 FPS benchmark with 50 clips

**R3.4: Multi-Track Audio Mixing Complexity**

- **Risk:** FFmpeg filter_complex syntax errors for multi-track export with volume/fade
- **Likelihood:** Medium (complex filter chains)
- **Mitigation:**
  - Comprehensive Rust unit tests for filter string generation
  - FFmpeg validation step before export (dry-run)
  - Fallback to simple mix if filter_complex fails
  - Clear error messages to user with export log
- **Status:** Requires extensive testing in Stories 3.9-3.10

**R3.5: Undo/Redo Memory Growth**

- **Risk:** History stack grows unbounded, causing memory issues
- **Likelihood:** Low (limited to 10 states)
- **Mitigation:**
  - Fixed-size circular buffer for history (max 10 states)
  - Store only tracks[] in history (not full state)
  - Use Immer structural sharing to minimize duplication
- **Status:** Implemented, tested

## Future Enhancements (Epic 4+)

**Deferred to Epic 4:**

- Track expansion beyond 2 tracks (supports 4-8 video/audio tracks)
- Multi-audio track recording with independent control
- Real-time FFmpeg overlay filter for preview (match export quality)
- Keyframe animation for clip position/scale/rotation
- Video effects and transitions (fade, crossfade, wipe)

**Not Currently Planned:**

- GPU-accelerated video effects (Metal/CUDA)
- Audio plugin support (VST/AU)
- Advanced color grading
- Multi-camera sync and angle switching
- Motion tracking or object stabilization

## Post-Review Follow-ups

*This section captures action items from story reviews that require follow-up work within the epic scope.*

### Story 3.9.1: Preview Playback Volume Control (Review: 2025-10-29)

**Review Outcome:** Approve with Minor Observations

**Critical Follow-ups (Medium Severity):**

1. **[AC#3 Tech Debt] Implement volume crossfade between clips**
   - **Issue**: AC#3 deferred - abrupt volume transitions between clips
   - **Solution**: Add 100ms linear fade interpolation logic
   - **Impact**: Improves audio UX, satisfies deferred acceptance criterion
   - **Effort**: ~4-6 hours (actual: ~3 hours)
   - **Reference**: Story 3.9.1 Review AI#1
   - **Status**: ✅ **RESOLVED 2025-10-29** - Implemented with edge case handling (VideoPlayer.tsx:37-213, 440-483) + 11 unit tests

2. **[Error Handling] Add try/catch for async applyClipVolume in playback loop**
   - **Issue**: Volume update failures could block requestAnimationFrame loop
   - **Solution**: Wrap VideoPlayer.tsx:332 `await applyClipVolume()` in try/catch
   - **Impact**: Prevents potential playback stuttering on MPV errors
   - **Effort**: ~30 minutes
   - **Reference**: Story 3.9.1 Review AI#2
   - **Status**: ✅ **RESOLVED 2025-10-29** - Added try/catch wrapper with error logging (VideoPlayer.tsx:332-339)

**Low Priority Enhancements:**
- ✅ **Extract SEEK_THRESHOLD_SECONDS constant** - RESOLVED 2025-10-29 (VideoPlayer.tsx:42, 286)
- ✅ **Document gap handling behavior** - RESOLVED 2025-10-29 (Added comprehensive JSDoc to findActiveClipAtPosition)
- Add integration test for clip transition volume (1 hour) - Open
- Replace console.log with structured logger (deferred to Epic 6)
- Consider volume pre-loading optimization (deferred to post-MVP)

**Test Coverage:** 8/11 test cases (73%) - Deferred tests relate to manual audio verification which is difficult to automate

---

### Story 3.10: Audio Fade In/Out (Review #2: 2025-10-29)

**Review Outcome:** Approve ✅

**Review Summary:**
- 4 of 5 critical action items from Review #1 resolved
- Test coverage improved from <40% to 75%+ (19 component tests + 35+ validation tests)
- All code quality issues fixed (TimelineClip test failures, unused variables, validation logic)
- 5 of 6 ACs satisfied (83%) - AC #4 (preview playback) deferred with approval

**Critical Follow-ups (High Severity):**

1. **[AC#4 Deferred] Create Story 3.10.1: Preview Playback Audio Fades**
   - **Issue**: AC#4 not satisfied - fade effects not audible during preview playback (MPV audio disabled)
   - **Solution**: Create follow-up story to enable MPV audio output and apply afade filters during playback
   - **Impact**: Completes Story 3.10 acceptance criteria, provides real-time editing feedback
   - **Effort**: 8-12 hours (requires MPV reconfiguration + audio output plumbing)
   - **Files**: src-tauri/src/services/mpv_player.rs, src/stores/playerStore.ts
   - **Reference**: Story 3.10 Review #2 AI#1
   - **Status**: Open - Added to backlog and story tasks

2. **[Documentation] Document AC #4 limitation in release notes**
   - **Issue**: Users need to understand that fade preview requires video export in v0.1.0
   - **Solution**: Add to Epic 3 retrospective and user-facing documentation
   - **Impact**: Manages user expectations, provides transparency
   - **Effort**: 30 minutes
   - **Reference**: Story 3.10 Review #2 AI#2
   - **Status**: Open - Added to backlog and story tasks

**Medium Priority (Recommended):**

3. **[Tech Debt] Address compilation errors from other stories before Epic 3 completion**
   - **Issue**: Rust/TypeScript compilation errors exist (not from Story 3.10, but block builds)
   - **Root Cause**: Story 4.6 (missing app_handle), Stories 3.9/3.6 (test errors)
   - **Solution**: Fix before merging Epic 3 to main
   - **Impact**: Unblocks CI/CD pipelines, enables successful builds
   - **Effort**: 2-3 hours (estimate)
   - **Files**: screencapturekit.rs, orchestrator.rs, ClipVolumeControl.tsx/test.tsx, ZoomControls.tsx/test.tsx
   - **Reference**: Story 3.10 Review #2 (Code Quality Assessment)
   - **Status**: Open - Not blocking Story 3.10 approval

**Test Coverage:**
- Component Tests: 19 comprehensive fade tests (TimelineClip.test.tsx)
- Validation Tests: 35+ edge case tests (clipOperations.test.ts)
- Overall: ~75% for fade-specific code (exceeds Epic 3 target of 70%+)

---

**Document Control:**

- **Last Updated:** 2025-10-29
- **Version:** 1.0
- **Next Review:** After Story 3.10 completion
- **Related Documents:** architecture.md, PRD.md, epics.md
