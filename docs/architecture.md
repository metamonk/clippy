# clippy - Decision Architecture

**Author:** Winston (Architect Agent)
**Date:** 2025-10-27
**Project:** clippy - macOS Video Editor with AI-Powered Workflow Automation
**Project Level:** 2 (Greenfield)
**Document Version:** 1.0

---

## Executive Summary

This architecture defines the technical foundation for clippy, a macOS-native video editor built with Tauri that integrates native ScreenCaptureKit/AVFoundation APIs, FFmpeg-based media processing, and OpenAI-powered transcription/captioning. The architecture prioritizes **performance and pragmatism** over learning complexity, using battle-tested libraries (ffmpeg-sidecar, nokhwa, screencapturekit) to deliver the features specified in the PRD efficiently.

**Key Architectural Approach:**
- **Tauri 2.x + React 18** for native macOS desktop with web technologies
- **FFmpeg CLI via ffmpeg-sidecar** for media processing (real-time encoding, export, composition)
- **Konva.js canvas-based timeline** for 60 FPS interactive editing
- **Zustand state management** for performant multi-track timeline state
- **Novel multi-stream recording pattern** with real-time PiP composition

---

## Project Initialization

**First Implementation Story (Story 1.1):**

```bash
# Initialize Tauri project with React + TypeScript
npm create tauri-app@latest clippy
# Interactive prompts:
#   - Frontend: React
#   - Language: TypeScript
#   - Package manager: npm (or pnpm/yarn)

cd clippy

# Add Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Add ESLint and Prettier
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install -D prettier eslint-config-prettier

# Add shadcn/ui (component library)
npx shadcn-ui@latest init
# Follow prompts for Tailwind integration

# Add core frontend dependencies
npm install zustand konva react-konva
npm install @tauri-apps/api @tauri-apps/plugin-fs @tauri-apps/plugin-dialog
npm install @tauri-apps/plugin-notification @tauri-apps/plugin-shell @tauri-apps/plugin-os

# Add Rust dependencies (add to src-tauri/Cargo.toml)
# [dependencies]
# tauri = { version = "2", features = ["..." ] }
# serde = { version = "1", features = ["derive"] }
# serde_json = "1"
# tokio = { version = "1", features = ["full"] }
# anyhow = "1"
# thiserror = "1"
# tracing = "0.1"
# tracing-subscriber = "0.3"
# chrono = { version = "0.4", features = ["serde"] }
# uuid = { version = "1", features = ["v4", "serde"] }
# libmpv2 = "5.0"  # MPV video player bindings (upgraded to match system MPV 0.40.0)
# async-openai = "0.28"
# ffmpeg-sidecar = "2.1"
# screencapturekit = "0.3"
# nokhwa = { version = "0.10", features = ["input-avfoundation"] }
```

This establishes the base architecture with:
- ✅ Tauri 2.x framework
- ✅ React 18 + TypeScript + Vite
- ✅ Tailwind CSS for styling
- ✅ ESLint + Prettier for code quality
- ✅ shadcn/ui component library
- ✅ Core frontend and backend dependencies

---

## Decision Summary

| Category | Decision | Version | Affects Epics | Rationale |
| -------- | -------- | ------- | ------------- | --------- |
| **Framework** | Tauri 2.x | Latest (2025) | All | Official framework for Rust + web desktop apps |
| **Frontend Framework** | React 18 | 18.x | All | Component-based UI, strong TypeScript support |
| **Build Tool** | Vite | Latest | All | Fast HMR, optimized for Tauri |
| **Language (Frontend)** | TypeScript | 5.x | All | Type safety, better IDE support |
| **Language (Backend)** | Rust | 1.80+ | All | Performance, safety, Tauri native |
| **Styling** | Tailwind CSS | 3.x | All | Utility-first CSS, rapid UI development |
| **UI Components** | shadcn/ui | Latest | All | Accessible Radix components + Tailwind |
| **Timeline Canvas** | Konva.js | Latest | Epic 1, 3 | Better performance than Fabric.js (60 FPS target) |
| **State Management** | Zustand | 4.x | Epic 1, 3, 4, 5 | Optimized re-renders, simple API |
| **Video Player** | MPV (libmpv2) | 5.0.1 (system MPV 0.40.0) | Epic 1 | Universal codec support (H.264, HEVC, VP9, ProRes), event-based architecture, frame-accurate seeking |
| **FFmpeg Integration** | ffmpeg-sidecar | 2.1.0 | Epic 1, 2, 4, 5 | Auto-download binary, proven performance |
| **ScreenCaptureKit** | screencapturekit crate | 0.3.x | Epic 2, 4 | Safe Rust wrapper for macOS screen capture |
| **Camera Capture** | nokhwa | 0.10.9 (feature: input-avfoundation) | Epic 2, 4 | Cross-platform webcam with AVFoundation backend |
| **OpenAI Client** | async-openai | 0.28.x | Epic 5 | Type-safe Rust bindings, Whisper + GPT-4 support |
| **Waveform Visualization** | Web Audio API | Browser native | Epic 3 | Zero dependencies, canvas integration |
| **Error Handling (Rust)** | anyhow + thiserror | Latest | All | Context-rich errors + custom types |
| **Logging (Rust)** | tracing | 0.1.x | All | Structured logging, file output |
| **Date/Time (Rust)** | chrono | 0.4.x | All | UTC storage, timezone support |
| **Async Runtime (Rust)** | Tokio | 1.x (full features) | All | Multi-threaded async for recording/export |
| **Project File Format** | JSON | N/A | All | Human-readable, version-control friendly |
| **Testing (Frontend)** | Vitest + React Testing Library | Latest | All | Fast, Vite-native testing |
| **Testing (Backend)** | cargo test | Built-in | All | Rust standard testing |
| **Tauri Plugins** | fs, dialog, notification, shell, os | Official | All | Native file/dialog/notification support |

---

## Complete Project Structure

