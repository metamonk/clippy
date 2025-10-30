# clippy - Epic Breakdown

**Author:** zeno
**Date:** 2025-10-27
**Project Level:** 2 (scoped as Level 3 for feature completeness)
**Target Scale:** 20-30 week timeline for complete feature set

---

## Overview

This document provides the detailed epic breakdown for clippy, expanding on the high-level epic list in the [PRD](./PRD.md).

Each epic includes:

- Expanded goal and value proposition
- Complete story breakdown with user stories
- Acceptance criteria for each story
- Story sequencing and dependencies

**Epic Sequencing Principles:**

- Epic 1 establishes foundational infrastructure and initial functionality
- Subsequent epics build progressively, each delivering significant end-to-end value
- Stories within epics are vertically sliced and sequentially ordered
- No forward dependencies - each story builds only on previous work

---

## Epic 1: Foundation & TRUE MVP

**Expanded Goal:**

Establish a working macOS desktop application using Tauri that demonstrates the core video editing workflow. This epic validates the technical architecture (Tauri + React + FFmpeg), proves native macOS integration works, and delivers a functional (if basic) video editor. Success means a developer can import a video file, trim it on a simple timeline, and export the result as MP4—all in a native macOS application.

**Estimated Stories:** 10

---

**Story 1.1: Tauri Project Setup & Application Foundation**

As a developer,
I want to set up a Tauri project with React frontend and establish basic app structure,
So that I have a working foundation to build clippy features upon.

**Acceptance Criteria:**
1. Tauri 2.x project initialized with React 18+ frontend
2. Application launches as native macOS window with menu bar
3. Basic window chrome follows macOS conventions
4. Project structure organized (src-tauri for Rust backend, src for React frontend)
5. Development environment configured (hot reload works)
6. Can run `cargo tauri dev` and app launches successfully
7. Vitest configured for frontend unit tests with sample test passing
8. cargo test working for Rust backend with sample test passing
9. ESLint and Prettier configured with project standards
10. Logging configured with tracing crate, outputs to ~/Library/Logs/clippy/app.log
11. Git repository initialized with initial commit

**Prerequisites:** None (first story)

---

**Story 1.2: Frontend UI Shell & Layout Structure**

As a user,
I want to see a professional layout when I launch the app,
So that I understand where video preview, timeline, and media library will be.

**Acceptance Criteria:**
1. Main layout divided into three areas: preview (top), timeline (bottom), media library (sidebar)
2. Styled with Tailwind CSS following macOS design aesthetics
3. Responsive layout adjusts to window resizing
4. Empty states show placeholders for each area with helpful text
5. Basic navigation menu in native macOS menu bar
6. All UI controls accessible via keyboard navigation (Tab, Arrow keys, Enter)
7. Application enforces minimum window size of 1280x720 for timeline usability

**Prerequisites:** Story 1.1

---

**Story 1.3: Video File Import with Drag & Drop**

As a user,
I want to import video files by dragging them into the app or using a file picker,
So that I can load videos to edit.

**Acceptance Criteria:**
1. Drag & drop zone in media library area accepts MP4 and MOV files
2. File picker dialog (native macOS) allows selecting video files
3. Imported files are stored in application state
4. File validation rejects unsupported formats with clear error message
5. Tauri command in Rust backend handles file path and metadata extraction

**Prerequisites:** Story 1.2

---

**Story 1.3.5: MPV Integration for Professional Video Playback** ✅ COMPLETED

As a user,
I want to play videos with any codec (H.264, HEVC, ProRes, DNxHD, VP9, AV1),
So that I can edit any video file without conversion or codec errors.

**Acceptance Criteria:**
1. ✅ MPV (libmpv2 5.0.1) integrated as Rust service wrapper in src-tauri/src/services/mpv_player.rs
2. ✅ Tauri commands implemented in src-tauri/src/commands/mpv.rs (play, pause, seek, get_time, stop)
3. ✅ VideoPlayer.tsx refactored to use Tauri invoke() calls instead of HTMLVideoElement API
4. ✅ Maintains frame-accurate seeking (<33ms precision) for timeline integration
5. ✅ Preserves existing playhead synchronization with timeline
6. ✅ Error handling with user-friendly toast notifications for playback failures
7. ✅ All existing VideoPlayer functionality preserved (play/pause, seek, time updates, trim boundaries)
8. ✅ System dependency (brew install mpv) documented in README
9. ✅ Tested with multiple codecs: H.264 (MP4), HEVC yuv420p (MP4), ProRes (MOV), VP9 (WebM)
10. ✅ All existing tests pass with MPV backend

**Implementation Notes (Actual):**
- **libmpv2 v5.0.1** used (upgraded from planned 2.0 to match system MPV 0.40.0)
- **Event-based architecture** implemented using MPV's FileLoaded/EndFile events (not polling)
- **WebM format support** added beyond original scope
- **MVP prototype scope:** Backend playback control fully functional, video frame rendering deferred
- **Known limitation:** HEVC yuvj420p (iOS Screen Recording format) not supported by libmpv
- MPV handles playback only; FFmpeg continues to handle export/processing (separation of concerns)
- Uses libmpv C API via Rust bindings
- Playhead position stored in milliseconds (convert to seconds for MPV API)
- Maintains existing playerStore state management (Zustand)
- Existing trim boundary enforcement logic remains unchanged

**Actual Effort:** 8 hours (coding + testing + documentation)

**Implementation Date:** 2025-10-28

**Prerequisites:** Story 1.3

---

**Story 1.4: Video Preview Player with Basic Controls**