```
clippy/
├── src/                                    # React frontend
│   ├── components/
│   │   ├── timeline/                       # Epic 1, 3
│   │   │   ├── Timeline.tsx               # Main timeline canvas (Konva)
│   │   │   ├── TimelineTrack.tsx          # Individual track component
│   │   │   ├── TimelineClip.tsx           # Clip visualization
│   │   │   ├── Playhead.tsx               # Playhead indicator
│   │   │   └── TimeRuler.tsx              # Time markers
│   │   ├── player/                         # Epic 1
│   │   │   ├── VideoPlayer.tsx            # MPV integration via Tauri commands
│   │   │   └── PlayerControls.tsx         # Play/pause/scrub controls
│   │   ├── media-library/                  # Epic 1
│   │   │   ├── MediaLibrary.tsx           # Library panel
│   │   │   ├── MediaItem.tsx              # Thumbnail + metadata display
│   │   │   └── MediaImport.tsx            # Drag-drop import zone
│   │   ├── recording/                      # Epic 2, 4
│   │   │   ├── RecordingPanel.tsx         # Recording modal/panel
│   │   │   ├── RecordingControls.tsx      # Start/stop/pause buttons
│   │   │   ├── SourceSelector.tsx         # Screen/window/camera selection
│   │   │   ├── PiPConfigurator.tsx        # PiP position/size config
│   │   │   └── RecordingPreview.tsx       # Webcam preview
│   │   ├── ai/                             # Epic 5
│   │   │   ├── TranscriptPanel.tsx        # Transcript display/editing
│   │   │   ├── CaptionEditor.tsx          # Caption timing/text editor
│   │   │   ├── CaptionStyler.tsx          # Caption style configuration
│   │   │   └── ContentAnalysis.tsx        # AI-generated tags/descriptions
│   │   ├── export/                         # Epic 1, 5
│   │   │   ├── ExportDialog.tsx           # Export settings modal
│   │   │   └── ExportProgress.tsx         # Progress bar with ETA
│   │   └── ui/                             # shadcn/ui components
│   │       ├── button.tsx
│   │       ├── dialog.tsx
│   │       ├── toast.tsx
│   │       ├── slider.tsx
│   │       └── ...                         # Other shadcn components
│   ├── stores/                             # Zustand state management
│   │   ├── timelineStore.ts               # Timeline state (clips, tracks)
│   │   ├── mediaLibraryStore.ts           # Imported media files
│   │   ├── playerStore.ts                 # Playback state
│   │   ├── recordingStore.ts              # Recording state
│   │   └── projectStore.ts                # Project file state
│   ├── lib/
│   │   ├── tauri/                          # Tauri command wrappers
│   │   │   ├── recording.ts               # invoke('cmd_start_recording', ...)
│   │   │   ├── export.ts                  # invoke('cmd_start_export', ...)
│   │   │   ├── ai.ts                      # invoke('cmd_transcribe', ...)
│   │   │   └── media.ts                   # invoke('cmd_import_media', ...)
│   │   ├── timeline/                       # Timeline utilities
│   │   │   ├── timeUtils.ts               # Time format conversions
│   │   │   ├── clipOperations.ts          # Trim/split logic
│   │   │   └── trackOperations.ts         # Track manipulation
│   │   ├── waveform/                       # Web Audio API
│   │   │   └── waveformGenerator.ts       # Extract waveform data from audio
│   │   └── utils.ts                        # General utilities
│   ├── types/
│   │   ├── timeline.ts                     # Clip, Track, Timeline interfaces
│   │   ├── media.ts                        # MediaFile interface
│   │   ├── recording.ts                    # RecordingConfig interface
│   │   ├── ai.ts                           # Transcript, Caption interfaces
│   │   └── tauri.ts                        # TauriResponse<T> interface
│   ├── hooks/
│   │   ├── useTimeline.ts                  # Timeline operations hook
│   │   ├── usePlayer.ts                    # Player control hook
│   │   └── useKeyboardShortcuts.ts         # macOS keyboard shortcuts
│   ├── App.tsx                             # Main application layout (3-panel)
│   ├── main.tsx                            # React entry point
│   └── index.css                           # Tailwind imports + global styles
│
├── src-tauri/                              # Rust backend
│   ├── src/
│   │   ├── commands/                       # Tauri commands (by epic)
│   │   │   ├── media.rs                   # Epic 1 - import, metadata extraction
│   │   │   ├── mpv.rs                     # Epic 1 - MPV video player control
│   │   │   ├── recording.rs               # Epic 2, 4 - screen/camera capture
│   │   │   ├── export.rs                  # Epic 1, 5 - FFmpeg export
│   │   │   ├── ai.rs                      # Epic 5 - OpenAI integration
│   │   │   ├── project.rs                 # Project save/load (JSON)
│   │   │   └── mod.rs                     # Export all command modules
│   │   ├── services/                       # Business logic layer
│   │   │   ├── mpv_player.rs              # Epic 1 - MPV player wrapper
│   │   │   ├── screen_capture/            # Epic 2, 4
│   │   │   │   ├── mod.rs
│   │   │   │   ├── screencapturekit.rs    # ScreenCaptureKit wrapper
│   │   │   │   └── frame_handler.rs       # Frame buffering and sync
│   │   │   ├── camera/                     # Epic 2, 4
│   │   │   │   ├── mod.rs
│   │   │   │   └── nokhwa_wrapper.rs      # Camera capture abstraction
│   │   │   ├── recording/                  # Epic 2, 4
│   │   │   │   ├── mod.rs
│   │   │   │   ├── orchestrator.rs        # Multi-stream coordination
│   │   │   │   └── frame_synchronizer.rs  # Timestamp-based frame sync
│   │   │   ├── ffmpeg/                     # Epic 1, 2, 4, 5
│   │   │   │   ├── mod.rs
│   │   │   │   ├── compositor.rs          # PiP composition
│   │   │   │   ├── encoder.rs             # Real-time encoding
│   │   │   │   ├── exporter.rs            # Timeline export
│   │   │   │   └── audio_extractor.rs     # Audio extraction for Whisper
│   │   │   ├── openai/                     # Epic 5
│   │   │   │   ├── mod.rs
│   │   │   │   ├── whisper.rs             # Transcription service
│   │   │   │   └── gpt.rs                 # Content analysis
│   │   │   └── permissions/                # Epic 1, 2
│   │   │       └── macos.rs               # macOS permission checks
│   │   ├── models/                         # Shared data structures
│   │   │   ├── timeline.rs                # Clip, Track, Timeline structs
│   │   │   ├── media.rs                   # MediaFile struct
│   │   │   ├── recording.rs               # RecordingConfig struct
│   │   │   └── project.rs                 # Project file format
│   │   ├── utils/
│   │   │   ├── paths.rs                   # Path handling utilities
│   │   │   └── time.rs                    # Time conversion utilities
│   │   ├── error.rs                        # Custom error types (thiserror)
│   │   ├── lib.rs                          # Tauri app setup, command registration
│   │   └── main.rs                         # Application entry point
│   ├── Cargo.toml                          # Rust dependencies
│   ├── tauri.conf.json                     # Tauri configuration
│   └── build.rs                            # Build script (if needed)
│
├── public/                                 # Static assets
├── docs/                                   # Project documentation
│   ├── PRD.md                             # Product Requirements
│   ├── epics.md                           # Epic breakdown
│   ├── architecture.md                    # This document
│   └── stories/                           # Story implementation docs
├── package.json                            # Frontend dependencies
├── tsconfig.json                           # TypeScript configuration
├── tailwind.config.js                      # Tailwind configuration
├── vite.config.ts                          # Vite configuration
├── vitest.config.ts                        # Vitest testing configuration
└── README.md                               # Project README
```

---

## Epic to Architecture Mapping

| Epic | Frontend Modules | Backend Modules | Key Integration Points |
|------|------------------|-----------------|------------------------|
| **Epic 1: Foundation & MVP** | `components/timeline/`, `components/player/`, `components/media-library/`, `components/export/`, `stores/timelineStore`, `stores/mediaLibraryStore`, `lib/timeline/` | `commands/media.rs`, `commands/export.rs`, `services/ffmpeg/exporter.rs`, `models/timeline.rs`, `models/media.rs` | - Tauri commands for file import<br>- FFmpeg export pipeline<br>- Timeline state synchronization |
| **Epic 2: Recording Foundation** | `components/recording/`, `stores/recordingStore`, `lib/tauri/recording.ts` | `commands/recording.rs`, `services/screen_capture/`, `services/ffmpeg/encoder.rs`, `services/permissions/macos.rs` | - ScreenCaptureKit frame capture<br>- Real-time FFmpeg encoding<br>- macOS permission handling |
| **Epic 3: Multi-Track Timeline** | `components/timeline/` (all components), `stores/timelineStore` (expanded), `lib/timeline/`, `lib/waveform/` | `models/timeline.rs` (multi-track support) | - Konva.js canvas rendering<br>- Web Audio API waveform generation<br>- Zustand state updates |
| **Epic 4: Advanced Recording & PiP** | `components/recording/PiPConfigurator`, `components/recording/SourceSelector`, `components/recording/RecordingPreview` | `services/screen_capture/`, `services/camera/`, `services/recording/orchestrator.rs`, `services/recording/frame_synchronizer.rs`, `services/ffmpeg/compositor.rs` | - Multi-stream recording orchestration<br>- Frame synchronization<br>- FFmpeg PiP overlay filter |
| **Epic 5: AI-Powered Automation** | `components/ai/`, `lib/tauri/ai.ts`, `types/ai.ts`, `stores/captionStore` | `commands/ai.rs`, `services/openai/whisper.rs`, `services/openai/gpt.rs`, `services/ffmpeg/audio_extractor.rs` | - OpenAI Whisper API for transcription<br>- GPT-4 for content analysis<br>- Caption SRT/VTT export |

---

## Technology Stack Details

### Core Technologies

**Frontend Stack:**
- **React 18.x** - Component-based UI framework with concurrent features
- **TypeScript 5.x** - Type safety, better IDE support, reduced runtime errors
- **Vite** - Fast development server with HMR, optimized production builds
- **Tailwind CSS 3.x** - Utility-first CSS framework for rapid styling
- **shadcn/ui** - Accessible component library built on Radix UI + Tailwind

**Backend Stack:**
- **Rust 1.80+** - Systems programming language for Tauri backend
- **Tauri 2.x** - Native desktop framework combining Rust + web technologies
- **Tokio 1.x** - Async runtime for parallel screen/camera capture

**Media Processing:**
- **ffmpeg-sidecar 2.1.0** - Rust wrapper for FFmpeg CLI with auto-download
- **FFmpeg** - Downloaded at runtime (<100MB), used for:
  - Real-time encoding during screen recording
  - Multi-track timeline export
  - PiP composition (overlay filter)
  - Audio extraction for Whisper API
  - Caption burning (subtitles filter)

**Native macOS APIs:**
- **screencapturekit 0.3.x** - Rust bindings for ScreenCaptureKit (screen capture)
- **nokhwa 0.10.9** (feature: input-avfoundation) - Camera capture via AVFoundation

**Frontend Libraries:**
- **Konva.js** - Canvas-based timeline rendering (60 FPS target)
- **react-konva** - React wrapper for Konva.js
- **Zustand 4.x** - Lightweight state management with optimized re-renders
- **Web Audio API** - Browser-native waveform visualization

**Backend Libraries:**
- **libmpv2 5.0.1** - Video playback engine with universal codec support (H.264, HEVC, ProRes, VP9, AV1), frame-accurate seeking, event-based architecture
- **async-openai 0.28.x** - OpenAI API client (Whisper, GPT-4)
- **serde + serde_json** - JSON serialization for project files and Tauri commands
- **anyhow** - Flexible error handling with context
- **thiserror** - Custom error type definitions
- **tracing + tracing-subscriber** - Structured logging to file
- **chrono 0.4.x** - Date/time handling (UTC storage, local display)
- **uuid 1.x** - UUID generation for clip/track IDs

### Integration Points

**Tauri IPC:**
- Frontend invokes backend via `@tauri-apps/api/core::invoke()`
- All commands return `Result<T, String>` (user-friendly errors)
- Async commands for long-running operations (recording, export, AI)

**FFmpeg Integration:**
- Shell out via `ffmpeg-sidecar` for CLI-based processing
- Frame streaming via stdin pipes for real-time encoding
- Progress monitoring via stderr parsing

**OpenAI Integration:**
- Async HTTP requests via `async-openai` crate
- API key stored in macOS Keychain (not config file)
- Audio extraction → Whisper API → Transcript with word timestamps
- Transcript → GPT-4 → Content analysis (tags, description)

**File System:**
- Tauri `fs` plugin for file operations
- Native macOS file/save dialogs via `dialog` plugin
- Project files saved as JSON (human-readable)

---

## Novel Pattern Designs

### Pattern 1: Simultaneous Multi-Stream Recording with Real-Time PiP Composition

**Purpose:** Capture screen and webcam simultaneously with configurable picture-in-picture overlay while recording 3 independent audio tracks (system audio, microphone, webcam mic).

**Components:**

```
┌─────────────────────────────────────────────────────────────┐
│                    RecordingOrchestrator                     │
│  (coordinates all streams, handles synchronization)          │
└──────────┬────────────────────────┬─────────────────────────┘
           │                        │
           v                        v
  ┌────────────────┐      ┌──────────────────┐
  │ ScreenCapture  │      │ CameraCapture    │
  │ (SCK wrapper)  │      │ (nokhwa wrapper) │
  └────────┬───────┘      └────────┬─────────┘
           │                       │
           v                       v
  ┌────────────────────────────────────────┐
  │      FrameSynchronizer                 │
  │  (aligns timestamps, buffers frames)   │
  └────────────────┬───────────────────────┘
                   │
                   v
  ┌────────────────────────────────────────┐
  │    FFmpegCompositor                    │
  │  (pipes frames → ffmpeg overlay filter)│
  │  - Screen video stream (main)          │
  │  - Webcam video stream (overlay)       │
  │  - System audio track                  │
  │  - Microphone audio track              │
  │  - Webcam mic audio track              │
  └────────────────┬───────────────────────┘
                   │
                   v
           ┌──────────────┐
           │  output.mp4  │
           │ (3 audio trks)│
           └──────────────┘
```

**Data Flow:**

1. **Initialization** (`commands/recording.rs::cmd_start_pip_recording`)
   - Initialize ScreenCaptureKit for screen capture
   - Initialize nokhwa camera for webcam
   - Spawn FFmpeg process with overlay filter
   - Create RecordingOrchestrator to coordinate streams

2. **Parallel Frame Capture** (`services/recording/orchestrator.rs`)
   - Spawn Tokio task for screen capture loop
   - Spawn Tokio task for camera capture loop
   - Use `mpsc::channel(30)` for bounded frame buffers (backpressure)
   - Each loop captures frames → sends to channel with timestamp

3. **Frame Synchronization** (`services/recording/frame_synchronizer.rs`)
   - Buffer frames from both streams in `VecDeque`
   - Use `tokio::select!` to receive from both channels
   - Match frames by timestamp (within 16ms tolerance for 60fps)
   - Send synchronized frame pair to FFmpeg

4. **FFmpeg Composition** (`services/ffmpeg/compositor.rs`)
   - Two stdin pipes: pipe:0 (screen), pipe:1 (webcam)
   - FFmpeg overlay filter: `[0:v][1:v]overlay=x={pip_x}:y={pip_y}`
   - Map 3 audio inputs to separate tracks in output MP4
   - Encode in real-time to disk

**Implementation Guide:**

**File: `services/recording/orchestrator.rs`**
```rust
use tokio::sync::mpsc;
use anyhow::Result;

const FRAME_BUFFER_SIZE: usize = 30; // 1 second @ 30fps

pub struct RecordingOrchestrator {
    screen_capture: ScreenCapture,
    camera: Camera,
    ffmpeg: FFmpegCompositor,
}

impl RecordingOrchestrator {
    pub async fn start(&mut self) -> Result<()> {
        let (screen_tx, screen_rx) = mpsc::channel(FRAME_BUFFER_SIZE);
        let (camera_tx, camera_rx) = mpsc::channel(FRAME_BUFFER_SIZE);

        // Spawn screen capture thread
        let screen_capture = self.screen_capture.clone();
        tokio::spawn(async move {
            loop {
                let frame = screen_capture.capture_frame()?;
                let timestamp = get_timestamp_ms();
                screen_tx.send((timestamp, frame)).await?;
            }
        });

        // Spawn camera capture thread
        let camera = self.camera.clone();
        tokio::spawn(async move {
            loop {
                let frame = camera.capture_frame()?;
                let timestamp = get_timestamp_ms();
                camera_tx.send((timestamp, frame)).await?;
            }
        });

        // Synchronize and send to FFmpeg
        self.synchronize_and_composite(screen_rx, camera_rx).await
    }
}
```

**File: `services/recording/frame_synchronizer.rs`**
```rust
async fn synchronize_and_composite(
    &mut self,
    mut screen_rx: Receiver<(u64, Frame)>,
    mut camera_rx: Receiver<(u64, Frame)>
) -> Result<()> {
    let mut screen_buffer = VecDeque::new();
    let mut camera_buffer = VecDeque::new();

    const SYNC_TOLERANCE_MS: u64 = 16; // ~60fps

    loop {
        tokio::select! {
            Some(screen_frame) = screen_rx.recv() => {
                screen_buffer.push_back(screen_frame);
            }
            Some(camera_frame) = camera_rx.recv() => {
                camera_buffer.push_back(camera_frame);
            }
        }

        // Match frames by timestamp
        if let (Some(screen), Some(camera)) =
            (screen_buffer.front(), camera_buffer.front())
        {
            let time_diff = (screen.0 as i64 - camera.0 as i64).abs() as u64;

            if time_diff < SYNC_TOLERANCE_MS {
                // Timestamps aligned - send to FFmpeg
                self.ffmpeg.write_screen_frame(&screen.1)?;
                self.ffmpeg.write_overlay_frame(&camera.1)?;

                screen_buffer.pop_front();
                camera_buffer.pop_front();
            } else if screen.0 < camera.0 {
                // Screen frame too old, discard
                screen_buffer.pop_front();
            } else {
                // Camera frame too old, discard
                camera_buffer.pop_front();
            }
        }
    }
}
```

**Affects Epics:** Epic 4 (Story 4.6: Simultaneous Screen + Webcam Recording, Story 4.7: Independent Audio Tracks)

---

### Pattern 2: Real-Time Encoding During Capture (Memory Management)

**Purpose:** Prevent memory bloat during long recordings by encoding frames in real-time instead of buffering them in memory.

**Architecture:**

```
ScreenCaptureKit → Bounded Channel (30 frames) → FFmpeg stdin → Disk
                   ^                              ^
                   |                              |
                   Backpressure if full          Real-time encoding
```

**Key Mechanism:** Use bounded `mpsc::channel(30)` to buffer only 1 second of frames. If FFmpeg can't keep up, the channel fills and capture thread blocks (backpressure), preventing memory bloat.

**Implementation:**

**File: `services/screen_capture/frame_handler.rs`**
```rust
use tokio::sync::mpsc;
use anyhow::Result;

const FRAME_BUFFER_SIZE: usize = 30; // 1 second @ 30fps

pub async fn capture_with_encoding(
    screen_capture: &mut ScreenCapture,
    ffmpeg: &mut FFmpegEncoder
) -> Result<()> {
    let (frame_tx, mut frame_rx) = mpsc::channel(FRAME_BUFFER_SIZE);

    // Capture thread
    let screen_capture = screen_capture.clone();
    tokio::spawn(async move {
        loop {
            let frame = screen_capture.capture_frame()?;

            // This will BLOCK if channel full (backpressure)
            // Prevents memory bloat - capture slows down if encoding can't keep up
            frame_tx.send(frame).await?;
        }
    });

    // Encoding thread (main thread)
    while let Some(frame) = frame_rx.recv().await {
        ffmpeg.write_frame_to_stdin(&frame)?;
    }

    Ok(())
}
```

**Memory Guarantee:**
- Maximum buffered frames: 30
- At 1080p BGRA (1920 * 1080 * 4 bytes): ~8MB per frame
- Maximum memory usage: 30 * 8MB = **240MB** (bounded)
- Without this pattern: Unbounded memory growth (crash after minutes)

**Affects Epics:** Epic 2 (Story 2.3: Real-Time FFmpeg Encoding), Epic 4 (all recording stories)

---

## Implementation Patterns

### 1. Naming Conventions

**Rust (Backend):**
- **Files:** `snake_case.rs` (e.g., `screen_capture.rs`, `frame_handler.rs`)
- **Modules:** `snake_case` (e.g., `mod screen_capture;`)
- **Structs/Enums:** `PascalCase` (e.g., `RecordingConfig`, `MediaFile`, `TrackType`)
- **Functions/methods:** `snake_case` (e.g., `start_recording`, `capture_frame`)
- **Constants:** `SCREAMING_SNAKE_CASE` (e.g., `FRAME_BUFFER_SIZE`, `MAX_TRACKS`)
- **Tauri commands:** Prefix `cmd_` to distinguish from internal functions (e.g., `cmd_start_recording`)

**TypeScript (Frontend):**
- **Files:**
  - Components: `PascalCase.tsx` (e.g., `Timeline.tsx`, `VideoPlayer.tsx`)
  - Utilities: `camelCase.ts` (e.g., `timeUtils.ts`, `waveformGenerator.ts`)
  - Stores: `camelCase.ts` (e.g., `timelineStore.ts`, `mediaLibraryStore.ts`)