As a user,
I want to preview imported videos with play/pause controls,
So that I can see video content before editing.

**Acceptance Criteria:**
1. MPV-powered video player renders in preview area via Tauri backend integration
2. Video plays when selected from media library (supports all codecs via MPV)
3. Play/pause button controls playback through Tauri commands
4. Video displays at appropriate resolution within preview window
5. Audio plays synchronized with video
6. Current time and duration displayed

**Prerequisites:** Story 1.3.5

---

**Story 1.5: Media Library Panel with Thumbnails**

As a user,
I want to see thumbnails and metadata for all imported clips,
So that I can identify and manage my video files.

**Acceptance Criteria:**
1. Media library displays thumbnail preview for each imported clip
2. Metadata shown: filename, duration, resolution, file size
3. Clicking a clip loads it in the preview player
4. Multiple clips can be imported and displayed in library
5. Delete button removes clip from library

**Prerequisites:** Story 1.4

---

**Story 1.6: Single-Track Timeline Foundation**

As a user,
I want to drag clips from the media library onto a timeline,
So that I can arrange them for editing.

**Acceptance Criteria:**
1. Canvas-based or DOM-based timeline component renders below preview
2. Timeline shows time ruler with markers (seconds)
3. Playhead indicator shows current position
4. Can drag clip from media library onto timeline track
5. Clip appears on timeline with visual representation (thumbnail strip or solid block)
6. Timeline state maintained in frontend

**Prerequisites:** Story 1.5

---

**Story 1.7: Timeline Playback Synchronization**

As a user,
I want the preview player to sync with the timeline playhead position,
So that I can see exactly what's at any point on the timeline.

**Acceptance Criteria:**
1. Dragging playhead updates preview player to that frame
2. Clicking anywhere on timeline moves playhead to that position
3. Play button plays video and advances playhead in sync
4. Pause stops both playback and playhead movement
5. Scrubbing feels responsive (< 100ms latency)

**Prerequisites:** Story 1.6

---

**Story 1.8: Basic Trim Functionality with In/Out Points**

As a user,
I want to set in/out points on a clip to trim unwanted portions,
So that I can remove content from the beginning or end.

**Acceptance Criteria:**
1. Clip on timeline shows trim handles at start and end
2. Dragging trim handles adjusts clip in/out points
3. Visual feedback shows trimmed portion
4. Preview player respects trim points during playback
5. Trim state stored in timeline data model
6. Can reset trim to original clip length

**Prerequisites:** Story 1.7

---

**Story 1.9: FFmpeg Integration & Video Export**

As a user,
I want to export my edited timeline as an MP4 file,
So that I can save and share my edited video.

**Acceptance Criteria:**
1. FFmpeg integrated in Tauri Rust backend (ffmpeg-next or bindings)
2. Export button triggers timeline export
3. Native macOS save dialog allows choosing output location
4. Progress indicator shows export percentage and ETA
5. Export produces valid MP4 file (H.264 codec, AAC audio)
6. Exported video respects trim points from timeline
7. Can cancel export in progress
8. Success notification when export completes

**Prerequisites:** Story 1.8

---

**Story 1.10: Production Build & App Packaging**

As a developer,
I want to build and package clippy as a distributable macOS application,
So that it can run outside of development mode.

**Acceptance Criteria:**
1. `cargo tauri build` produces working .app bundle
2. Application runs when launched from Applications folder
3. App icon configured (can be placeholder)
4. Basic code signing setup (development certificate acceptable)
5. DMG or .app bundle can be distributed to other Macs
6. Build documentation added to README

**Prerequisites:** Story 1.9

---

**Story 1.11: Video Seek and Scrub Controls**

As a user,
I want to scrub through video with a progress bar and seek controls,
So that I can navigate to any point in the video quickly.

**Acceptance Criteria:**
1. Progress bar/slider shows current playback position
2. User can click or drag slider to scrub to any time
3. Scrubbing works during both playback and pause
4. Arrow key shortcuts for seeking (Left: -5s, Right: +5s)
5. Home/End keys jump to start/end
6. Seek accuracy within 33ms (1 frame at 30fps)
7. Restart button or auto-restart when video ends
8. Works with all supported codecs (H.264, HEVC, ProRes, VP9)
9. Tests added and passing

**Prerequisites:** Story 1.4

**Technical Debt Reference:** TD-003

---

**Story 1.12: Fix Video Playback Early Stop**

As a user,
I want videos to play to their true end position,
So that I can see all frames including the final second of content.

**Acceptance Criteria:**
1. Video plays to 100% of duration (e.g., 0:05 / 0:05)
2. Last frame visible before playback stops
3. Time display shows complete duration when stopped
4. Fix works across all codecs (H.264, HEVC, ProRes, VP9)
5. No regression in existing playback behavior
6. Root cause documented in code comments or ADR
7. Tests verify playback reaches true end

**Prerequisites:** Story 1.4

**Technical Debt Reference:** TD-004

---

## Epic 2: Recording Foundation

**Expanded Goal:**

Integrate native macOS APIs (ScreenCaptureKit for screen capture, AVFoundation for webcam) to enable recording directly within clippy. This epic validates the most technically risky aspect of the project: calling native macOS frameworks from Rust, handling real-time video encoding with FFmpeg, and managing system permissions. Success means users can record their screen (full screen mode) and webcam separately, with audio, and have recordings automatically imported into the media library ready for editing.

**Estimated Stories:** 8

---

**Story 2.1: ScreenCaptureKit Setup & Permissions**

As a developer,
I want to integrate ScreenCaptureKit bindings and handle macOS permissions,
So that the app can access screen recording capabilities.