- **Components:** `PascalCase` (e.g., `Timeline`, `RecordingPanel`)
- **Functions/variables:** `camelCase` (e.g., `startRecording`, `clipData`)
- **Types/Interfaces:** `PascalCase` (e.g., `Clip`, `TimelineTrack`, `RecordingConfig`)
- **Constants:** `SCREAMING_SNAKE_CASE` (e.g., `MAX_TRACKS`, `DEFAULT_FRAME_RATE`)

**IDs:**
- **Format:** UUIDs (lowercase with hyphens)
- **Generation:** `uuid::Uuid::new_v4()` in Rust, `crypto.randomUUID()` in TypeScript
- **Example:** `"550e8400-e29b-41d4-a716-446655440000"`

---

### 2. File Organization Patterns

**React Component Structure:**
```tsx
// components/timeline/Timeline.tsx

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Stage, Layer } from 'react-konva';

import { useTimelineStore } from '@/stores/timelineStore';
import { Button } from '@/components/ui/button';

import { TimelineTrack } from './TimelineTrack';
import type { Clip, Track } from '@/types/timeline';

interface TimelineProps {
  width: number;
  height: number;
}

export function Timeline({ width, height }: TimelineProps) {
  // Hooks first
  const tracks = useTimelineStore(state => state.tracks);
  const addClip = useTimelineStore(state => state.addClip);

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  // Event handlers
  const handleClipDrag = useCallback((clipId: string, newPosition: number) => {
    // Handle drag logic
  }, []);

  const handleClipSelect = useCallback((clipId: string) => {
    setSelectedClipId(clipId);
  }, []);

  // Effects
  useEffect(() => {
    // Timeline initialization
  }, []);

  // Render
  return (
    <div className="timeline">
      <Stage width={width} height={height}>
        <Layer>
          {tracks.map(track => (
            <TimelineTrack
              key={track.id}
              track={track}
              onClipDrag={handleClipDrag}
              onClipSelect={handleClipSelect}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
```

**Rust Module Structure:**
```rust
// services/recording/orchestrator.rs

use std::sync::Arc;
use anyhow::Result;
use tokio::sync::{mpsc, Mutex};

use crate::services::screen_capture::ScreenCapture;
use crate::services::camera::Camera;
use crate::services::ffmpeg::FFmpegCompositor;
use crate::models::recording::RecordingConfig;

// Constants at top
const FRAME_BUFFER_SIZE: usize = 30;
const SYNC_TOLERANCE_MS: u64 = 16;

// Public types
pub struct RecordingOrchestrator {
    screen_capture: Arc<Mutex<ScreenCapture>>,
    camera: Arc<Mutex<Camera>>,
    ffmpeg: Arc<Mutex<FFmpegCompositor>>,
    config: RecordingConfig,
}

// Public API
impl RecordingOrchestrator {
    pub fn new(config: RecordingConfig) -> Result<Self> {
        // Constructor
    }

    pub async fn start(&mut self) -> Result<String> {
        // Start recording
    }

    pub async fn stop(&mut self) -> Result<()> {
        // Stop recording
    }
}

// Private helpers
impl RecordingOrchestrator {
    async fn synchronize_frames(&mut self) -> Result<()> {
        // Internal frame sync logic
    }
}
```

---

### 3. Tauri Command Patterns

**Standard Command Structure (Rust):**
```rust
// commands/recording.rs

use tauri::State;
use crate::models::recording::RecordingConfig;
use crate::services::recording::RecordingOrchestrator;
use crate::AppState;

#[tauri::command]
pub async fn cmd_start_recording(
    config: RecordingConfig,
    state: State<'_, AppState>
) -> Result<String, String> {
    // 1. Validate input
    if !config.is_valid() {
        return Err("Invalid recording configuration".to_string());
    }

    // 2. Check permissions
    if !has_screen_recording_permission() {
        return Err("Screen recording permission not granted".to_string());
    }

    // 3. Business logic
    let recording_id = state.orchestrator
        .lock()
        .await
        .start_recording(config)
        .await
        .map_err(|e| format!("Failed to start recording: {}", e))?;

    // 4. Log success
    tracing::info!("Started recording: {}", recording_id);

    // 5. Return result
    Ok(recording_id)
}
```

**Frontend Invocation (TypeScript):**
```typescript
// lib/tauri/recording.ts

import { invoke } from '@tauri-apps/api/core';

export interface RecordingConfig {
  screenSource: 'fullscreen' | 'window';
  windowId?: number;
  cameraIndex?: number;
  systemAudio: boolean;
  microphone: boolean;
  frameRate: 30 | 60;
  resolution: 'source' | '1080p' | '720p';
  pipPosition?: { x: number; y: number };
  pipSize?: { width: number; height: number };
}

export async function startRecording(
  config: RecordingConfig
): Promise<string> {
  try {
    return await invoke<string>('cmd_start_recording', { config });
  } catch (error) {
    // Error is user-friendly string from Rust
    throw new Error(error as string);
  }
}
```

**RULE:** All Tauri commands return `Result<T, String>` where `String` is a user-friendly error message ready to display in UI.

---

### 4. Error Handling Patterns

**Rust Error Propagation:**
```rust
use anyhow::{Result, Context};

pub fn extract_video_metadata(path: &str) -> Result<VideoMetadata> {
    let file = std::fs::File::open(path)
        .context("Failed to open video file")?;

    let metadata = parse_metadata(&file)
        .context("Failed to parse video metadata")?;

    validate_metadata(&metadata)
        .context("Video metadata validation failed")?;

    Ok(metadata)
}

// Custom errors with thiserror
use thiserror::Error;

#[derive(Error, Debug)]
pub enum RecordingError {
    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Device not found: {0}")]
    DeviceNotFound(String),

    #[error("FFmpeg error: {0}")]
    FfmpegError(String),
}
```

**React Error Handling:**
```typescript
// With shadcn/ui toast notifications

import { toast } from '@/components/ui/use-toast';

async function handleStartRecording() {
  try {
    const recordingId = await startRecording(config);

    toast({
      title: "Recording started",
      description: `Recording ID: ${recordingId}`,
    });

    setIsRecording(true);
    setRecordingId(recordingId);
  } catch (error) {
    toast({
      variant: "destructive",
      title: "Recording failed",
      description: error as string,
    });

    console.error('Recording error:', error);
  }
}
```

**RULE:**
- User-facing errors → Toast notifications
- Internal errors → Console logs (dev) / File logs (Rust)
- Never expose stack traces to users

---

### 5. State Management Patterns (Zustand)

**Store Structure:**
```typescript
// stores/timelineStore.ts

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface Clip {
  id: string;
  filePath: string;
  startTime: number;      // milliseconds
  duration: number;       // milliseconds
  trimIn: number;         // milliseconds
  trimOut: number;        // milliseconds
}

interface Track {
  id: string;
  clips: Clip[];
  trackType: 'video' | 'audio';
}

interface TimelineStore {
  // State
  tracks: Track[];
  playheadPosition: number;
  selectedClipId: string | null;

  // Actions
  addClip: (trackId: string, clip: Clip) => void;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  setPlayheadPosition: (position: number) => void;
  selectClip: (clipId: string | null) => void;
}

export const useTimelineStore = create<TimelineStore>()(
  devtools(
    (set) => ({
      // Initial state
      tracks: [],
      playheadPosition: 0,
      selectedClipId: null,

      // Actions (immutable updates)
      addClip: (trackId, clip) => set((state) => ({
        tracks: state.tracks.map(track =>
          track.id === trackId
            ? { ...track, clips: [...track.clips, clip] }
            : track
        )
      })),

      removeClip: (clipId) => set((state) => ({
        tracks: state.tracks.map(track => ({
          ...track,
          clips: track.clips.filter(c => c.id !== clipId)
        })),
        selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId
      })),

      updateClip: (clipId, updates) => set((state) => ({
        tracks: state.tracks.map(track => ({
          ...track,
          clips: track.clips.map(c =>
            c.id === clipId ? { ...c, ...updates } : c
          )
        }))
      })),

      setPlayheadPosition: (position) => set({ playheadPosition: position }),

      selectClip: (clipId) => set({ selectedClipId: clipId }),
    }),
    { name: 'TimelineStore' }
  )
);
```

**Using Selectors for Performance:**
```typescript
// Component only re-renders when playheadPosition changes
function PlayheadIndicator() {
  const playheadPosition = useTimelineStore(state => state.playheadPosition);

  return <div style={{ left: `${playheadPosition}px` }} />;
}
```

**RULE:**
- Actions modify state immutably
- Use selectors to subscribe to specific state slices
- Enable devtools for debugging

---

### 6. Async Patterns