**Acceptance Criteria:**
1. ScreenCaptureKit Rust bindings integrated (existing crate or custom Objective-C bridge via objc crate)
2. App requests screen recording permission from macOS on first use
3. Permission status checked before attempting recording
4. Clear error message if permission denied with instructions to enable in System Preferences
5. Proof-of-concept screen capture works (even if just capturing single frame)
6. Documentation of permission handling approach

**Prerequisites:** Epic 1 complete (Story 1.10)

---

**Story 2.2: Full-Screen Recording with Video Capture**

As a user,
I want to record my entire screen,
So that I can capture demonstrations and tutorials.

**Acceptance Criteria:**
1. "Record Screen" button in UI triggers full-screen capture
2. ScreenCaptureKit captures full screen at 30 FPS
3. Recording indicator shows recording is active (red dot or similar)
4. Stop button ends recording
5. Raw video frames captured and buffered in memory
6. Recording saves to temporary file location
7. Basic error handling if recording fails

**Prerequisites:** Story 2.1

---

**Story 2.3: Real-Time FFmpeg Encoding During Recording**

As a developer,
I want screen recordings to be encoded in real-time to prevent memory bloat,
So that long recordings don't crash the application.

**Acceptance Criteria:**
1. FFmpeg encoding pipeline started when recording begins
2. Captured frames stream to FFmpeg encoder in real-time
3. Output encoded as H.264 MP4 during recording (not post-processing)
4. Memory usage remains stable during 5+ minute recordings
5. Final MP4 file playable immediately after recording stops
6. Frame drops logged if encoding can't keep up (acceptable for now)
7. Audio and video remain synchronized within 50ms for recordings up to 30 minutes
8. Implement timestamp-based frame synchronization to prevent drift
9. If FFmpeg encoding fails completely, stop recording and save partial file with user notification

**Prerequisites:** Story 2.2

---

**Story 2.4: System Audio and Microphone Capture**

As a user,
I want to record system audio and microphone audio alongside screen recording,
So that viewers can hear what I'm doing and my commentary.

**Acceptance Criteria:**
1. CoreAudio integration for microphone capture (via AVFoundation or CoreAudio bindings)
2. System audio capture using ScreenCaptureKit audio APIs
3. Recording UI allows selecting audio sources (system, microphone, both, or none)
4. Audio streams synchronized with video during recording
5. FFmpeg muxes audio and video into single MP4 file
6. Audio quality acceptable (no severe distortion or sync issues)

**Prerequisites:** Story 2.3

---

**Story 2.5: Recording Controls & Status Feedback**

As a user,
I want clear controls and feedback during recording,
So that I know recording is working and can manage it easily.

**Acceptance Criteria:**
1. Recording panel/modal with clear "Start Recording" and "Stop Recording" buttons
2. Recording duration timer shows elapsed time
3. Visual indicator (pulsing red dot) shows recording is active
4. Native macOS notification when recording starts
5. Pause/resume functionality for screen recording
6. Can cancel recording (discards partial recording)
7. Recording controls remain accessible during recording
8. Check available disk space before starting recording
9. Display warning if available space < estimated file size (assume 5MB/min for estimation)
10. Stop recording gracefully if disk space exhausted with partial file save notification

**Prerequisites:** Story 2.4

---

**Story 2.6: Auto-Import Recordings to Media Library**

As a user,
I want completed recordings to automatically appear in my media library,
So that I can immediately edit them without manual import.

**Acceptance Criteria:**
1. When recording stops, file automatically added to media library
2. Thumbnail generated for recorded clip
3. Metadata extracted (duration, resolution, file size)
4. Recording appears in media library within 2 seconds of stopping
5. Recorded file saved to organized location (user Documents/clippy/recordings or similar)
6. Success notification confirms recording saved

**Prerequisites:** Story 2.5

---

**Story 2.7: Basic Webcam Recording Setup**

As a user,
I want to record from my webcam,
So that I can create talking-head videos or commentary.

**Acceptance Criteria:**
1. AVFoundation bindings integrated for camera access
2. App requests camera permission from macOS
3. Camera selection dropdown if multiple cameras available
4. Webcam preview shows in recording panel before recording starts
5. "Record Webcam" button triggers webcam recording
6. Recording captures video at camera's native resolution (or 1080p if higher)

**Prerequisites:** Story 2.6

---

**Story 2.8: Webcam Recording with Audio & Save**

As a user,
I want to record webcam video with microphone audio and save it,
So that I can create standalone webcam recordings.

**Acceptance Criteria:**
1. Webcam recording captures both video and microphone audio
2. FFmpeg encodes webcam stream to MP4 in real-time
3. Recording controls work same as screen recording (start/stop/pause)
4. Completed webcam recording auto-imports to media library
5. Can preview webcam recording in video player
6. Recording quality acceptable (smooth 30 FPS, synchronized audio)

**Prerequisites:** Story 2.7

---

## Epic 3: Multi-Track Timeline & Editing Maturity

**Expanded Goal:**

Evolve the timeline from a simple single-track proof-of-concept into a professional multi-track editor capable of handling complex compositions. This epic enables layering video clips (essential for picture-in-picture workflows later), advanced clip operations (split, arrange, snap), and audio track management with visual waveforms and volume control. Success means users can create sophisticated edits with multiple video/audio tracks, precise clip positioning, and professional audio mixing.

**Estimated Stories:** 10

---

**Story 3.1: Multi-Track Timeline Foundation**

As a user,
I want to work with multiple timeline tracks (at least 2),
So that I can layer video clips and create picture-in-picture effects.