**Rust (Tokio async/await):**
```rust
pub async fn start_pip_recording(config: RecordingConfig) -> Result<String> {
    // Spawn parallel tasks
    let (screen_tx, screen_rx) = mpsc::channel(30);
    let (camera_tx, camera_rx) = mpsc::channel(30);

    tokio::spawn(async move {
        // Screen capture loop
        loop {
            let frame = capture_screen_frame().await?;
            screen_tx.send(frame).await?;
        }
    });

    tokio::spawn(async move {
        // Camera capture loop
        loop {
            let frame = capture_camera_frame().await?;
            camera_tx.send(frame).await?;
        }
    });

    // Main task coordinates
    synchronize_and_encode(screen_rx, camera_rx).await?;

    Ok("recording_id".to_string())
}
```

**TypeScript (async/await, never .then()):**
```typescript
async function exportTimeline(config: ExportConfig): Promise<void> {
  // Start export
  const exportId = await invoke<string>('cmd_start_export', { config });

  // Poll for progress
  while (true) {
    const progress = await invoke<{ completed: boolean; percentage: number }>(
      'cmd_get_export_progress',
      { exportId }
    );

    updateProgressBar(progress.percentage);

    if (progress.completed) {
      break;
    }

    // Wait 500ms before next poll
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  toast({ title: "Export complete" });
}
```

**RULE:** Always use `async/await`, never mix with `.then()` chains for consistency.

---

### 7. Import Organization

**TypeScript Import Order:**
```typescript
// 1. React imports
import { useState, useEffect, useCallback } from 'react';

// 2. Third-party imports
import { invoke } from '@tauri-apps/api/core';
import { Stage, Layer } from 'react-konva';

// 3. Internal absolute imports (@ alias for src/)
import { useTimelineStore } from '@/stores/timelineStore';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/timeline/timeUtils';

// 4. Relative imports
import { TimelineTrack } from './TimelineTrack';
import { Playhead } from './Playhead';

// 5. Type imports (last)
import type { Clip, Track } from '@/types/timeline';
```

**Rust Import Order:**
```rust
// 1. Standard library
use std::path::PathBuf;
use std::sync::Arc;

// 2. External crates (alphabetical)
use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use uuid::Uuid;

// 3. Internal crate modules (alphabetical)
use crate::models::recording::RecordingConfig;
use crate::models::timeline::Clip;
use crate::services::ffmpeg::FFmpegCompositor;
use crate::services::screen_capture::ScreenCapture;
```

---

### 8. Timeline Data Consistency

**Shared Type Definitions (Keep in sync between Rust and TypeScript!):**

**Rust:**
```rust
// src-tauri/src/models/timeline.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Clip {
    pub id: String,
    pub file_path: String,
    pub start_time: u64,  // milliseconds
    pub duration: u64,    // milliseconds
    pub trim_in: u64,     // milliseconds
    pub trim_out: u64,    // milliseconds
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub clips: Vec<Clip>,
    pub track_type: TrackType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackType {
    Video,
    Audio,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Timeline {
    pub tracks: Vec<Track>,
    pub total_duration: u64,  // milliseconds
}
```

**TypeScript:**
```typescript
// src/types/timeline.ts

export interface Clip {
  id: string;
  filePath: string;      // camelCase (serde converts snake_case → camelCase)
  startTime: number;     // milliseconds
  duration: number;      // milliseconds
  trimIn: number;        // milliseconds
  trimOut: number;       // milliseconds
}

export interface Track {
  id: string;
  clips: Clip[];
  trackType: 'video' | 'audio';  // lowercase (matches serde rename)
}

export interface Timeline {
  tracks: Track[];
  totalDuration: number;  // milliseconds
}
```

**CRITICAL:**
- Rust uses `snake_case` field names
- Serde automatically converts to camelCase when serializing to JSON
- TypeScript uses camelCase to match JSON
- Time units ALWAYS in milliseconds (never seconds or frames)
- IDs ALWAYS UUIDs (string type)

---

### 9. Testing Patterns

**Rust Unit Tests:**
```rust
// src-tauri/src/lib/timeline/clip_operations.rs

pub fn trim_clip(clip: &Clip, trim_in: u64, trim_out: u64) -> Clip {
    Clip {
        trim_in,
        trim_out,
        ..clip.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trim_clip() {
        let clip = Clip {
            id: "test".to_string(),
            file_path: "/path/to/video.mp4".to_string(),
            start_time: 0,
            duration: 10000,
            trim_in: 0,
            trim_out: 10000,
        };

        let trimmed = trim_clip(&clip, 2000, 8000);

        assert_eq!(trimmed.trim_in, 2000);
        assert_eq!(trimmed.trim_out, 8000);
        assert_eq!(trimmed.id, clip.id);
    }
}
```

**TypeScript Tests (Vitest):**
```typescript
// src/lib/timeline/timeUtils.test.ts

import { describe, it, expect } from 'vitest';
import { formatTime, parseTime, msToFrames } from './timeUtils';

describe('timeUtils', () => {
  describe('formatTime', () => {
    it('formats milliseconds to MM:SS', () => {
      expect(formatTime(125000)).toBe('02:05');
    });

    it('handles zero', () => {
      expect(formatTime(0)).toBe('00:00');
    });

    it('handles hours', () => {
      expect(formatTime(3661000)).toBe('01:01:01');
    });
  });

  describe('parseTime', () => {
    it('parses MM:SS to milliseconds', () => {
      expect(parseTime('02:05')).toBe(125000);
    });
  });

  describe('msToFrames', () => {
    it('converts milliseconds to frame count at 30fps', () => {
      expect(msToFrames(1000, 30)).toBe(30);
    });
  });
});
```

**Run Tests:**
```bash
# Rust tests
cd src-tauri
cargo test

# TypeScript tests
npm run test
```

---

### 10. Comment Patterns