**Acceptance Criteria:**
1. Timeline UI shows minimum 2 tracks (Track 1: main video, Track 2: overlay/PiP)
2. Each track has independent playhead and clip containers
3. Can drag clips onto either track from media library
4. Tracks render in proper layering order (Track 2 overlays Track 1)
5. Preview player composites both tracks correctly
6. Track labels/headers identify each track
7. Future-ready for expanding to 4+ tracks

**Prerequisites:** Epic 2 complete (Story 2.8)

---

**Story 3.2: Multiple Clips Per Track with Sequencing**

As a user,
I want to place multiple clips in sequence on a single track,
So that I can create longer videos from multiple recordings.

**Acceptance Criteria:**
1. Can drag multiple clips onto same track
2. Clips arranged sequentially (end-to-end without gaps by default)
3. Can manually position clips at specific time points
4. Visual gap indicator if clips don't touch
5. Playback transitions smoothly between sequential clips
6. Timeline state tracks all clips with start times and durations

**Prerequisites:** Story 3.1

---

**Story 3.3: Drag Clips Between Tracks**

As a user,
I want to move clips between tracks by dragging,
So that I can reorganize my composition easily.

**Acceptance Criteria:**
1. Can drag clip from one track to another track
2. Visual feedback shows target track while dragging
3. Clip maintains its timeline position when moved between tracks
4. Preview updates to reflect new track arrangement
5. Undo capability for track moves (basic - can be simple state revert)

**Prerequisites:** Story 3.2

---

**Story 3.4: Split Clip at Playhead**

As a user,
I want to split clips at the playhead position,
So that I can cut clips into segments for rearranging or removal.

**Acceptance Criteria:**
1. "Split" button/keyboard shortcut splits clip at current playhead position
2. Single clip becomes two independent clips at split point
3. Both resulting clips fully editable (can trim, move, delete independently)
4. Split is non-destructive (original file unchanged)
5. Preview playback works seamlessly across split point
6. Split only affects clip under playhead

**Prerequisites:** Story 3.3

---

**Story 3.5: Delete Clips with Ripple Option**

As a user,
I want to delete clips from the timeline with option to close gaps automatically,
So that I can remove unwanted segments efficiently.

**Acceptance Criteria:**
1. Select clip and delete (keyboard shortcut or button)
2. "Ripple delete" option automatically closes gap by shifting subsequent clips left
3. "Delete" without ripple leaves gap on timeline
4. Deleted clip removed from timeline (not from media library)
5. Multi-track ripple delete shifts all tracks consistently
6. Visual confirmation before destructive delete

**Prerequisites:** Story 3.4

---

**Story 3.6: Timeline Zoom and Precision Editing**

As a user,
I want to zoom in/out on the timeline,
So that I can make precise edits and view long timelines efficiently.

**Acceptance Criteria:**
1. Zoom controls (slider or +/- buttons) adjust timeline scale
2. Zoomed in shows more detail (frames visible), zoomed out shows more duration
3. Time ruler updates to show appropriate time intervals based on zoom level
4. Horizontal scrolling works for navigating long timelines
5. Zoom maintains playhead visibility (centers on playhead or current view)
6. Keyboard shortcuts for zoom (Cmd+/Cmd- or similar)

**Prerequisites:** Story 3.5

---

**Story 3.7: Snap-to-Grid and Snap-to-Clip Edges**

As a user,
I want clips to snap to grid lines and other clip edges,
So that I can align clips precisely without pixel-perfect manual positioning.

**Acceptance Criteria:**
1. Toggle button enables/disables snapping
2. When enabled, dragging clips snaps to time ruler gridlines
3. Clips snap to edges of adjacent clips (for seamless sequencing)
4. Visual snap indicator (highlight or line) shows when snap occurs
5. Snap threshold configurable or reasonable default (e.g., 100ms)
6. Snapping works on both single track and between tracks

**Prerequisites:** Story 3.6

---

**Story 3.8: Audio Waveform Visualization**

As a user,
I want to see audio waveforms for clips on the timeline,
So that I can identify audio content visually and make precise audio edits.

**Acceptance Criteria:**
1. Timeline clips show audio waveform overlay (not just solid block)
2. Waveform generated from audio track using FFmpeg or Web Audio API
3. Waveform renders at appropriate resolution for zoom level
4. Waveform color/style visually distinct from video thumbnail
5. Waveform updates when clip trimmed or split
6. Performance acceptable (waveform generation doesn't block UI)

**Prerequisites:** Story 3.7

---

**Story 3.9: Per-Clip Volume Control**

As a user,
I want to adjust volume for individual clips,
So that I can balance audio levels across my timeline.

**Acceptance Criteria:**
1. Volume slider for selected clip (0-200%, with 100% as default)
2. Volume adjustment applies during preview playback
3. Volume change persists through export
4. Visual indicator on clip shows volume level (icon or percentage)
5. Mute button for quick silence (0% volume)
6. Volume changes applied via FFmpeg filter during export

**Prerequisites:** Story 3.8

---

**Story 3.10: Audio Fade In/Out**

As a user,
I want to add fade in/out to audio clips,
So that audio transitions sound professional without abrupt starts/stops.

**Acceptance Criteria:**
1. Fade in/out handles on clip audio edges (drag to set fade duration)
2. Visual fade curve shown on waveform
3. Fade duration adjustable (0-5 seconds range)
4. Fade effect audible during preview playback
5. Fade applied during export via FFmpeg audio filters
6. Can set fade in and fade out independently

**Prerequisites:** Story 3.9

---

## Epic 4: Advanced Recording & PiP Composition

**Expanded Goal:**

Transform basic recording capabilities into a professional recording suite that rivals tools like Loom. This epic tackles one of the most technically complex features: simultaneous multi-stream recording with real-time composition. Users can record their screen and webcam simultaneously with configurable picture-in-picture layout, manage multiple independent audio tracks, and have fine control over recording configuration. Success means users can create professional tutorial videos with screen content and talking-head overlay in a single recording session.

**Estimated Stories:** 8

---

**Story 4.1: Window Selection for Screen Recording**

As a user,
I want to record a specific application window instead of the full screen,
So that I can focus recordings on relevant content without showing my entire desktop.

**Acceptance Criteria:**
1. Recording panel shows "Full Screen" vs "Window" recording mode toggle
2. Window mode displays list of open application windows to choose from
3. ScreenCaptureKit SCContentFilter configured to capture selected window only
4. Window recording captures window content at native resolution
5. Recording follows window if it moves (or maintains fixed capture area - document choice)
6. Window selection persists for subsequent recordings in session
7. Clear error if selected window closes during recording

**Prerequisites:** Epic 3 complete (Story 3.10)

---

**Story 4.2: Recording Configuration Panel**

As a user,
I want to configure recording settings before starting,
So that I can customize quality, resolution, and audio sources for my needs.

**Acceptance Criteria:**
1. Recording panel shows expandable configuration section
2. Can select frame rate (30 FPS, 60 FPS)
3. Can select resolution (source, 1080p, 720p)
4. Audio source checkboxes (system audio, microphone, both, none)
5. Settings saved as defaults for future recordings
6. Preview of settings impact (estimated file size per minute)
7. Validation prevents invalid configurations

**Prerequisites:** Story 4.1

---

**Story 4.3: Multi-Audio Track Recording Architecture**

As a developer,
I want to record system audio and microphone as separate audio tracks,
So that users can adjust levels independently during editing.

**Acceptance Criteria:**
1. FFmpeg encoding pipeline supports multiple audio tracks in single MP4
2. System audio recorded to Track 1, microphone to Track 2
3. Both audio tracks synchronized with video
4. Exported MP4 contains both audio tracks as separate streams
5. Timeline editor can display and manipulate both audio tracks independently
6. Audio track architecture future-ready for additional sources (e.g., webcam mic)

**Prerequisites:** Story 4.2

---

**Story 4.4: Webcam Preview in Recording Panel**

As a user,
I want to see a live webcam preview before starting simultaneous recording,
So that I can check framing and camera positioning.

**Acceptance Criteria:**
1. Recording panel shows webcam preview window when "Screen + Webcam" mode selected
2. Preview updates in real-time (< 100ms latency)
3. Can switch between cameras if multiple available
4. Preview shows same resolution/aspect ratio as will be recorded
5. Preview remains visible while configuring PiP settings
6. Preview stops when recording starts (to conserve resources)

**Prerequisites:** Story 4.3

---

**Story 4.5: PiP Position and Size Configuration**

As a user,
I want to configure where the webcam overlay appears and its size,
So that I can position my face without blocking important screen content.

**Acceptance Criteria:**
1. PiP configuration UI shows position presets (top-left, top-right, bottom-left, bottom-right)
2. Can set custom position by dragging preview overlay
3. Size slider adjusts PiP overlay from 10% to 40% of screen width
4. Live preview shows PiP positioning on screen preview
5. Position and size settings saved as defaults
6. Configuration validates PiP stays within screen bounds

**Prerequisites:** Story 4.4

---

**Story 4.6: Simultaneous Screen + Webcam Recording**

As a user,
I want to record screen and webcam simultaneously with picture-in-picture,
So that I can create tutorial videos with my face visible in one recording session.

**Acceptance Criteria:**
1. "Screen + Webcam" recording mode triggers both captures simultaneously
2. ScreenCaptureKit captures screen, AVFoundation captures webcam in parallel
3. Both streams start synchronously (< 100ms variance)
4. FFmpeg composites webcam over screen using overlay filter in real-time
5. PiP position and size from configuration applied correctly
6. Single MP4 output contains composited video
7. Recording performance acceptable (30 FPS, no significant frame drops)

**Prerequisites:** Story 4.5

---

**Story 4.7: Independent Audio Track Management in PiP Recording**

As a user,
I want system audio, microphone, and webcam audio recorded as separate tracks during PiP recording,
So that I can adjust levels independently during editing.

**Acceptance Criteria:**
1. PiP recording captures three independent audio tracks: system, microphone, webcam mic
2. All audio tracks synchronized with composited video
3. FFmpeg muxes all three audio tracks into single MP4
4. Resulting file playable with all audio tracks accessible
5. Timeline editor displays all three audio tracks for recorded PiP clip
6. User can mute/adjust volume on each track independently during editing

**Prerequisites:** Story 4.6

---

**Story 4.8: Advanced Recording Controls (Pause/Resume)**

As a user,
I want to pause and resume recording without creating separate files,
So that I can take breaks during long recordings without losing continuity.

**Acceptance Criteria:**
1. Pause button during active recording freezes capture
2. Timer stops while paused, visual indicator shows "PAUSED" state
3. Resume button continues recording from pause point
4. Paused segments omitted from final recording (no frozen frames)
5. FFmpeg handles discontinuous recording segments seamlessly
6. Can pause/resume multiple times in single recording session
7. Final MP4 plays continuously without gaps or artifacts

**Prerequisites:** Story 4.7

---

**Story 4.9: Timeline Track Management UI**

As a user,
I want UI controls to add and remove timeline tracks,
So that I can manage my multi-track composition without manual configuration.

**Acceptance Criteria:**
1. Track management toolbar appears above timeline canvas
2. Track count display shows current number of tracks
3. "Add Video Track" button creates new video track
4. "Add Audio Track" button creates new audio track
5. "Remove Track" button removes last track (with confirmation dialog)
6. Minimum 2 tracks enforced (cannot delete below 2)
7. Confirmation dialog warns about deleting clips on removed track
8. Track addition/removal immediately reflects in timeline UI
9. All controls accessible via keyboard and mouse
10. Keyboard shortcut: Cmd+T to add track (documented in tooltip)

**Prerequisites:** Story 4.8

---

## Epic 5: Timeline Composition Playback

**Expanded Goal:**

Transform timeline playback from "single-clip preview" to "full composition preview" that seamlessly plays through all clips, handles gaps intelligently, mixes audio from multiple tracks in real-time, and composites multi-track video—delivering a professional editing experience where preview matches export. This epic establishes a critical foundation for professional video editing, enabling users to preview their complete timeline composition before exporting, matching the behavior of industry-standard tools like Premiere Pro, DaVinci Resolve, and Final Cut Pro.

**Why This is Needed:**

Current timeline playback is a "single-clip preview" system—it plays the clip at the playhead position, but cannot automatically transition between clips, handle gaps intelligently, or composite multiple tracks. This creates a disjointed editing experience where users must export to see their final composition, making iterative editing slow and painful. Professional video editors expect continuous playback through the entire timeline with real-time audio mixing and video compositing.

This epic must be completed before Epic 6 (AI Automation) because:
1. **User Experience Foundation:** AI features generate timeline content that users need to preview
2. **Testing AI Output:** Users cannot validate AI-generated captions/edits without composition playback
3. **Product Maturity:** Professional editing UX must exist before adding advanced AI features
4. **Technical Dependency:** AI features may generate complex timelines that require composition rendering

**Success Metrics:**
- ✅ Timeline plays continuously through all clips without manual intervention
- ✅ Gaps render as black frames with silence (no error messages)
- ✅ Multi-track audio mixed in real-time during playback
- ✅ Video tracks composite correctly (opacity, layering)
- ✅ Preview playback matches export output (visual parity)
- ✅ Performance: 60 FPS playback on MacBook Pro (2020+) with 3+ clips
- ✅ Seamless transitions between clips (< 100ms latency)

**Estimated Stories:** 8

**Estimated Duration:** 5-7 weeks

---

**Story 5.1: Composition Playback Architecture & ADR**

As a developer,
I want to define the composition playback architecture,
So that implementation has clear technical direction.

**Acceptance Criteria:**
1. Research document compares 3 approaches:
   - **Approach A:** Real-time MPV switching with audio mixing
   - **Approach B:** FFmpeg pre-render to temp file, play via MPV
   - **Approach C:** Hybrid: pre-render small segments, stream
2. ADR-008 documents chosen approach with pros/cons
3. Architecture diagram shows composition renderer components
4. Performance benchmarks for each approach documented
5. Memory/CPU requirements estimated
6. API interface defined for CompositionRenderer service
7. Timeline → Renderer data flow documented
8. Edge cases documented (gaps, overlapping clips, audio-only tracks)

**Prerequisites:** Epic 4 complete (Story 4.9)

---

**Story 5.2: Composition State Management**

As a developer,
I want composition state separate from clip preview state,
So that I can manage complex timeline playback.

**Acceptance Criteria:**
1. New `compositionStore.ts` created for composition state
2. State tracks: currentCompositionTime, activeClips, activeTracks, renderState
3. `VideoPlayer` checks `mode === 'timeline'` and uses composition state
4. Clip switching logic triggers at clip boundaries
5. Gap detection identifies timeline regions without clips
6. Multi-track clip queries return all clips at given time
7. Unit tests for composition state transitions
8. Performance: state updates < 16ms (60 FPS target)

**Prerequisites:** Story 5.1

---

**Story 5.3: Sequential Clip Playback (Single Track)**

As a user,
I want playback to continue automatically when one clip ends,
So that I can preview multi-clip sequences without manual intervention.

**Acceptance Criteria:**
1. When clip ends, composition renderer finds next clip
2. Next clip loads and starts playing seamlessly
3. Transition latency < 100ms (imperceptible to user)
4. Playhead continues moving through transition
5. CurrentTime updates correctly across clip boundaries
6. Works for 2+ consecutive clips on same track
7. End of timeline stops playback (no error)
8. Keyboard shortcuts (Space, Arrow keys) work during transitions

**Prerequisites:** Story 5.2

**Note:** Single-track only. Multi-track compositing in Story 5.6.

---

**Story 5.4: Gap Handling with Black Frames**

As a user,
I want gaps in my timeline to show black frames instead of errors,
So that my composition plays smoothly even with intentional spacing.

**Acceptance Criteria:**
1. Gap detection identifies timeline regions without clips
2. Black frame rendered in video preview during gaps
3. Silent audio played during gaps (no audio artifacts)
4. Gap duration calculated from timeline structure
5. Playhead continues advancing through gaps
6. Transition from clip → gap → clip is seamless
7. Works for gaps at start, middle, and end of timeline
8. Performance: black frame rendering has zero overhead

**Prerequisites:** Story 5.3

---

**Story 5.5: Multi-Track Audio Mixing**

As a user,
I want to hear audio from all tracks during playback,
So that I can preview voice-over, music, and sound effects together.

**Acceptance Criteria:**
1. Composition renderer identifies all clips at current playhead position
2. Audio streams from overlapping clips mixed in real-time
3. Per-clip volume settings applied during mixing
4. Muted clips excluded from mix
5. Audio synchronization maintained across tracks (< 10ms variance)
6. Supports 2-8 simultaneous audio tracks
7. Mix output sent to single MPV audio stream
8. No audio distortion or clipping with multiple loud tracks
9. Fade-in/fade-out effects applied correctly in mix

**Prerequisites:** Story 5.4

**Technical Challenge:** Real-time audio mixing with MPV. May require external audio library (rodio, cpal) or FFmpeg audio filter.

---

**Story 5.6: Multi-Track Video Compositing**

As a user,
I want video tracks to layer on top of each other,
So that I can create picture-in-picture effects and overlays.

**Acceptance Criteria:**
1. Track z-index determines layer order (Track 1 = bottom, Track N = top)
2. Clips on higher tracks render over lower tracks
3. Opacity/alpha channel support for semi-transparent overlays
4. Black background if no clips at bottom track level
5. Compositing performance: 60 FPS with 3 simultaneous video tracks
6. Works with different video resolutions (scales to canvas)
7. Maintains aspect ratio for each clip
8. Position/scale transforms applied (for PiP effects)

**Prerequisites:** Story 5.5

**Technical Challenge:** Real-time video compositing. May require:
- **Option A:** FFmpeg overlay filter (requires pre-processing)
- **Option B:** GPU-accelerated compositor (OpenGL/Metal)
- **Option C:** Canvas/WebGL rendering in frontend

---

**Story 5.7: Composition Export Parity Validation**

As a developer,
I want automated tests comparing playback to export,
So that users see accurate previews.

**Acceptance Criteria:**
1. Test suite exports timeline composition to MP4
2. Test suite captures playback frames at same timestamps
3. Frame comparison detects visual differences (pixel diff)
4. Audio waveform comparison validates audio mixing
5. Test runs on 3 test timelines: single-track, multi-track, gaps
6. Differences < 5% pixel variance (accounts for compression)
7. Timing accuracy: playback within 33ms of export timestamps
8. Documentation: known parity gaps and reasons

**Prerequisites:** Story 5.6

---

**Story 5.8: Real-Time Performance Optimization**

As a user,
I want smooth playback even with multi-track compositions,
So that I can edit without lag or stuttering.

**Acceptance Criteria:**
1. Frame rate monitoring in dev mode shows FPS during playback
2. Maintain 60 FPS with 3+ video tracks + 4+ audio tracks
3. Decode-ahead buffer for upcoming clips (500ms ahead)
4. Frame dropping strategy for performance degradation (skip, not freeze)
5. Memory usage < 1GB for typical 5-minute timeline
6. CPU usage < 80% on MacBook Pro (2020+)
7. Smooth scrubbing through timeline (< 100ms seek latency)
8. Performance profiling documented in architecture.md

**Prerequisites:** Story 5.7

---

**Story 5.9: Video Transitions (Fade, Crossfade)**

As a user,
I want to add fade and crossfade transitions between clips,
So that my video has professional-looking scene changes.

**Acceptance Criteria:**
1. Transition handles appear at clip boundaries when clips are adjacent
2. Drag transition handle to set crossfade duration (0-3 seconds)
3. Transition types: Fade to Black, Crossfade (dissolve)
4. Visual transition curve shown on timeline
5. Transition effect visible during composition playback
6. Transition applied during export via FFmpeg filters
7. Transition duration adjustable in properties panel
8. Can remove transition (revert to hard cut)

**Prerequisites:** Story 5.8

**Note:** Transitions included per user request during Epic 5 planning.

---

## Epic 6: AI-Powered Workflow Automation

**Expanded Goal:**

Integrate OpenAI's Whisper API for automatic transcription and GPT-4 for content analysis, transforming clippy from a video editor into an AI-powered workflow automation tool. This epic addresses the core pain point from your product brief: manual transcription and captioning that costs 4-8 hours per hour of video. Success means users can generate accurate transcriptions, AI-powered captions with timing, and intelligent content tags—reducing captioning workflow time by 80%+ and delivering genuine utility beyond the learning objectives.

**Estimated Stories:** 10

---

**Story 6.1: OpenAI API Integration & Configuration**

As a developer,
I want to integrate OpenAI API client in the Rust backend,
So that clippy can call Whisper and GPT-4 services securely.

**Acceptance Criteria:**
1. OpenAI API client library integrated (reqwest with OpenAI endpoints)
2. API key configuration stored securely in macOS keychain (not plaintext config)
3. Settings panel allows user to enter/update API key
4. API key validation checks key works before saving
5. Error handling for network failures, invalid keys, rate limits
6. API calls made from Rust backend (not frontend) for security
7. Basic cost estimation logged for API usage
8. API client uses pinned model versions (whisper-1, gpt-4-turbo-preview) with documented upgrade path
9. Graceful degradation if API unavailable (user notified, editing features remain functional)

**Prerequisites:** Epic 5 complete (Story 5.9)

---

**Story 6.2: Audio Extraction from Video Clips**

As a developer,
I want to extract audio from video clips efficiently,
So that audio can be sent to Whisper API for transcription.

**Acceptance Criteria:**
1. FFmpeg extracts audio from selected video clip to temporary file
2. Audio converted to format supported by Whisper (MP3, WAV, or M4A)
3. Audio extraction handles video files without audio gracefully
4. Temporary audio files cleaned up after transcription completes
5. Progress indicator shows extraction status
6. Extraction works for all supported video formats (MP4, MOV, WebM)

**Prerequisites:** Story 6.1

---

**Story 6.3: Whisper API Transcription**

As a user,
I want to automatically transcribe spoken audio from my video,
So that I can create captions without manual typing.

**Acceptance Criteria:**
1. "Generate Transcription" button on selected timeline clip
2. Extracted audio sent to OpenAI Whisper API
3. Transcription result includes text with word-level timestamps
4. Progress indicator shows "Transcribing..." with estimated time
5. Transcription result stored in project state (cached to avoid re-processing)
6. Error handling for API failures with clear user messaging
7. Transcription accuracy acceptable (>90% for clear English audio)

**Prerequisites:** Story 6.2

---

**Story 6.4: Transcript Display and Editing Panel**

As a user,
I want to view and edit the generated transcript,
So that I can correct any AI transcription errors before generating captions.

**Acceptance Criteria:**
1. AI workflow panel shows transcript text with timestamps
2. Transcript scrollable for long videos
3. Can edit transcript text inline (corrections persist)
4. Timestamps displayed alongside text segments
5. Click timestamp seeks video playhead to that position
6. Search functionality within transcript
7. Export transcript as plain text file option

**Prerequisites:** Story 6.3

---

**Story 6.5: Auto-Generate Captions from Transcript**

As a user,
I want to automatically generate timed captions from the transcript,
So that I can add accessibility captions to my video quickly.

**Acceptance Criteria:**
1. "Generate Captions" button creates caption track from transcript
2. Captions segmented intelligently (sentence boundaries, max 2 lines per caption)
3. Caption timing derived from Whisper word timestamps
4. Caption duration follows readability guidelines (max words per second)
5. Caption track stored in timeline state linked to clip
6. Multiple caption tracks supported per project (e.g., different languages)

**Prerequisites:** Story 6.4

---

**Story 6.6: Caption Editor with Timing Adjustments**

As a user,
I want to adjust caption text and timing,
So that I can perfect captions for clarity and synchronization.

**Acceptance Criteria:**
1. Caption editor panel shows all captions in list with timecodes
2. Can edit caption text inline
3. Can adjust start/end times for each caption by typing or dragging
4. Can split caption into two captions
5. Can merge adjacent captions
6. Can delete captions
7. Timeline shows caption markers at corresponding positions
8. Changes sync with video preview in real-time

**Prerequisites:** Story 6.5

---

**Story 6.7: Caption Styling and Preview**

As a user,
I want to customize caption appearance and preview them on video,
So that captions are readable and match my brand aesthetic.

**Acceptance Criteria:**
1. Caption style settings: font, size, color, background color, position (top/bottom/center)
2. Live preview shows styled captions overlaid on video during playback
3. Caption style presets (e.g., "YouTube Standard", "High Contrast")
4. Custom style settings saved as project defaults
5. Caption preview updates immediately when style changed
6. Caption readability validated (contrast ratio check)

**Prerequisites:** Story 6.6

---

**Story 6.8: GPT-4 Content Analysis**

As a user,
I want AI to analyze my video content and suggest descriptions and tags,
So that I can optimize video metadata for discovery without manual effort.

**Acceptance Criteria:**
1. "Analyze Content" button sends transcript to GPT-4 API
2. GPT-4 generates: video description (2-3 sentences), keyword tags (5-10), suggested title
3. Optional: Scene detection and chapter recommendations based on transcript
4. Results displayed in AI panel for review
5. Can accept, edit, or regenerate AI suggestions
6. Analysis results saved to project metadata
7. Cost warning before sending (GPT-4 more expensive than Whisper)

**Prerequisites:** Story 6.7

---

**Story 6.9: Caption Export (SRT/VTT Files)**

As a user,
I want to export captions as separate SRT or VTT files,
So that I can upload them to YouTube, Vimeo, or other platforms.

**Acceptance Criteria:**
1. "Export Captions" option in export menu
2. Format selection: SRT or VTT (WebVTT)
3. Native save dialog for caption file location
4. Exported file follows SRT/VTT specification correctly
5. Caption timing accurate to millisecond precision
6. Exported captions loadable in VLC, YouTube, and other standard players
7. Can export without exporting video (standalone caption file)

**Prerequisites:** Story 6.8

---

**Story 6.10: Burn Captions into Video Export**

As a user,
I want to permanently burn captions into exported video,
So that captions are visible on any platform without separate caption files.

**Acceptance Criteria:**
1. Export dialog includes "Burn Captions" checkbox option
2. When enabled, FFmpeg subtitle filter overlays captions onto video during export
3. Burned captions use configured style settings (font, color, position)
4. Export progress accounts for caption rendering (slightly slower)
5. Resulting video plays with embedded captions visible
6. Can export with both burned captions AND separate caption file
7. Option to preview burned caption appearance before export

**Prerequisites:** Story 6.9

---

## Story Guidelines Reference

**Story Format:**

```
**Story [EPIC.N]: [Story Title]**

As a [user type],
I want [goal/desire],
So that [benefit/value].

**Acceptance Criteria:**
1. [Specific testable criterion]
2. [Another specific criterion]
3. [etc.]

**Prerequisites:** [Dependencies on previous stories, if any]
```

**Story Requirements:**

- **Vertical slices** - Complete, testable functionality delivery
- **Sequential ordering** - Logical progression within epic
- **No forward dependencies** - Only depend on previous work
- **AI-agent sized** - Completable in 2-4 hour focused session
- **Value-focused** - Integrate technical enablers into value-delivering stories

---

**For implementation:** Use the `create-story` workflow to generate individual story implementation plans from this epic breakdown.