**When to Comment:**
- ✅ Complex algorithms (e.g., frame synchronization logic)
- ✅ Non-obvious workarounds (e.g., "FFmpeg requires RGB24, not RGBA")
- ✅ Performance-critical sections (e.g., "Bounded channel prevents memory bloat")
- ✅ Business logic rationale (e.g., "16ms tolerance = ~60fps")
- ❌ Obvious code (don't comment `// Set playhead position`)

**Rust Doc Comments:**
```rust
/// Starts a picture-in-picture recording session.
///
/// Captures screen and webcam simultaneously, compositing webcam overlay
/// at configured position. Encodes in real-time to prevent memory bloat.
///
/// # Arguments
/// * `config` - Recording configuration including PiP position/size
///
/// # Returns
/// Recording ID on success, error message on failure
///
/// # Example
/// ```
/// let config = RecordingConfig {
///     pip_position: (100, 100),
///     pip_size: (320, 240),
///     ..Default::default()
/// };
/// let recording_id = start_pip_recording(config).await?;
/// ```
pub async fn start_pip_recording(config: RecordingConfig) -> Result<String, String> {
    // Implementation
}
```

**Inline Comments for Complex Logic:**
```rust
// Match frames by timestamp (16ms tolerance = ~60fps)
if let (Some(screen), Some(camera)) = (screen_buffer.front(), camera_buffer.front()) {
    let time_diff = (screen.0 as i64 - camera.0 as i64).abs() as u64;

    if time_diff < SYNC_TOLERANCE_MS {
        // Frames aligned - send to FFmpeg
        self.ffmpeg.write_screen_frame(&screen.1)?;
        self.ffmpeg.write_overlay_frame(&camera.1)?;

        screen_buffer.pop_front();
        camera_buffer.pop_front();
    }
}
```

---

## Consistency Rules

### Error Handling

**Rust Backend:**
- Use `anyhow::Result<T>` for internal functions (rich context)
- Use `Result<T, String>` for Tauri commands (user-friendly errors)
- Add context with `.context("description")`
- Define custom errors with `thiserror` for domain-specific errors

**React Frontend:**
- Catch errors from Tauri commands
- Display user-facing errors via shadcn/ui toast
- Log detailed errors to console (development only)
- Never expose stack traces to users

### Logging Strategy

**Rust:**
- Use `tracing` crate with structured fields
- Levels: `error!`, `warn!`, `info!`, `debug!`, `trace!`
- File logging to `~/Library/Logs/clippy/app.log` (macOS standard)
- Include context: `tracing::info!(user_action = "start_recording", recording_id = %id)`

**React:**
- Development: Verbose console.log
- Production: console.error for critical issues only
- No logging of sensitive data (file paths OK, user data NOT OK)

### Date/Time Handling

**Rust:**
- Use `chrono` crate
- Store timestamps in UTC (`chrono::Utc::now()`)
- Convert to local timezone for display only
- Serialize as ISO 8601 strings for JSON

**React:**
- Use native `Date` object
- Serialize as ISO 8601 for Tauri commands
- Format with `Intl.DateTimeFormat` (respects macOS locale)

**Timeline Timestamps:**
- ALWAYS use milliseconds (u64 in Rust, number in TypeScript)
- Timestamps are relative to clip/timeline start (NOT wall-clock time)
- Example: Clip starts at 0ms, playhead at 5000ms = 5 seconds into clip

### Tauri Command Response Format

**Standard envelope (enforced by `Result<T, String>`):**

Success:
```typescript
const result: T = await invoke('cmd_name', { args });
```

Error (caught in catch block):
```typescript
catch (error) {
  // error is user-friendly string from Rust
  const message: string = error as string;
}
```

### File Path Handling

**Convention:**
- Absolute paths stored in project file by default
- Option for relative paths (user choice during project save)
- Use Tauri `path` plugin for cross-platform path operations
- macOS paths: `/Users/username/...` (not `~`)

**Example:**
```rust
use tauri::api::path::app_data_dir;

let project_dir = app_data_dir(&config).unwrap();
let recordings_dir = project_dir.join("recordings");
```

---

## Data Architecture

### Core Data Models

**Timeline Model:**
```typescript
interface Clip {
  id: string;              // UUID
  filePath: string;        // Absolute or relative path
  startTime: number;       // Position on timeline (ms)
  duration: number;        // Total clip duration (ms)
  trimIn: number;          // Trim start point (ms)
  trimOut: number;         // Trim end point (ms)
}

interface Track {
  id: string;              // UUID
  clips: Clip[];           // Ordered clips on track
  trackType: 'video' | 'audio';
}

interface Timeline {
  tracks: Track[];
  totalDuration: number;   // Calculated from clips
}
```

**Media Library Model:**
```typescript
interface MediaFile {
  id: string;              // UUID
  filePath: string;        // Absolute path
  filename: string;        // Display name
  duration: number;        // Milliseconds
  resolution: { width: number; height: number };
  fileSize: number;        // Bytes
  codec: string;           // e.g., "h264", "hevc"
  thumbnail: string;       // Base64 or file path
  importedAt: string;      // ISO 8601 timestamp
}
```

**Recording Model:**
```typescript
interface RecordingConfig {
  screenSource: 'fullscreen' | 'window';
  windowId?: number;                     // macOS window ID
  cameraIndex?: number;                  // Camera device index
  systemAudio: boolean;
  microphone: boolean;
  frameRate: 30 | 60;
  resolution: 'source' | '1080p' | '720p';
  pipPosition?: { x: number; y: number }; // Pixel coordinates
  pipSize?: { width: number; height: number };
}
```

**AI Model:**
```typescript
interface Transcript {
  id: string;
  clipId: string;
  segments: TranscriptSegment[];
  language: string;
  generatedAt: string;  // ISO 8601
}

interface TranscriptSegment {
  text: string;
  startTime: number;    // Milliseconds
  endTime: number;      // Milliseconds
  words: Word[];        // Word-level timestamps from Whisper
}

interface Word {
  text: string;
  startTime: number;
  endTime: number;
}

interface Caption {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  style: CaptionStyle;
}

interface CaptionStyle {
  font: string;
  size: number;
  color: string;
  backgroundColor: string;
  position: 'top' | 'center' | 'bottom';
}
```

### Project File Format (JSON)

**File: `project.clippy` (JSON)**
```json
{
  "version": "1.0",
  "projectName": "My Video Project",
  "createdAt": "2025-10-27T12:00:00Z",
  "modifiedAt": "2025-10-27T14:30:00Z",
  "timeline": {
    "tracks": [
      {
        "id": "track-uuid-1",
        "trackType": "video",
        "clips": [
          {
            "id": "clip-uuid-1",
            "filePath": "/Users/zeno/Videos/recording.mp4",
            "startTime": 0,
            "duration": 30000,
            "trimIn": 0,
            "trimOut": 30000
          }
        ]
      }
    ],
    "totalDuration": 30000
  },
  "mediaLibrary": [
    {
      "id": "media-uuid-1",
      "filePath": "/Users/zeno/Videos/recording.mp4",
      "filename": "recording.mp4",
      "duration": 30000,
      "resolution": { "width": 1920, "height": 1080 },
      "fileSize": 52428800,
      "codec": "h264",
      "importedAt": "2025-10-27T12:00:00Z"
    }
  ],
  "transcripts": [],
  "captions": []
}
```

---

## API Contracts

### Tauri Commands

**Recording Commands:**

```rust
// Start screen recording
#[tauri::command]
pub async fn cmd_start_recording(
    config: RecordingConfig,
    state: State<'_, AppState>
) -> Result<String, String>
// Returns: Recording ID

// Stop recording
#[tauri::command]
pub async fn cmd_stop_recording(
    recording_id: String,
    state: State<'_, AppState>
) -> Result<String, String>
// Returns: Output file path

// Get recording status
#[tauri::command]
pub async fn cmd_get_recording_status(
    recording_id: String,
    state: State<'_, AppState>
) -> Result<RecordingStatus, String>
```

**Export Commands:**

```rust
// Start timeline export
#[tauri::command]
pub async fn cmd_start_export(
    timeline: Timeline,
    config: ExportConfig,
    state: State<'_, AppState>
) -> Result<String, String>
// Returns: Export ID

// Get export progress
#[tauri::command]
pub async fn cmd_get_export_progress(
    export_id: String,
    state: State<'_, AppState>
) -> Result<ExportProgress, String>

#[derive(Serialize)]
pub struct ExportProgress {
    pub completed: bool,
    pub percentage: f32,
    pub eta_seconds: Option<u64>,
}
```

**AI Commands:**

```rust
// Transcribe video
#[tauri::command]
pub async fn cmd_transcribe_video(
    file_path: String,
    state: State<'_, AppState>
) -> Result<Transcript, String>

// Generate captions from transcript
#[tauri::command]
pub async fn cmd_generate_captions(
    transcript: Transcript,
    state: State<'_, AppState>
) -> Result<Vec<Caption>, String>

// Analyze video content
#[tauri::command]
pub async fn cmd_analyze_content(
    transcript: Transcript,
    state: State<'_, AppState>
) -> Result<ContentAnalysis, String>

#[derive(Serialize)]
pub struct ContentAnalysis {
    pub description: String,
    pub tags: Vec<String>,
    pub suggested_title: String,
}
```

---

## Security Architecture

### macOS Permissions

**Required Permissions:**
- **Screen Recording** - ScreenCaptureKit access
- **Camera** - AVFoundation camera access
- **Microphone** - Audio input
- **File System** - Read/write media files

**Permission Handling:**

```rust
// services/permissions/macos.rs

pub fn check_screen_recording_permission() -> Result<bool> {
    // Use CGPreflightScreenCaptureAccess
}

pub fn request_screen_recording_permission() {
    // Show macOS system dialog
}

pub fn check_camera_permission() -> Result<bool> {
    // AVCaptureDevice.authorizationStatus
}
```

**User Flow:**
1. On first launch, check permissions
2. If denied, show user-friendly error with instructions
3. Guide user to System Preferences → Privacy & Security

### API Key Management

**OpenAI API Key:**
- Stored in macOS Keychain (NOT in config file or environment variables)
- Accessed via Tauri keychain plugin
- Never logged or exposed to frontend

```rust
use tauri::api::keychain;

pub async fn store_openai_key(key: String) -> Result<()> {
    keychain::set("clippy", "openai_api_key", &key)
}

pub async fn get_openai_key() -> Result<String> {
    keychain::get("clippy", "openai_api_key")
}
```

**OpenAI API Version Pinning Strategy:**

To ensure stability and predictable behavior, clippy pins specific OpenAI model versions:

- **Whisper API:** `whisper-1` (stable model, production-ready)
- **GPT-4 API:** `gpt-4-turbo-preview` (or latest stable GPT-4 variant at implementation time)

**Version Management:**
```rust
// services/openai/config.rs
pub const WHISPER_MODEL: &str = "whisper-1";
pub const GPT4_MODEL: &str = "gpt-4-turbo-preview";

// Version upgrade path:
// 1. Test new model version in separate branch
// 2. Validate transcription accuracy (maintain >90% threshold)
// 3. Compare cost implications (log via Story 5.1 AC #7)
// 4. Update constants and document in CHANGELOG
```

**Graceful Degradation:**
- If OpenAI API unavailable (network, rate limits, service outage):
  - Display clear user notification: "AI features temporarily unavailable"
  - Core editing features (import, timeline, export) remain fully functional
  - Transcription/caption workflows gracefully disable with retry option
  - Previously generated transcripts/captions remain accessible from project state

**API Error Handling:**
```rust
pub enum OpenAIError {
    NetworkFailure(String),
    RateLimitExceeded { retry_after: Duration },
    InvalidAPIKey,
    ModelNotAvailable(String),
    ServiceUnavailable,
}

// User-friendly error messages defined in Story 5.1 implementation
```

### Data Protection

- No user data collection or telemetry
- All processing local (except OpenAI API calls)
- Project files stored locally, user controls location
- No network requests except OpenAI API (user-initiated)

---

## Performance Considerations

### NFR Alignment

**From PRD NFR001:**
- ✅ 30+ FPS playback: Video.js + optimized timeline rendering with Konva.js
- ✅ 30+ FPS screen recording: ScreenCaptureKit native performance
- ✅ Near real-time export: FFmpeg optimized encoding (60-90s for 1 minute video)
- ✅ Sub-3 second launch: Tauri native app, minimal startup overhead

**Optimization Strategies:**

1. **Timeline Rendering (60 FPS target):**
   - Konva.js with dirty region detection
   - Virtualize off-screen clips (only render visible timeline)
   - Debounce playhead updates during scrubbing

2. **Memory Management:**
   - Bounded channels for frame buffers (30 frame = 1 second)
   - Real-time FFmpeg encoding (no memory accumulation)
   - Lazy-load media thumbnails
   - Unload inactive clips from memory

3. **Disk I/O:**
   - Async file operations (Tokio)
   - Stream large files instead of loading into memory
   - Write logs async (non-blocking)

4. **Parallel Processing:**
   - Multi-threaded Tokio runtime
   - Parallel screen + camera capture
   - FFmpeg uses hardware acceleration (macOS VideoToolbox)

---

## Deployment Architecture

### macOS Application Bundle

**Build Process:**
```bash
# Development
npm run tauri dev

# Production build
npm run tauri build

# Output: src-tauri/target/release/bundle/macos/clippy.app
```

**Bundle Contents:**
- `clippy.app/Contents/MacOS/clippy` - Rust binary
- `clippy.app/Contents/Resources/` - React assets
- `clippy.app/Contents/Info.plist` - macOS metadata

### Distribution

**Development:**
- Build locally with `cargo tauri build`
- Unsigned .app bundle (requires Gatekeeper bypass)

**Production (Future):**
- Code signing with Apple Developer certificate
- Notarization for Gatekeeper approval
- DMG installer for distribution

### System Requirements

**From PRD NFR002:**
- macOS 12+ (Monterey and later)
- Apple Silicon (M1/M2/M3) - primary support
- Intel Macs - secondary support
- 8GB RAM minimum, 16GB recommended

---

## Development Environment

### Prerequisites

**System:**
- macOS 12+ (Monterey or later)
- Xcode Command Line Tools: `xcode-select --install`
- Rust toolchain: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Node.js 18+: `brew install node`

**Tauri Prerequisites:**
```bash
# Install Tauri CLI
cargo install tauri-cli

# Verify installation
cargo tauri --version
```

### Setup Commands

```bash
# Clone and setup (Story 1.1)
git clone <repository>
cd clippy

# Install frontend dependencies
npm install

# Run in development
npm run tauri dev

# Build for production
npm run tauri build

# Run tests
npm run test              # Frontend (Vitest)
cd src-tauri && cargo test # Backend (Rust)

# Lint and format
npm run lint
npm run format
```

### IDE Setup

**Recommended: VSCode**

Extensions:
- `rust-analyzer` - Rust language support
- `Tauri` - Tauri development tools
- `ESLint` - TypeScript linting
- `Prettier` - Code formatting
- `Tailwind CSS IntelliSense` - Tailwind autocomplete

**Settings (.vscode/settings.json):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer"
  }
}
```

---

## Architecture Decision Records (ADRs)

### ADR-001: Use ffmpeg-sidecar Instead of Rust FFmpeg Bindings

**Context:** Need FFmpeg for encoding, export, composition, audio extraction.

**Options Considered:**
- rsmpeg (Rust bindings to FFmpeg C libraries)
- ffmpeg-next (Rust bindings, maintenance mode)
- ffmpeg-sidecar (Wrapper around FFmpeg CLI)

**Decision:** ffmpeg-sidecar

**Rationale:**
- Performance-first: CLI overhead negligible vs encoding time
- Auto-downloads binary - zero build complexity
- Battle-tested by production tools (OBS, etc.)
- Easier debugging (can test commands directly in terminal)
- Avoids Rust FFI complexity and static linking issues

**Consequences:**
- ✅ Faster implementation
- ✅ No build issues with FFmpeg dependencies
- ✅ Easy to test and debug
- ⚠️ Slightly less type safety than Rust bindings
- ⚠️ Process spawn overhead (~50ms, negligible)

### ADR-002: Use Konva.js Instead of Fabric.js for Timeline

**Context:** Need canvas library for interactive 60 FPS timeline editing.

**Decision:** Konva.js (changed from PRD's Fabric.js suggestion)

**Rationale:**
- Better performance - dirty region detection
- Timeline-optimized - frame rate optimization, animation sequencing
- Smaller bundle size
- Game engine heritage (optimized for 60 FPS)

**Consequences:**
- ✅ Meets 60 FPS NFR requirement
- ✅ Better performance for multi-track timeline
- ✅ Lighter weight

### ADR-003: Use Zustand for State Management

**Context:** Need state management for complex timeline with clips, tracks, playback.

**Decision:** Zustand

**Rationale:**
- Performance: 85ms vs 220ms (Context API) for complex updates
- Simple API, no boilerplate
- Good DevTools support
- Scales well with project complexity

**Consequences:**
- ✅ Optimized re-renders via selectors
- ✅ Easy to learn and use
- ✅ Less code than Redux

### ADR-004: JSON Project File Format

**Context:** Need to persist timeline state, clips, captions, settings.

**Decision:** JSON files with `.clippy` extension

**Rationale:**
- Human-readable (easy debugging)
- Version control friendly
- TypeScript types sync easily with Rust structs
- Portable across systems

**Consequences:**
- ✅ Easy to debug and inspect
- ✅ Git-friendly (can diff changes)
- ⚠️ Larger file size than binary (acceptable)
- ⚠️ No built-in compression (can add gzip later)

### ADR-005: Store Timeline Timestamps in Milliseconds

**Context:** Need consistent time unit across video APIs, FFmpeg, Web Audio.

**Decision:** Always use milliseconds (u64 in Rust, number in TypeScript)

**Rationale:**
- MPV uses seconds (convert on display)
- FFmpeg uses seconds (convert for commands)
- Web Audio uses seconds (convert for AudioContext)
- JavaScript Date uses milliseconds
- Millisecond precision sufficient for video editing (frame-level at 60fps = 16ms)

**Consequences:**
- ✅ Single source of truth (milliseconds everywhere)
- ✅ Easy conversion to other units
- ✅ No floating point precision issues
- ⚠️ Must remember to convert for external APIs

### ADR-006: Use MPV (libmpv2) for Video Playback

**Context:** HTML5 video element in Chromium WebView has limited codec support - specifically fails on HEVC (H.265) encoded videos, which are common from modern cameras and screen recorders. This creates a poor user experience as valid MP4 files fail to play with cryptic "format not supported" errors. Professional video editors require universal codec support to handle diverse source files.

**Decision:** Integrate MPV (libmpv2 5.0.1) as the video playback engine instead of HTML5 video element.

**Rationale:**
- **Universal Codec Support:** MPV supports all professional codecs (H.264, HEVC/H.265, ProRes, DNxHD, VP9, AV1) without requiring OS-level codec packs
- **Frame-Accurate Seeking:** Sub-33ms seeking precision required for professional timeline editing (HTML5 video seek accuracy varies by browser)
- **Battle-Tested:** Used by VLC, OBS Studio, and professional video tools - proven stable for 24/7 streaming applications
- **Native Integration:** libmpv provides C API that integrates cleanly with Rust via Tauri backend
- **Performance:** Hardware-accelerated decoding, efficient memory usage, handles 4K+ without frame drops
- **Separation of Concerns:** MPV handles playback, FFmpeg continues to handle export/processing - each tool optimized for its purpose
- **Event-Based Architecture:** MPV's FileLoaded/EndFile events enable robust, non-polling architecture

**Alternatives Considered:**
- **FFmpeg.wasm (Rejected):** Would work in browser but requires transcoding all videos to supported format on import (slow, storage-intensive, lossy)
- **Video.js plugins (Rejected):** No reliable HEVC support plugins exist; still limited by underlying HTML5 capabilities
- **Server-side transcoding (Rejected):** Requires backend server, defeats purpose of desktop-native application
- **Multiple player fallbacks (Rejected):** Complex architecture, inconsistent UX, still leaves codec gaps

**Implementation (Actual):**
- Story 1.3.5: MPV Integration (8 hours total)
- **libmpv2 v5.0.1** added to Cargo.toml (upgraded from planned 2.0 to match system MPV 0.40.0)
- System dependency: `brew install mpv` (documented in README)
- Created `src-tauri/src/services/mpv_player.rs` - MPV wrapper service with event-based architecture
- Created `src-tauri/src/commands/mpv.rs` - Tauri commands (init, load_file, play, pause, seek, get_time, get_duration, stop)
- Refactored `VideoPlayer.tsx` to use Tauri invoke() instead of HTMLVideoElement API
- **Event-based loading:** Uses MPV's FileLoaded event with 5-second timeout
- **WebM support added:** VP9 codec tested and validated
- **MVP prototype scope:** Backend playback control functional, video frame rendering deferred

**Testing Results:**
- ✅ H.264/AVC (MP4) - Tested and passing
- ✅ HEVC/H.265 yuv420p (MP4) - Tested and passing
- ✅ VP9 (WebM) - Tested and passing
- ✅ ProRes (MOV) - Tested and passing
- ❌ HEVC yuvj420p (iOS Screen Recording) - Known limitation (JPEG color range not supported by libmpv)

**Consequences:**
- ✅ Universal codec support - H.264, HEVC, VP9, ProRes all play without conversion
- ✅ Professional-grade frame-accurate seeking (<33ms precision)
- ✅ Event-based architecture more robust than polling
- ✅ Better performance for high-resolution video (4K+)
- ✅ Consistent behavior across macOS versions
- ✅ Foundation for advanced features (color correction, filters)
- ⚠️ Additional system dependency (MPV must be installed via Homebrew)
- ⚠️ Backend video control architecture (more complex than direct DOM, but cleaner separation)
- ⚠️ HEVC yuvj420p limitation (iOS Screen Recordings require FFmpeg conversion)
- ⚠️ MVP prototype: Video frames not rendered to screen yet (backend-only implementation)

**Status:** Implemented and tested in Epic 1 (2025-10-28)

**Date:** 2025-10-28

**Update (2025-10-28): Headless MPV Configuration**

During Story 1.4 testing, MPV dimension retrieval was failing with `MPV_ERROR_PROPERTY_UNAVAILABLE` errors, causing 10-second timeouts on video load. The issue affected all codecs.

**Root Cause:** Initial implementation used `vo=libmpv` which requires GUI render context via libmpv's render API. Since we're using screenshot-based frame capture (not render API), the VideoReconfig event never fired and dimensions remained unavailable.

**Solution Applied:** Switched to headless MPV configuration:
```rust
// src-tauri/src/services/mpv_player.rs (lines 23-31)
mpv.set_property("vo", "null")?;              // No video output window
mpv.set_property("force-window", "no")?;      // Prevent window creation
mpv.set_property("audio", "no")?;             // Disable audio output
mpv.set_property("hwdec", "auto")?;           // Hardware decode still enabled
mpv.set_property("keep-open", "yes")?;        // Keep file open at end
mpv.set_property("pause", "yes")?;            // Start paused
```

**Event Handling:** Simplified `load_file()` to wait only for `FileLoaded` event (not VideoReconfig). With `vo=null`, VideoReconfig doesn't fire, but FileLoaded is sufficient for headless operation.

**Results:**
- ✅ All codecs (H.264, HEVC, ProRes, VP9) load in <1 second
- ✅ No window popups or GUI artifacts
- ✅ Screenshot-based frame capture works correctly
- ✅ Video dimensions optional (already provided by FFmpeg during import)

**Reference:** `docs/HANDOFF-PLAYBACK-MODE-DEBUG-2025-10-28.md`, `docs/TECHNICAL-DEBT.md` (TD-002)

**Update (2025-10-29): MPV Audio Output Enabled for Preview Playback**

During Story 3.10.1 (Preview Playback Audio Fades), MPV audio output was enabled to support real-time audio fade effects and volume control during preview playback.

**Context:** Story 3.10 implemented audio fade-in/fade-out UI and FFmpeg export, but AC #4 (fade effects audible during preview) was deferred because MPV had audio disabled (`audio: no`). Story 3.10.1 enables MPV audio to complete the feature.

**Configuration Changes:**
```rust
// src-tauri/src/services/mpv_player.rs (line 29)
// Changed from: mpv.set_property("audio", "no")?;
// Changed to:
mpv.set_property("audio", "auto")?;  // Enable audio only if video has audio track
```

**Audio Features Implemented:**
1. **Volume Control (Story 3.9.1/3.10.1):**
   - `set_volume(volume: f32, muted: bool)` method added to MpvPlayer
   - Converts Clippy's 0-200% scale to MPV's 0-100% scale
   - Tauri command: `mpv_set_volume`

2. **Fade Filters (Story 3.10.1):**
   - `apply_fade_filters(fade_in_ms, fade_out_ms, clip_duration_ms)` method added
   - Uses MPV's `afade` audio filter with dynamic timing
   - Fade-in: `afade=t=in:st=0:d={fade_in_sec}`
   - Fade-out: `afade=t=out:st={start_time}:d={fade_out_sec}`
   - Filter chain order: volume → fade-in → fade-out (matches FFmpeg export)
   - Tauri commands: `mpv_apply_fade_filters`, `mpv_clear_audio_filters`

3. **VideoPlayer Integration:**
   - `VideoPlayer.tsx` applies volume and fade filters when playback starts
   - Filters cleared when playback stops
   - Ensures preview matches export behavior

**Audio Driver Selection:**
- `audio: auto` enables auto-detection:
  - macOS: CoreAudio (default)
  - Linux: PulseAudio or ALSA
  - Windows: WASAPI
- Default audio format: 48kHz stereo (standard for video editing)

**Testing:**
- ✅ 8 new integration tests (5 Rust + 3 TypeScript) covering volume, fades, and filter clearing
- ✅ Volume conversion (Clippy 100% → MPV 50%, Clippy 200% → MPV 100%)
- ✅ Fade filter syntax validated (afade parameters)
- ✅ Filter clearing verified

**Results:**
- ✅ Audio fades now audible during preview playback
- ✅ Preview matches export behavior (volume + fades)
- ✅ Story 3.10 AC #4 satisfied (6/6 ACs complete)
- ✅ No audio distortion or clipping artifacts

**Reference:** `docs/stories/3-10-1-preview-playback-audio-fades.md`, `docs/stories/3-10-audio-fade-in-out.md`

---

### ADR-007: Playback Mode Architecture (Preview vs Timeline)

**Context:** Video editor requires two distinct playback modes:
1. **Preview Mode:** Play selected media files independently (Story 1.4)
2. **Timeline Mode:** Play assembled timeline composition (Story 1.7)

Without mode distinction, the VideoPlayer component cannot differentiate between these fundamentally different use cases, leading to broken UX where users cannot preview videos independently of the timeline.

**Decision:** Implement mode-aware architecture with single MPV backend:
- `playerStore` tracks active mode: `'preview' | 'timeline'`
- VideoPlayer component handles preview mode playback
- Future TimelinePlayer component will handle timeline mode
- Single MpvPlayerState in Tauri backend switches between sources

**Rationale:**
- **Industry Pattern:** Follows professional video editor pattern (Source Monitor / Program Monitor in Premiere Pro, DaVinci Resolve, Final Cut Pro)
- **Resource Efficient:** Single libmpv instance (heavyweight ~200MB RAM) shared between modes
- **Clean Separation:** Clear separation of concerns - only one mode active at a time
- **User Mental Model:** Matches user expectations from professional tools
- **Prevents Conflicts:** Explicit mode prevents accidental timeline interference during preview

**Implementation:**

**playerStore Architecture:**
```typescript
interface PlayerStore {
  mode: 'preview' | 'timeline';          // Which component controls MPV
  currentVideo: MediaFile | null;        // Preview mode source
  playheadPosition: number;              // Timeline mode position
  isPlaying: boolean;                    // Shared playback state
  currentTime: number;                   // Current position
  duration: number;                      // Current duration

  setMode: (mode: 'preview' | 'timeline') => void;
  // ... existing actions
}
```

**Mode Switching Logic:**
- Click media library item → `mode = 'preview'`, load video for independent playback
- Click timeline play → `mode = 'timeline'`, play composition synchronized with timeline
- Only one mode active at a time (single MPV instance)

**Component Updates:**
- `MediaItem.tsx`: Sets mode to 'preview' when user selects video from library
- `VideoPlayer.tsx`: Checks mode before timeline synchronization - only syncs if `mode === 'timeline'`
- Timeline play button (future): Sets mode to 'timeline' before playback

**Alternatives Considered:**
- ❌ Two MPV instances: 2x memory overhead, coordination complexity, only one can render audio at a time
- ❌ Conditional logic in single component: Tangled code, hard to maintain, unclear separation

**Consequences:**
- ✅ Users can preview videos independently before adding to timeline
- ✅ Clear separation between preview and timeline playback
- ✅ Resource efficient (single MPV instance)
- ✅ Foundation for future timeline playback features
- ⚠️ Mode must be explicitly managed (prevents accidental state conflicts)
- ⚠️ Story 1.4 requires mode architecture implementation to satisfy AC #2 (independent playback)

**Implementation Stories:**
- Story 1.4: Preview Mode implementation
- Story 1.7: Timeline Mode implementation (future)

**Status:** Implemented (2025-10-28)

**Implementation:**
- `focusContext: 'source' | 'timeline'` field added to playerStore
- `sourceVideo: MediaFile | null` field added to playerStore
- Automatic mode derivation: focusContext → mode mapping
- MediaItem component sets `focusContext='source'` on click
- Future Timeline component will set `focusContext='timeline'` on play (Epic 3)

**Rules Implemented:**
- Library interactions → `focusContext='source'` → `mode='preview'`
- Timeline interactions → `focusContext='timeline'` → `mode='timeline'`
- Play button respects current focusContext
- Last interaction wins (implicit, no manual toggle required)

**Date:** 2025-10-28
**Implementation Date:** 2025-10-28

---

## Next Steps

**After Architecture Approval:**

1. **Review architecture.md** - Ensure all decisions are clear
2. **Run:** `workflow-status` to confirm ready for Phase 4
3. **Start Story 1.1:** Project initialization with `create-tauri-app`
4. **Use `create-story` workflow** to generate implementation plans for each story

**Story Implementation Order:**
- Epic 1 (Stories 1.1-1.10) - Foundation & TRUE MVP
- Epic 2 (Stories 2.1-2.8) - Recording Foundation
- Epic 3 (Stories 3.1-3.10) - Multi-Track Timeline
- Epic 4 (Stories 4.1-4.8) - Advanced Recording & PiP
- Epic 5 (Stories 5.1-5.10) - AI-Powered Automation

---

_Generated by BMAD Decision Architecture Workflow v1.3.2_
_Date: 2025-10-27_
_For: zeno_
_Agent: Winston (Architect)_
