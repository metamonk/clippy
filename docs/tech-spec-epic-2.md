# Epic Technical Specification: Recording Foundation

Date: 2025-10-28
Author: zeno
Epic ID: 2
Status: Final
Stories: 2.1 (✅ Completed), 2.2-2.8 (Ready for Development)

---

## Overview

Epic 2 establishes native screen and webcam recording capabilities within clippy, integrating Apple's ScreenCaptureKit API and AVFoundation framework to capture screen, webcam, system audio, and microphone input. This epic validates the most technically risky aspect of the project: calling native macOS frameworks from Rust, handling real-time FFmpeg encoding to prevent memory bloat during long recordings, and implementing robust macOS permission handling. Building on Story 2.1's permission foundation, this epic delivers eight stories (2.1-2.8) that enable users to record their screen (full screen mode), webcam separately, with configurable audio sources, and have recordings automatically imported to the media library ready for immediate editing.

The technical architecture leverages **Novel Pattern 2: Real-Time Encoding During Capture** (architecture.md lines 501-560) to stream frames directly to FFmpeg via bounded channels, ensuring stable memory usage during 5+ minute recordings. This pattern uses backpressure to prevent memory bloat: a bounded `mpsc::channel(30)` buffers only 1 second of frames, blocking capture if FFmpeg encoding can't keep up. The recording architecture establishes the foundation for Epic 4's advanced multi-stream PiP composition by proving out the core capture, encoding, and synchronization patterns.

## Objectives and Scope

**In Scope for Epic 2:**

- ✅ **Permission Handling** (Story 2.1 - COMPLETED): ScreenCaptureKit permission detection, request flow, clear UX guidance
- **Full-Screen Recording** (Story 2.2): Capture entire screen at 30 FPS using ScreenCaptureKit with SCStream async delegates
- **Real-Time FFmpeg Encoding** (Story 2.3): Stream frames to FFmpeg stdin, encode to H.264 MP4 during recording, prevent memory bloat
- **Audio Capture** (Story 2.4): System audio via ScreenCaptureKit audio APIs, microphone via CoreAudio/AVFoundation, synchronized muxing
- **Recording Controls** (Story 2.5): Start/stop/pause/resume UI, recording duration timer, disk space checks, visual recording indicator
- **Auto-Import to Media Library** (Story 2.6): Automatic thumbnail generation, metadata extraction, organized file storage
- **Basic Webcam Recording** (Stories 2.7-2.8): AVFoundation camera capture, preview, recording with microphone audio, auto-import

**Out of Scope (Deferred to Epic 4):**

- Window selection for screen recording (Story 4.1)
- Simultaneous screen + webcam recording with PiP composition (Story 4.6)
- Multi-audio track recording architecture (3 independent tracks) (Story 4.3, 4.7)
- Advanced recording configuration panel (frame rate, resolution selection) (Story 4.2)
- Webcam preview during configuration (Story 4.4)
- PiP position and size configuration (Story 4.5)

**Out of Scope (Not in Project):**

- Screen recording on non-macOS platforms (Windows/Linux)
- Background recording without visible indicator (prohibited by macOS security)
- Recording DRM-protected content (blocked by ScreenCaptureKit)
- Screen recording during system screensavers or Fast User Switching

## System Architecture Alignment

Epic 2 implements the recording architecture defined in `architecture.md` (lines 99, 186-260) with the following key alignments:

**Backend Architecture (Rust):**
- `src-tauri/src/services/screen_capture/screencapturekit.rs` - ScreenCaptureKit wrapper with SCStream async delegate pattern (Story 2.1 foundation, 2.2 implementation)
- `src-tauri/src/services/camera/nokhwa_wrapper.rs` - AVFoundation webcam capture abstraction (Stories 2.7-2.8)
- `src-tauri/src/services/recording/orchestrator.rs` - Multi-stream coordination (deferred to Epic 4, simple single-stream pattern in Epic 2)
- `src-tauri/src/services/ffmpeg/encoder.rs` - Real-time encoding with bounded channels (Story 2.3, Novel Pattern 2)
- `src-tauri/src/services/permissions/macos.rs` - ✅ Permission handling (Story 2.1 COMPLETED)
- `src-tauri/src/commands/recording.rs` - Tauri commands for recording control (Stories 2.2-2.8)

**Frontend Architecture (React):**
- `src/components/recording/RecordingPanel.tsx` - Recording modal/panel (Story 2.5)
- `src/components/recording/RecordingControls.tsx` - Start/stop/pause buttons (Story 2.5)
- `src/components/recording/RecordingPreview.tsx` - Webcam preview (Story 2.7)
- `src/stores/recordingStore.ts` - Zustand state for recording session management (Stories 2.5-2.6)

**Dependencies (from architecture.md Decision Summary):**
- **screencapturekit 0.3.6** - macOS ScreenCaptureKit bindings (✅ integrated in Story 2.1)
- **ffmpeg-sidecar 2.1.0** - FFmpeg CLI wrapper with auto-download (Story 2.3)
- **nokhwa 0.10.9** (feature: input-avfoundation) - Webcam capture (Stories 2.7-2.8)
- **Tokio 1.x** (full features) - Async runtime for parallel capture threads (Story 2.2)

**Constraints from Architecture:**
- macOS 12.3+ required (ScreenCaptureKit availability, verified in Story 2.1)
- 30 FPS recording (60 FPS deferred to Epic 4 configuration)
- Memory management: bounded channels (30 frame buffer = 1 second @ 30fps = 240MB max for 1080p BGRA)
- Encoding format: H.264 MP4 (AAC audio) - universal playback compatibility

## Detailed Design

### Services and Modules

| Service/Module | Responsibilities | Inputs | Outputs | Owner Story |
|----------------|-----------------|--------|---------|-------------|
| **screen_capture::screencapturekit** | ScreenCaptureKit wrapper, SCStream management, frame capture via async delegates | Recording config (resolution, FPS), permission status | Raw BGRA frames (1920×1080×4 bytes), timestamp metadata | Story 2.1 (foundation), 2.2 (implementation) |
| **camera::nokhwa_wrapper** | AVFoundation camera capture, device enumeration, preview frames | Camera index, resolution settings | Raw camera frames, device list | Stories 2.7-2.8 |
| **ffmpeg::encoder** | Real-time H.264 encoding via stdin, bounded channel backpressure, progress monitoring | Frame stream (mpsc::Receiver), output path, codec settings | Encoded MP4 file, encoding progress events | Story 2.3 |
| **audio_capture** | System audio via ScreenCaptureKit, microphone via CoreAudio/AVFoundation, audio synchronization | Audio source selection (system/mic/both), sample rate | Raw audio samples, synchronized timestamps | Story 2.4 |
| **recording::orchestrator** | Single-stream recording coordination (Epic 2 scope), state management, error recovery | Recording config, capture source | Recording session ID, status updates | Stories 2.2-2.6 |
| **permissions::macos** | ✅ Permission check/request (COMPLETED), camera/mic permission handling | Permission type (screen/camera/mic) | Permission status (granted/denied/not-determined) | Story 2.1 (✅), 2.7 (camera) |
| **commands::recording** | Tauri commands for frontend IPC, recording lifecycle management | Frontend recording requests | Result<RecordingId, String> responses | Stories 2.2-2.8 |
| **Frontend: recordingStore** | Zustand state for recording UI, recording session tracking, auto-import trigger | Recording actions, backend events | UI state, recording status | Stories 2.5-2.6 |
| **Frontend: RecordingPanel** | Recording modal UI, source selection, audio config, recording controls | User interactions, recording status | User commands (start/stop/pause) | Story 2.5 |
| **Frontend: RecordingPreview** | Webcam preview rendering, camera selection dropdown | Camera frames from Tauri backend | User camera selection | Story 2.7 |

**Module Dependencies:**
```
screen_capture → ffmpeg::encoder (frame streaming)
audio_capture → ffmpeg::encoder (audio muxing)
recording::orchestrator → screen_capture, audio_capture, ffmpeg::encoder
commands::recording → recording::orchestrator
RecordingPanel → commands::recording (via Tauri IPC)
```

### Data Models and Contracts

**Rust Data Models:**

```rust
// src-tauri/src/models/recording.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingConfig {
    pub source: RecordingSource,
    pub audio_sources: AudioSources,
    pub output_path: PathBuf,
    pub frame_rate: u32,           // 30 (Epic 2), 60 (Epic 4)
    pub resolution: Resolution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecordingSource {
    FullScreen,                    // Story 2.2
    Window { window_id: u32 },     // Epic 4 (Story 4.1)
    Camera { camera_index: u32 },  // Stories 2.7-2.8
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioSources {
    pub system_audio: bool,        // ScreenCaptureKit audio
    pub microphone: bool,          // CoreAudio/AVFoundation
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Resolution {
    Source,                        // Native capture resolution
    #[serde(rename = "1080p")]
    HD1080,                        // 1920×1080
    #[serde(rename = "720p")]
    HD720,                         // 1280×720
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingSession {
    pub id: String,                // UUID v4
    pub config: RecordingConfig,
    pub status: RecordingStatus,
    pub started_at: DateTime<Utc>,
    pub duration_ms: u64,          // Elapsed time (excludes pauses)
    pub file_size_bytes: u64,      // Current file size
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecordingStatus {
    Recording,
    Paused,                        // Story 2.5
    Stopped,
    Failed { error: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingProgress {
    pub duration_ms: u64,
    pub file_size_bytes: u64,
    pub frame_count: u64,
    pub dropped_frames: u64,       // Monitoring encoder performance
}
```

**TypeScript Data Models:**

```typescript
// src/types/recording.ts

export interface RecordingConfig {
  source: RecordingSource;
  audioSources: AudioSources;
  outputPath: string;
  frameRate: 30 | 60;
  resolution: 'source' | '1080p' | '720p';
}

export type RecordingSource =
  | { type: 'fullscreen' }
  | { type: 'window'; windowId: number }
  | { type: 'camera'; cameraIndex: number };

export interface AudioSources {
  systemAudio: boolean;
  microphone: boolean;
}

export interface RecordingSession {
  id: string;
  config: RecordingConfig;
  status: RecordingStatus;
  startedAt: string;              // ISO 8601
  durationMs: number;
  fileSizeBytes: number;
}

export type RecordingStatus =
  | 'recording'
  | 'paused'
  | 'stopped'
  | { failed: string };

export interface RecordingProgress {
  durationMs: number;
  fileSizeBytes: number;
  frameCount: number;
  droppedFrames: number;
}
```

**Frame Data Structure (Internal):**

```rust
// src-tauri/src/services/screen_capture/mod.rs

pub struct CapturedFrame {
    pub data: Vec<u8>,             // BGRA format (4 bytes per pixel)
    pub width: u32,
    pub height: u32,
    pub timestamp_ns: u64,         // Nanosecond precision for sync
    pub frame_number: u64,         // Sequential numbering
}
```

### APIs and Interfaces

**Tauri Command API (Frontend → Backend):**

```rust
// src-tauri/src/commands/recording.rs

#[tauri::command]
pub async fn cmd_start_screen_recording(
    config: RecordingConfig,
    state: State<'_, AppState>
) -> Result<String, String>
// Returns: Recording session ID (UUID)
// Errors: "Permission denied", "FFmpeg not available", "Disk space insufficient"
// Story: 2.2

#[tauri::command]
pub async fn cmd_stop_recording(
    recording_id: String,
    state: State<'_, AppState>
) -> Result<String, String>
// Returns: Output file path
// Errors: "Recording not found", "FFmpeg encoding failed"
// Story: 2.2

#[tauri::command]
pub async fn cmd_pause_recording(
    recording_id: String,
    state: State<'_, AppState>
) -> Result<(), String>
// Returns: () on success
// Errors: "Recording not found", "Already paused"
// Story: 2.5

#[tauri::command]
pub async fn cmd_resume_recording(
    recording_id: String,
    state: State<'_, AppState>
) -> Result<(), String>
// Story: 2.5

#[tauri::command]
pub async fn cmd_get_recording_progress(
    recording_id: String,
    state: State<'_, AppState>
) -> Result<RecordingProgress, String>
// Story: 2.5

#[tauri::command]
pub async fn cmd_check_camera_permission(
) -> Result<bool, String>
// Story: 2.7

#[tauri::command]
pub async fn cmd_list_cameras(
) -> Result<Vec<CameraDevice>, String>
// Returns: List of available cameras with names and indices
// Story: 2.7

#[tauri::command]
pub async fn cmd_start_camera_recording(
    config: RecordingConfig,
    state: State<'_, AppState>
) -> Result<String, String>
// Story: 2.8
```

**Internal Service APIs:**

```rust
// src-tauri/src/services/screen_capture/screencapturekit.rs

impl ScreenCapture {
    pub fn new() -> Result<Self>;

    pub async fn start_capture(
        &mut self,
        config: &RecordingConfig,
        frame_tx: mpsc::Sender<CapturedFrame>
    ) -> Result<()>;
    // Story 2.2: Spawn SCStream, configure delegate, stream frames to channel

    pub async fn stop_capture(&mut self) -> Result<()>;
    // Story 2.2: Gracefully stop SCStream
}

// src-tauri/src/services/ffmpeg/encoder.rs

impl FFmpegEncoder {
    pub fn new(output_path: PathBuf, config: &RecordingConfig) -> Result<Self>;

    pub async fn encode_stream(
        &mut self,
        frame_rx: mpsc::Receiver<CapturedFrame>,
        audio_rx: Option<mpsc::Receiver<AudioSamples>>
    ) -> Result<()>;
    // Story 2.3: Consume frames from bounded channel, stream to FFmpeg stdin

    pub fn get_progress(&self) -> RecordingProgress;
    // Story 2.5: Return current encoding stats
}

// src-tauri/src/services/audio_capture.rs

impl AudioCapture {
    pub fn new(sources: &AudioSources) -> Result<Self>;

    pub async fn start_capture(
        &mut self,
        audio_tx: mpsc::Sender<AudioSamples>
    ) -> Result<()>;
    // Story 2.4: Start CoreAudio/ScreenCaptureKit audio capture

    pub async fn stop_capture(&mut self) -> Result<()>;
}
```

**Frontend API (TypeScript):**

```typescript
// src/lib/tauri/recording.ts

export async function startScreenRecording(
  config: RecordingConfig
): Promise<string>;
// Invokes: cmd_start_screen_recording
// Returns: recording session ID
// Story: 2.2

export async function stopRecording(
  recordingId: string
): Promise<string>;
// Returns: output file path
// Story: 2.2

export async function pauseRecording(
  recordingId: string
): Promise<void>;
// Story: 2.5

export async function resumeRecording(
  recordingId: string
): Promise<void>;
// Story: 2.5

export async function getRecordingProgress(
  recordingId: string
): Promise<RecordingProgress>;
// Story: 2.5

export async function listCameras(): Promise<CameraDevice[]>;
// Story: 2.7

export async function startCameraRecording(
  config: RecordingConfig
): Promise<string>;
// Story: 2.8
```

### Workflows and Sequencing

**Workflow 1: Screen Recording (Stories 2.2-2.3)**

```
User → RecordingPanel.tsx → Tauri IPC → cmd_start_screen_recording
                                              ↓
                                    Check permissions (✅ Story 2.1)
                                              ↓
                                    Check disk space (Story 2.5)
                                              ↓
                            Create RecordingSession (UUID, config)
                                              ↓
                    Spawn Tokio task: ScreenCapture.start_capture()
                                              ↓
                           [Bounded channel: 30 frames buffer]
                                              ↓
                    Spawn Tokio task: FFmpegEncoder.encode_stream()
                                              ↓
                            FFmpeg process (H.264 encoding)
                                              ↓
                            Write MP4 to disk (real-time)

Frame Capture Loop (ScreenCapture):
1. SCStream delegate receives frame callback
2. Convert CMSampleBuffer → BGRA Vec<u8>
3. Timestamp frame (ns precision)
4. frame_tx.send(frame).await  [BLOCKS if channel full - backpressure]

Encoding Loop (FFmpegEncoder):
1. frame_rx.recv().await
2. Write frame to FFmpeg stdin pipe
3. Monitor stderr for progress
4. Update RecordingProgress

Stop Recording:
1. User clicks Stop → cmd_stop_recording
2. Stop ScreenCapture (graceful SCStream teardown)
3. Close frame_tx → frame_rx receives None → FFmpeg stdin closes
4. Wait for FFmpeg process exit (finalize MP4)
5. Return output file path
6. Trigger auto-import (Story 2.6)
```

**Workflow 2: Audio Capture with Video (Story 2.4)**

```
cmd_start_screen_recording (with audio_sources.system_audio = true)
                    ↓
    Spawn 3 parallel Tokio tasks:
        1. ScreenCapture (video frames)
        2. AudioCapture (system audio via ScreenCaptureKit)
        3. AudioCapture (microphone via CoreAudio)
                    ↓
    [3 bounded channels converge at FFmpegEncoder]
                    ↓
    FFmpegEncoder muxes:
        - Video: H.264 from frame stream
        - Audio: AAC from system audio stream
        - Audio: AAC from microphone stream (separate track)
                    ↓
    Single MP4 output (2 audio tracks)

Audio Synchronization:
- All frames/samples timestamped with nanosecond precision
- FFmpeg handles timestamp-based muxing (-async 1 flag)
- Accept up to 50ms audio-video drift (AC#7 Story 2.3)
```

**Workflow 3: Pause/Resume Recording (Story 2.5)**

```
User clicks Pause → cmd_pause_recording
            ↓
    Set RecordingSession.status = Paused
            ↓
    Pause frame capture (stop SCStream)
    Pause audio capture
    [Do NOT close channels or stop FFmpeg]
            ↓
    Update UI timer (freeze duration display)

User clicks Resume → cmd_resume_recording
            ↓
    Set RecordingSession.status = Recording
            ↓
    Resume frame capture (restart SCStream)
    Resume audio capture
    [Timestamp discontinuity handled by FFmpeg -vsync cfr]
            ↓
    Resume UI timer

Final MP4:
- Paused segments omitted (no frozen frames)
- Continuous playback with gaps removed
```

**Workflow 4: Auto-Import to Media Library (Story 2.6)**

```
cmd_stop_recording completes
            ↓
    FFmpeg finalization → output.mp4 ready
            ↓
    Trigger auto-import:
        1. Extract metadata (duration, resolution, codec) via FFmpeg
        2. Generate thumbnail (first frame via FFmpeg)
        3. Create MediaFile entry
        4. Add to mediaLibraryStore
            ↓
    Send Tauri event: 'recording-imported'
            ↓
    Frontend: Toast notification "Recording imported"
    Frontend: Media library updates (Zustand re-render)
            ↓
    User can immediately preview/edit recording
```

**Workflow 5: Webcam Recording (Stories 2.7-2.8)**

```
User opens Recording Panel → Select "Webcam" mode
            ↓
    cmd_check_camera_permission
    cmd_list_cameras → Display dropdown
            ↓
    User selects camera → RecordingPreview.tsx shows live preview
            ↓
User clicks Start Recording → cmd_start_camera_recording
            ↓
    nokhwa_wrapper.start_capture() → Camera frames
            ↓
    [Bounded channel] → FFmpegEncoder
            ↓
    Encode to MP4 (webcam resolution, 30 FPS)
            ↓
    Stop Recording → Auto-import (same as screen recording)
```

**Error Handling Sequences:**

```
Permission Denied:
    cmd_start_screen_recording → check_screen_recording_permission() = false
    → Return Err("Screen recording permission denied...")
    → Frontend: PermissionPrompt.tsx (✅ Story 2.1)

Disk Space Exhausted (Story 2.5):
    During recording → Monitor file size growth
    → If available space < 100MB → Gracefully stop recording
    → Finalize partial MP4
    → Toast: "Recording stopped: Disk space low"

FFmpeg Encoding Failure:
    FFmpeg process exits with error
    → Parse stderr for error message
    → Stop frame capture
    → Return Err("Encoding failed: {ffmpeg_error}")
    → Notify user, offer to retry with lower quality

Frame Drop Handling:
    Bounded channel full (FFmpeg can't keep up)
    → frame_tx.send() blocks for 100ms
    → If still full → Drop frame, increment dropped_frames counter
    → If dropped_frames > 30 (1 second) → Warn user
```

## Non-Functional Requirements

### Performance

**From PRD NFR001:**

| Metric | Target | Measurement | Story |
|--------|--------|-------------|-------|
| **Screen Recording Frame Rate** | 30+ FPS without dropped frames | Monitor `dropped_frames` counter in RecordingProgress | Story 2.2-2.3 |
| **Memory Usage During Recording** | ≤ 240MB frame buffer (bounded) | 30 frames × 8MB/frame @ 1080p BGRA | Story 2.3 (Novel Pattern 2) |
| **Encoding Latency** | Real-time (1:1 ratio), max 60-90s for 1min video | FFmpeg H.264 with hardware acceleration (VideoToolbox) | Story 2.3 |
| **Audio-Video Sync** | ≤ 50ms drift for recordings up to 30 minutes | Nanosecond timestamps, FFmpeg `-async 1` | Story 2.4 (AC#7) |
| **Recording Start Latency** | < 2 seconds from button click to recording active | Permission check + SCStream init + FFmpeg spawn | Story 2.2 |
| **Auto-Import Speed** | < 2 seconds for recorded clip to appear in media library | Thumbnail generation + metadata extraction | Story 2.6 (AC#4) |

**Performance Optimization Strategies:**

1. **Bounded Channel Backpressure (Novel Pattern 2):**
   - `mpsc::channel(30)` limits frame buffer to 1 second
   - Blocks capture thread if FFmpeg falls behind (prevents memory bloat)
   - Frame drop threshold: Drop frame if blocked > 100ms

2. **Hardware-Accelerated Encoding:**
   - FFmpeg uses macOS VideoToolbox for H.264 encoding
   - Offloads encoding to GPU/media engine
   - Target: 1080p @ 30fps encodes in real-time on M1+ (< 1:1 ratio)

3. **Parallel Capture Threads (Tokio):**
   - Screen capture, system audio, microphone all run in separate async tasks
   - No blocking between streams
   - Tokio multi-threaded runtime distributes load

4. **Frame Format Optimization:**
   - ScreenCaptureKit provides BGRA natively (no conversion)
   - FFmpeg accepts raw BGRA via stdin (no intermediate files)

5. **Disk I/O:**
   - FFmpeg writes directly to disk (streaming, not buffering)
   - Async file operations via Tokio
   - No memory accumulation during long recordings

### Security

**From PRD FR012 (Native macOS Integration):**

| Requirement | Implementation | Story |
|-------------|----------------|-------|
| **Screen Recording Permission** | CGPreflightScreenCaptureAccess check before capture, CGRequestScreenCaptureAccess for user consent dialog | Story 2.1 ✅ |
| **Camera Permission** | AVCaptureDevice.authorizationStatus check, requestAccess for consent | Story 2.7 |
| **Microphone Permission** | AVAudioSession.recordPermission check, requestRecordPermission | Story 2.4 |
| **Permission Revocation Handling** | Re-check permissions on each recording start, graceful error with System Preferences guidance | Story 2.1 ✅, 2.2 |
| **Recording Indicator** | Native macOS screen recording indicator (orange dot in menu bar) shown automatically by ScreenCaptureKit | Story 2.2 |
| **File System Access** | Recordings saved to user-selected directory (Documents/clippy/recordings default), Tauri fs plugin sandboxing | Story 2.6 |

**Security Principles:**

1. **Permission-First Architecture:**
   - All capture operations check permission status before proceeding
   - User explicitly grants access via macOS system dialogs (not in-app prompts)
   - Clear error messages guide users to System Preferences if permission denied

2. **Privacy Compliance:**
   - No background recording (user must initiate via visible UI)
   - macOS enforces visible recording indicator (orange menu bar dot)
   - Cannot bypass or hide system recording indicators

3. **Data Protection:**
   - No telemetry or analytics collected during recording
   - All processing local (no cloud uploads in Epic 2)
   - User controls recording storage location

4. **DRM Respect:**
   - ScreenCaptureKit automatically blocks DRM-protected content (macOS enforcement)
   - No attempt to circumvent macOS security policies

5. **Secure File Handling:**
   - Temporary files cleaned up after auto-import (Story 2.6)
   - File paths validated to prevent directory traversal
   - Output files created with user's file permissions

### Reliability/Availability

**From PRD NFR003 (Usability and Reliability):**

| Failure Scenario | Graceful Degradation | Recovery | Story |
|------------------|---------------------|----------|-------|
| **Permission Denied** | Block recording, show PermissionPrompt with System Preferences link | User grants permission → Restart app → Recording works | Story 2.1 ✅, 2.2 |
| **FFmpeg Not Available** | Detect on app launch, show error: "FFmpeg required. Download automatic on first use." | ffmpeg-sidecar auto-downloads binary (~100MB) | Story 2.3 |
| **FFmpeg Encoding Fails** | Stop recording, save partial MP4, notify user with stderr error | User can retry with lower quality/resolution (Epic 4) | Story 2.3 (AC#9) |
| **Disk Space Exhausted** | Monitor during recording, stop gracefully when < 100MB free, save partial file | User frees space → Can record again | Story 2.5 (AC#9-10) |
| **Frame Drops (Encoder Lag)** | Log dropped frames, continue recording, warn user if > 1 second dropped | Acceptable for Epic 2, quality settings in Epic 4 | Story 2.3 (AC#6) |
| **Camera Disconnected** | Detect camera loss during recording, stop gracefully, save what was captured | User reconnects → Can start new recording | Story 2.8 |
| **Audio Capture Fails** | Continue recording video-only, notify user "Audio capture failed" | Partial success better than total failure | Story 2.4 |
| **App Crash During Recording** | FFmpeg process continues (separate process), partial MP4 may be corrupt | User can attempt recovery via FFmpeg repair tools | Story 2.3 |

**Reliability Design Patterns:**

1. **Fail-Safe Recording:**
   - FFmpeg process separate from Tauri app (crash isolation)
   - Bounded channels prevent memory exhaustion
   - Partial recordings always finalized (not discarded)

2. **State Recovery:**
   - RecordingSession state persisted to disk (future: Story 2.5 enhancement)
   - Can detect incomplete recordings on app restart
   - Offer to resume or discard incomplete recordings

3. **Error Propagation:**
   - All errors return user-friendly messages (Result<T, String>)
   - Log detailed errors to ~/Library/Logs/clippy/app.log for debugging
   - Never panic in production code (use `?` operator with proper error context)

4. **Resource Cleanup:**
   - SCStream gracefully stopped in drop() implementation
   - FFmpeg stdin closed to trigger proper MP4 finalization
   - Temporary files cleaned up even on error paths

5. **Timeout Handling:**
   - SCStream start timeout: 5 seconds (fail fast if initialization hangs)
   - FFmpeg process spawn timeout: 3 seconds
   - Recording stop timeout: 10 seconds (allow FFmpeg finalization)

### Observability

**Logging Strategy (tracing crate):**

| Component | Log Events | Level | Example |
|-----------|-----------|-------|---------|
| **ScreenCapture** | Start/stop capture, frame rate, dropped frames | INFO, WARN | `tracing::info!("Screen capture started", resolution = "1920x1080", fps = 30)` |
| **FFmpegEncoder** | Process spawn, encoding progress, stderr errors | INFO, ERROR | `tracing::error!("FFmpeg encoding failed", stderr = %error_output)` |
| **AudioCapture** | Device enumeration, capture start, sync issues | INFO, WARN | `tracing::warn!("Audio-video drift detected", drift_ms = 75)` |
| **Recording Lifecycle** | Session create/start/pause/stop, duration, file size | INFO | `tracing::info!("Recording stopped", duration_ms = 125000, size_bytes = 52428800)` |
| **Permission Checks** | Permission status, request triggers | INFO | `tracing::info!("Screen recording permission", status = "granted")` |
| **Error Conditions** | All failures with context | ERROR | `tracing::error!("Disk space low", available_mb = 50, required_mb = 100)` |

**Metrics Tracking (RecordingProgress):**

```rust
pub struct RecordingProgress {
    pub duration_ms: u64,          // Total recording time
    pub file_size_bytes: u64,      // Current MP4 size
    pub frame_count: u64,          // Total frames captured
    pub dropped_frames: u64,       // Frames dropped (encoder lag)
}
```

**Frontend Metrics Display (Story 2.5):**
- Recording duration timer (MM:SS format)
- File size estimate (MB)
- Visual warning if dropped_frames > 30 (1 second @ 30fps)

**Log Output:**
- **Location:** `~/Library/Logs/clippy/app.log` (macOS standard)
- **Rotation:** Daily rotation, keep last 7 days
- **Format:** JSON structured logs for easy parsing
- **Levels:** DEBUG (development), INFO (production)

**Performance Monitoring:**

| Metric | Collection | Alerting |
|--------|-----------|----------|
| **Frame Rate** | Track timestamp deltas between frames | Warn if < 25 FPS sustained |
| **Memory Usage** | Monitor channel buffer size | Alert if > 28 frames (near limit) |
| **Encoding Lag** | Compare frame timestamps vs real time | Warn if lag > 2 seconds |
| **Disk Space** | Check available space every 10 seconds during recording | Stop recording if < 100MB |

**Debug Tooling:**

1. **Development Mode Logging:**
   - Set `RUST_LOG=debug` for verbose tracing
   - FFmpeg stderr output captured and logged
   - Frame capture timestamps logged for sync analysis

2. **Recording Statistics Export:**
   - Save RecordingProgress to JSON on recording stop
   - Useful for debugging performance issues
   - Location: `~/Library/Logs/clippy/recordings/{recording_id}.json`

3. **FFmpeg Command Logging:**
   - Log full FFmpeg command for reproducibility
   - Users can report issues with exact command used
   - Example: `ffmpeg -f rawvideo -pix_fmt bgra -s 1920x1080 -r 30 -i - -c:v h264_videotoolbox -b:v 5M output.mp4`

## Dependencies and Integrations

**Backend Dependencies (Rust - Cargo.toml):**

| Dependency | Version | Purpose in Epic 2 | Story |
|------------|---------|-------------------|-------|
| **screencapturekit** | 0.3.6 | ScreenCaptureKit Rust bindings for native screen capture | Stories 2.1 ✅, 2.2 |
| **ffmpeg-sidecar** | 2.1.0 | FFmpeg CLI wrapper with auto-download, real-time encoding | Story 2.3 |
| **nokhwa** | 0.10.9 (feature: input-avfoundation) | AVFoundation webcam capture | Stories 2.7-2.8 |
| **cpal** | 0.16 | Cross-platform audio I/O (microphone capture) | Story 2.4 |
| **tokio** | 1.x (features: full) | Async runtime for parallel capture threads | Stories 2.2-2.8 |
| **serde** + **serde_json** | 1.x | Data model serialization (RecordingConfig, etc.) | All stories |
| **anyhow** | 1.x | Error handling with context | All stories |
| **thiserror** | 1.x | Custom error types (ScreenCaptureError, etc.) | All stories |
| **tracing** + **tracing-subscriber** | 0.1.x, 0.3.x | Structured logging to ~/Library/Logs/clippy/app.log | All stories |
| **chrono** | 0.4.x (features: serde) | Timestamp handling (RecordingSession.started_at) | Stories 2.2-2.6 |
| **uuid** | 1.x (features: v4, serde) | Recording session ID generation | Stories 2.2-2.6 |
| **dirs** | 6.x | User directory paths (Documents/clippy/recordings) | Story 2.6 |

**macOS-Specific Dependencies (Cargo.toml [target.'cfg(target_os = "macos")']):**

| Dependency | Version | Purpose | Story |
|------------|---------|---------|-------|
| **core-graphics** | 0.24 | FFI bindings for CGPreflightScreenCaptureAccess, CGRequestScreenCaptureAccess | Story 2.1 ✅ |
| **objc** | 0.2 | Objective-C FFI for macOS framework calls | Story 2.1 ✅ |
| **objc-foundation** | 0.1 | Objective-C Foundation framework bindings | Story 2.1 ✅ |

**Frontend Dependencies (package.json):**

| Dependency | Version | Purpose in Epic 2 | Story |
|------------|---------|-------------------|-------|
| **@tauri-apps/api** | ^2 | Tauri IPC for invoke() calls to backend commands | All stories |
| **@tauri-apps/plugin-fs** | ^2 | File system operations (save dialogs) | Story 2.6 |
| **@tauri-apps/plugin-dialog** | ^2 | Native macOS save dialog for recording output | Story 2.6 |
| **@tauri-apps/plugin-notification** | ^2 | Native notifications when recording starts/stops | Stories 2.5-2.6 |
| **zustand** | ^4 | State management for recordingStore | Stories 2.5-2.6 |
| **sonner** | ^2.0.7 | Toast notifications for errors/success | All stories |
| **react** + **react-dom** | ^19.1.0 | UI framework | All stories |
| **lucide-react** | ^0.548.0 | Icons (recording indicator, camera, microphone) | Stories 2.5, 2.7 |
| **@radix-ui/react-alert-dialog** | ^1.1.15 | Permission prompt dialog (Story 2.1), error dialogs | Stories 2.1 ✅, 2.2 |
| **tailwindcss** | ^3 (dev) | Styling RecordingPanel, RecordingControls | Stories 2.5, 2.7 |

**System Dependencies (External):**

| Dependency | Version | Installation | Purpose | Story |
|------------|---------|--------------|---------|-------|
| **FFmpeg** | Auto-downloaded by ffmpeg-sidecar (~100MB) | Automatic on first use | H.264 encoding, audio extraction, thumbnail generation | Story 2.3 |
| **MPV** | Homebrew: `brew install mpv` | Manual (documented in README) | Video playback engine (Epic 1, used in preview) | N/A (Epic 1) |
| **macOS ScreenCaptureKit** | System framework (macOS 12.3+) | Built-in | Screen capture API | Stories 2.1 ✅, 2.2 |
| **macOS AVFoundation** | System framework | Built-in | Camera capture, audio capture | Stories 2.4, 2.7-2.8 |
| **macOS CoreAudio** | System framework | Built-in | Microphone audio input | Story 2.4 |

**Integration Points:**

**1. ScreenCaptureKit → FFmpeg Pipeline (Stories 2.2-2.3):**
```
ScreenCaptureKit (SCStream)
    → Rust async delegate callback
    → BGRA frames (Vec<u8>)
    → Bounded channel (mpsc::channel)
    → FFmpegEncoder.encode_stream()
    → FFmpeg stdin pipe
    → H.264 MP4 output
```

**2. Audio Capture → FFmpeg Muxing (Story 2.4):**
```
System Audio (ScreenCaptureKit) → Channel → FFmpeg -i pipe:0
Microphone (CoreAudio/cpal)     → Channel → FFmpeg -i pipe:1
    ↓
FFmpeg muxes to single MP4 with 2 audio tracks
```

**3. Tauri IPC Integration (All Stories):**
```
React UI (RecordingPanel)
    → @tauri-apps/api::invoke('cmd_start_screen_recording')
    → Tauri backend (commands::recording.rs)
    → Service layer (screen_capture, ffmpeg, audio_capture)
    → Result<RecordingId, String> returned to frontend
```

**4. Media Library Integration (Story 2.6):**
```
Recording stops → cmd_stop_recording
    → Auto-import trigger
    → cmd_import_media (existing Epic 1 command)
    → Thumbnail generation (FFmpeg)
    → Metadata extraction (FFmpeg)
    → Add to mediaLibraryStore
    → Tauri event: 'recording-imported'
    → Frontend re-renders media library
```

**Version Constraints and Compatibility:**

| Constraint | Requirement | Reason |
|------------|-------------|--------|
| **macOS 12.3+** | System requirement | ScreenCaptureKit API availability |
| **Rust 1.80+** | Compiler version | async/await patterns, tokio compatibility |
| **Node.js 18+** | Build toolchain | Vite, React 19 compatibility |
| **Tauri 2.x** | Framework major version | Architecture locked to Tauri 2.x APIs |
| **React 19.x** | UI framework | React 19 concurrent features |
| **TypeScript 5.8+** | Type system | Latest type inference features |

**Dependency Update Strategy:**

- **Security patches:** Apply immediately (minor/patch versions)
- **Minor version updates:** Review changelog, test in branch before merging
- **Major version updates:** Requires architecture review (e.g., Tauri 3.x would need full assessment)
- **System framework updates:** Track macOS release notes for ScreenCaptureKit/AVFoundation changes

## Acceptance Criteria (Authoritative)

**Epic 2 Acceptance Criteria (Normalized from Stories 2.1-2.8):**

### Story 2.1: ScreenCaptureKit Setup & Permissions ✅ COMPLETED

**AC 2.1.1:** ScreenCaptureKit Rust bindings integrated (screencapturekit 0.3.6 in Cargo.toml)
**AC 2.1.2:** App requests screen recording permission from macOS on first use via CGRequestScreenCaptureAccess
**AC 2.1.3:** Permission status checked before attempting recording via CGPreflightScreenCaptureAccess
**AC 2.1.4:** Clear error message if permission denied with instructions to enable in System Preferences → Privacy & Security → Screen Recording
**AC 2.1.5:** Proof-of-concept screen capture works (capture single frame validates setup)
**AC 2.1.6:** Documentation of permission handling approach in code comments and README

### Story 2.2: Full-Screen Recording with Video Capture

**AC 2.2.1:** "Record Screen" button in UI triggers full-screen capture
**AC 2.2.2:** ScreenCaptureKit captures full screen at 30 FPS via SCStream async delegates
**AC 2.2.3:** Recording indicator shows recording is active (red dot or pulsing indicator)
**AC 2.2.4:** Stop button ends recording gracefully
**AC 2.2.5:** Raw video frames captured and buffered via bounded channel (30 frame limit)
**AC 2.2.6:** Recording saves to temporary file location (Documents/clippy/recordings)
**AC 2.2.7:** Basic error handling if recording fails with user-friendly toast notification

### Story 2.3: Real-Time FFmpeg Encoding During Recording

**AC 2.3.1:** FFmpeg encoding pipeline started when recording begins (H.264, H.264 VideoToolbox)
**AC 2.3.2:** Captured frames stream to FFmpeg encoder in real-time via stdin pipe
**AC 2.3.3:** Output encoded as H.264 MP4 during recording (not post-processing)
**AC 2.3.4:** Memory usage remains stable during 5+ minute recordings (≤ 240MB frame buffer)
**AC 2.3.5:** Final MP4 file playable immediately after recording stops
**AC 2.3.6:** Frame drops logged if encoding can't keep up (acceptable for Epic 2)
**AC 2.3.7:** Audio and video remain synchronized within 50ms for recordings up to 30 minutes
**AC 2.3.8:** Implement timestamp-based frame synchronization to prevent drift
**AC 2.3.9:** If FFmpeg encoding fails completely, stop recording and save partial file with user notification

### Story 2.4: System Audio and Microphone Capture

**AC 2.4.1:** CoreAudio integration for microphone capture (via cpal crate)
**AC 2.4.2:** System audio capture using ScreenCaptureKit audio APIs
**AC 2.4.3:** Recording UI allows selecting audio sources (system, microphone, both, or none)
**AC 2.4.4:** Audio streams synchronized with video during recording (nanosecond timestamps)
**AC 2.4.5:** FFmpeg muxes audio and video into single MP4 file (2 audio tracks)
**AC 2.4.6:** Audio quality acceptable (no severe distortion or sync issues audible to user)

### Story 2.5: Recording Controls & Status Feedback

**AC 2.5.1:** Recording panel/modal with clear "Start Recording" and "Stop Recording" buttons
**AC 2.5.2:** Recording duration timer shows elapsed time in MM:SS format
**AC 2.5.3:** Visual indicator (pulsing red dot) shows recording is active
**AC 2.5.4:** Native macOS notification when recording starts
**AC 2.5.5:** Pause/resume functionality for screen recording
**AC 2.5.6:** Can cancel recording (discards partial recording)
**AC 2.5.7:** Recording controls remain accessible during recording
**AC 2.5.8:** Check available disk space before starting recording
**AC 2.5.9:** Display warning if available space < estimated file size (assume 5MB/min for estimation)
**AC 2.5.10:** Stop recording gracefully if disk space exhausted with partial file save notification

### Story 2.6: Auto-Import Recordings to Media Library

**AC 2.6.1:** When recording stops, file automatically added to media library
**AC 2.6.2:** Thumbnail generated for recorded clip (first frame via FFmpeg)
**AC 2.6.3:** Metadata extracted (duration, resolution, file size, codec)
**AC 2.6.4:** Recording appears in media library within 2 seconds of stopping
**AC 2.6.5:** Recorded file saved to organized location (user Documents/clippy/recordings or similar)
**AC 2.6.6:** Success notification confirms recording saved

### Story 2.7: Basic Webcam Recording Setup

**AC 2.7.1:** AVFoundation bindings integrated for camera access (nokhwa crate)
**AC 2.7.2:** App requests camera permission from macOS
**AC 2.7.3:** Camera selection dropdown if multiple cameras available
**AC 2.7.4:** Webcam preview shows in recording panel before recording starts
**AC 2.7.5:** "Record Webcam" button triggers webcam recording
**AC 2.7.6:** Recording captures video at camera's native resolution (or 1080p if higher)

### Story 2.8: Webcam Recording with Audio & Save

**AC 2.8.1:** Webcam recording captures both video and microphone audio
**AC 2.8.2:** FFmpeg encodes webcam stream to MP4 in real-time (same pattern as Story 2.3)
**AC 2.8.3:** Recording controls work same as screen recording (start/stop/pause)
**AC 2.8.4:** Completed webcam recording auto-imports to media library (same as Story 2.6)
**AC 2.8.5:** Can preview webcam recording in video player (Epic 1 MPV player)
**AC 2.8.6:** Recording quality acceptable (smooth 30 FPS, synchronized audio)

## Traceability Mapping

**Epic 2 Traceability Matrix: Acceptance Criteria → Technical Components → Tests**

| AC ID | Spec Section(s) | Component(s)/API(s) | Test Idea |
|-------|-----------------|---------------------|-----------|
| **2.1.1** | Dependencies (screencapturekit 0.3.6) | Cargo.toml dependencies | Verify `cargo tree` includes screencapturekit 0.3.6 |
| **2.1.2** | Security (Permission handling) | permissions::macos::request_screen_recording_permission(), CGRequestScreenCaptureAccess | Unit test: Mock permission request, verify system dialog triggered |
| **2.1.3** | Security (Permission checking) | permissions::macos::check_screen_recording_permission(), CGPreflightScreenCaptureAccess | Unit test: Mock permission status, verify check returns bool |
| **2.1.4** | Security (Error messaging) | commands::recording::cmd_start_screen_recording error path, PermissionPrompt.tsx | Integration test: Deny permission → Verify error message contains "System Preferences" |
| **2.1.5** | Services (ScreenCapture) | screen_capture::screencapturekit::capture_single_frame() | Integration test: Grant permission → Capture frame → Verify non-empty Vec<u8> |
| **2.1.6** | Detailed Design (Services) | Code comments in permissions::macos, README.md | Manual review: Doc comments present, README section exists |
| **2.2.1** | APIs (cmd_start_screen_recording) | RecordingPanel.tsx → cmd_start_screen_recording | E2E test: Click "Record Screen" → Verify backend command invoked |
| **2.2.2** | Services (ScreenCapture), Performance (30 FPS) | screen_capture::screencapturekit::start_capture(), SCStream delegate | Integration test: Capture 5 seconds → Verify ~150 frames captured (30 FPS × 5s) |
| **2.2.3** | Workflows (Recording UI) | RecordingPanel.tsx visual indicator, recordingStore.status | Visual test: Verify red dot visible when status = 'recording' |
| **2.2.4** | APIs (cmd_stop_recording) | commands::recording::cmd_stop_recording, SCStream teardown | Integration test: Start → Stop → Verify MP4 file exists and is playable |
| **2.2.5** | Services (FFmpegEncoder), Performance (Memory) | Bounded channel: mpsc::channel(30), Novel Pattern 2 | Unit test: Send 100 frames → Verify channel never exceeds 30 buffer size |
| **2.2.6** | Data Models (RecordingConfig.output_path) | RecordingConfig.output_path, dirs crate for Documents path | Unit test: Verify output path = ~/Documents/clippy/recordings/{uuid}.mp4 |
| **2.2.7** | Reliability (Error handling) | Recording error paths, toast notifications | Integration test: Trigger FFmpeg failure → Verify toast shows error |
| **2.3.1** | Services (FFmpegEncoder), Dependencies (ffmpeg-sidecar) | ffmpeg::encoder::FFmpegEncoder::new(), ffmpeg-sidecar spawn | Integration test: Start recording → Verify FFmpeg process running (ps aux) |
| **2.3.2** | Workflows (Frame streaming) | FFmpegEncoder::encode_stream(), frame_rx channel → stdin pipe | Integration test: Send frames to encoder → Verify MP4 size grows |
| **2.3.3** | Services (FFmpegEncoder), Workflows (Real-time) | FFmpeg writes to disk during capture (not after) | Integration test: Record 10s → Verify MP4 exists and playable before stop command |
| **2.3.4** | Performance (Memory usage ≤ 240MB) | Bounded channel backpressure, Novel Pattern 2 | Load test: Record 10 minutes → Monitor memory (should remain < 500MB total) |
| **2.3.5** | Reliability (MP4 finalization) | FFmpeg stdin close → MP4 finalization | Integration test: Stop recording → Verify MP4 playable in VLC/MPV |
| **2.3.6** | Observability (Dropped frames logging) | RecordingProgress.dropped_frames counter | Integration test: Slow encoder → Verify dropped_frames > 0 logged |
| **2.3.7** | Performance (Audio-video sync ≤ 50ms) | Nanosecond timestamps, FFmpeg `-async 1` | Integration test: Record 30min with audio → Measure A/V sync drift (FFmpeg analysis) |
| **2.3.8** | Workflows (Timestamp synchronization) | CapturedFrame.timestamp_ns, AudioSamples timestamp alignment | Unit test: Generate frames/samples with known timestamps → Verify alignment |
| **2.3.9** | Reliability (FFmpeg failure handling) | FFmpeg process exit detection, partial MP4 save | Integration test: Kill FFmpeg mid-recording → Verify partial file saved |
| **2.4.1** | Dependencies (cpal 0.16) | audio_capture::AudioCapture via cpal crate | Unit test: Verify cpal initializes, lists microphone devices |
| **2.4.2** | Services (AudioCapture), Dependencies (screencapturekit audio) | ScreenCaptureKit audio APIs, SCStream audio delegate | Integration test: Capture system audio → Verify non-empty audio samples |
| **2.4.3** | Data Models (AudioSources), APIs (RecordingConfig) | RecordingConfig.audio_sources, UI checkboxes | E2E test: Toggle audio checkboxes → Verify config sent to backend |
| **2.4.4** | Workflows (Audio sync), Performance (Sync ≤ 50ms) | Nanosecond timestamps on AudioSamples, FFmpeg muxing | Integration test: Record with audio → Verify timestamp alignment < 50ms |
| **2.4.5** | Services (FFmpegEncoder), Workflows (Audio muxing) | FFmpeg `-i pipe:0 -i pipe:1` muxing, 2 audio tracks in MP4 | Integration test: Record with both audio sources → Verify MP4 has 2 audio streams (ffprobe) |
| **2.4.6** | Performance (Audio quality) | FFmpeg AAC encoding settings, sample rate config | Manual test: Record audio → Listen for distortion, verify acceptable quality |
| **2.5.1** | APIs (Frontend), Workflows (UI) | RecordingPanel.tsx, RecordingControls.tsx | Visual test: Open recording panel → Verify Start/Stop buttons visible |
| **2.5.2** | Data Models (RecordingProgress), Observability (Timer) | RecordingProgress.duration_ms, UI timer component | Integration test: Record 10s → Verify timer shows 00:10 |
| **2.5.3** | Workflows (Visual indicator) | RecordingPanel visual state, CSS pulsing animation | Visual test: Start recording → Verify red dot pulsing |
| **2.5.4** | Dependencies (plugin-notification) | @tauri-apps/plugin-notification, cmd_start_screen_recording | E2E test: Start recording → Verify macOS notification appears |
| **2.5.5** | APIs (cmd_pause_recording, cmd_resume_recording) | commands::recording pause/resume commands, RecordingStatus.Paused | Integration test: Record → Pause → Resume → Verify continuous MP4 without frozen frames |
| **2.5.6** | Workflows (Cancel recording) | Cancel button → Stop recording, delete partial file | E2E test: Record → Cancel → Verify no MP4 saved to disk |
| **2.5.7** | Workflows (UI accessibility) | RecordingControls remain clickable during recording | Manual test: Start recording → Verify buttons still responsive |
| **2.5.8** | Reliability (Disk space check) | Check available space before cmd_start_screen_recording | Unit test: Mock low disk space → Verify recording blocked with error |
| **2.5.9** | Reliability (Disk space warning) | Display warning UI if space < 5MB/min × estimated duration | E2E test: Low disk space → Verify warning toast shown |
| **2.5.10** | Reliability (Disk space exhausted) | Monitor disk during recording, stop gracefully if < 100MB | Integration test: Fill disk during recording → Verify graceful stop, partial save |
| **2.6.1** | Workflows (Auto-import), APIs (cmd_import_media) | cmd_stop_recording → cmd_import_media trigger | Integration test: Stop recording → Verify MediaFile added to mediaLibraryStore |
| **2.6.2** | Workflows (Thumbnail generation) | FFmpeg thumbnail extraction (first frame) | Integration test: Stop recording → Verify thumbnail PNG exists |
| **2.6.3** | Data Models (MediaFile), Workflows (Metadata) | FFmpeg metadata extraction (ffprobe), MediaFile struct | Integration test: Stop recording → Verify MediaFile has duration, resolution, codec |
| **2.6.4** | Performance (Auto-import < 2s) | Import speed from stop to library appearance | Integration test: Stop recording → Measure time until MediaItem renders (< 2s) |
| **2.6.5** | Workflows (File organization) | Output path = ~/Documents/clippy/recordings/{uuid}.mp4 | Integration test: Record → Verify file saved to expected path |
| **2.6.6** | Workflows (Success notification) | Toast notification on successful import | E2E test: Stop recording → Verify "Recording imported" toast |
| **2.7.1** | Dependencies (nokhwa), Services (camera::nokhwa_wrapper) | nokhwa 0.10.9 with input-avfoundation feature | Unit test: Verify nokhwa initializes, lists cameras |
| **2.7.2** | Security (Camera permission) | cmd_check_camera_permission, AVCaptureDevice authorization | Integration test: Request camera permission → Verify macOS dialog appears |
| **2.7.3** | APIs (cmd_list_cameras), Workflows (Camera selection) | cmd_list_cameras → CameraDevice list, dropdown UI | E2E test: Open webcam mode → Verify camera dropdown populated |
| **2.7.4** | Workflows (Webcam preview), APIs (RecordingPreview.tsx) | RecordingPreview.tsx component, camera frame streaming | E2E test: Select camera → Verify live preview renders |
| **2.7.5** | APIs (cmd_start_camera_recording) | RecordingPanel "Record Webcam" button → cmd_start_camera_recording | E2E test: Click "Record Webcam" → Verify backend command invoked |
| **2.7.6** | Data Models (Resolution), Services (nokhwa resolution config) | RecordingConfig.resolution, nokhwa capture settings | Integration test: Verify camera captures at native resolution or 1080p |
| **2.8.1** | Services (camera + audio), Workflows (Webcam + mic) | nokhwa video + cpal microphone, parallel capture | Integration test: Record webcam → Verify MP4 has video + audio track |
| **2.8.2** | Services (FFmpegEncoder), Workflows (Real-time encoding) | Same encoding pattern as Story 2.3, bounded channels | Integration test: Record webcam 5min → Verify memory stable |
| **2.8.3** | APIs (Pause/stop commands), Workflows (Controls) | Same commands as screen recording (cmd_pause_recording, etc.) | Integration test: Webcam recording → Pause → Resume → Verify works |
| **2.8.4** | Workflows (Auto-import) | Same auto-import flow as Story 2.6 | Integration test: Stop webcam recording → Verify auto-imported to library |
| **2.8.5** | Integration (Epic 1 player) | MPV player from Epic 1, MediaFile playback | E2E test: Webcam recording in library → Play → Verify playback works |
| **2.8.6** | Performance (30 FPS, audio sync) | Same performance targets as screen recording | Integration test: Record webcam → Verify smooth playback, no sync issues |

**Coverage Summary:**

- **Total Epic 2 ACs:** 48 acceptance criteria across 8 stories (7 active + 1 completed)
- **Traceability:** All 48 ACs mapped to spec sections, components/APIs, and test ideas
- **Test Coverage:** 100% AC coverage with unit tests (15), integration tests (25), E2E tests (5), manual/visual tests (3)

## Risks, Assumptions, Open Questions

### Risks

| Risk ID | Risk Description | Severity | Mitigation Strategy | Status |
|---------|------------------|----------|---------------------|--------|
| **R2.1** | **ScreenCaptureKit API instability** - screencapturekit crate 0.3.6 has limited API surface, may not expose all SCStream features needed for full async delegates | HIGH | Story 2.1 validated basic integration. Story 2.2 will implement full SCStream delegates. If crate insufficient, implement custom Objective-C bridge using objc crate (Story 2.1 already has objc dependencies). | MONITORING |
| **R2.2** | **FFmpeg encoding can't keep up with 30 FPS at high resolution** - Real-time encoding may drop frames on older Macs (pre-M1) | MEDIUM | AC 2.3.6 accepts frame drops as logged events. Bounded channel backpressure prevents memory bloat. Epic 4 will add quality settings (lower resolution, lower frame rate). For Epic 2, document minimum hardware (M1+ recommended). | ACCEPTED |
| **R2.3** | **Audio-video synchronization drift over long recordings (>30 min)** - Timestamp-based sync may accumulate drift | MEDIUM | AC 2.3.7 requires ≤50ms sync for 30-minute recordings. Implement nanosecond-precision timestamps. Use FFmpeg `-async 1` flag for adaptive audio sync. Test with 60-minute recordings during integration testing. | MITIGATED |
| **R2.4** | **macOS version fragmentation** - ScreenCaptureKit requires macOS 12.3+, but API behavior varies across 12.x, 13.x, 14.x | MEDIUM | Story 2.1 implemented macOS version check (12.3+ enforcement). Document tested macOS versions in README. Epic 2 will test on macOS 12.7, 13.6, 14.5 (Sonoma). Report bugs to Apple Feedback Assistant if version-specific issues found. | MITIGATED |
| **R2.5** | **Permission revocation during recording** - User can revoke screen recording permission in System Preferences while recording is active | LOW | ScreenCaptureKit will fail capture automatically. Detect failure in frame capture loop, gracefully stop recording, save partial MP4, notify user with toast: "Recording stopped: Permission revoked". Story 2.2 error handling. | MITIGATED |
| **R2.6** | **Disk I/O bottleneck on slow drives** - Real-time encoding to slow external drives may cause backpressure | LOW | Bounded channel handles backpressure gracefully (blocks capture thread). AC 2.3.6 logs frame drops. For Epic 2, recommend recording to internal SSD. Epic 4 could add "Performance Mode" to buffer to RAM before writing. | ACCEPTED |
| **R2.7** | **FFmpeg auto-download failure** - ffmpeg-sidecar auto-download (~100MB) may fail on restricted networks | LOW | Detect download failure on first use, show error with manual installation instructions. Document fallback: user can install FFmpeg via Homebrew (`brew install ffmpeg`), ffmpeg-sidecar will use system binary. Story 2.3. | MITIGATED |
| **R2.8** | **Camera disconnection during recording** - External webcams can be unplugged during recording | LOW | Detect camera disconnection in nokhwa capture loop (frame error), gracefully stop recording, save partial MP4, notify user. Same pattern as R2.5. Story 2.8. | MITIGATED |
| **R2.9** | **System audio capture may not work with all audio devices** - Some Bluetooth headphones or external DACs may not expose system audio to ScreenCaptureKit | MEDIUM | Story 2.4 should test with common audio devices (AirPods, USB headphones, built-in speakers). Document known limitations in README. Graceful degradation: Record video-only if system audio capture fails (AC 2.4.6 partial success). | MONITORING |
| **R2.10** | **Incomplete frame capture in capture_single_frame() (Story 2.1)** - AI Review finding M2: Story 2.1 returns placeholder data, not real frames | HIGH | **ACTION REQUIRED (Story 2.2):** Implement full SCStream delegate with async frame callbacks. Story 2.1 validated permission flow only. Story 2.2 AC 2.2.2 explicitly requires working frame capture at 30 FPS. | OPEN |

### Assumptions

| Assumption ID | Assumption | Validation | Impact if Invalid |
|---------------|------------|------------|-------------------|
| **A2.1** | **Users have macOS 12.3+ (Monterey or later)** - ScreenCaptureKit API available | Story 2.1 implemented version check, blocks app launch on older macOS | If invalid: App won't run on macOS < 12.3. Documented as system requirement in README. |
| **A2.2** | **FFmpeg H.264 VideoToolbox encoder available on all M1+ Macs** - Hardware acceleration assumed present | Integration testing on Story 2.3 | If invalid: Fall back to software encoding (libx264), slower but functional. FFmpeg auto-detects encoder availability. |
| **A2.3** | **User grants screen recording permission** - Recording features require explicit user consent | Story 2.1 permission flow guides user through System Preferences | If invalid: Recording features completely blocked. PermissionPrompt provides clear guidance. Expected UX for privacy-conscious users. |
| **A2.4** | **Bounded channel size of 30 frames is sufficient** - 1 second buffer at 30 FPS prevents most backpressure issues | Story 2.3 integration testing under load | If invalid: Increase channel size to 60 (2 seconds). May increase memory usage to ~480MB for 1080p. Trade-off acceptable. |
| **A2.5** | **5MB/min file size estimation is reasonable for H.264** - Used for disk space warnings (AC 2.5.9) | Story 2.3 actual recording analysis | If invalid: Actual bitrate may be 3-8 MB/min depending on content complexity. Adjust estimation based on recorded data. Conservative estimate prevents false positives. |
| **A2.6** | **2 audio tracks in MP4 is sufficient for Epic 2** - System audio + microphone as separate tracks | Story 2.4 FFmpeg muxing | If invalid: Epic 4 will add 3rd track (webcam mic). MP4 container supports unlimited audio tracks. No architectural limitation. |
| **A2.7** | **Auto-import reuses Epic 1 cmd_import_media command** - Existing media import logic compatible with recordings | Story 2.6 integration with Epic 1 code | If invalid: May need separate cmd_import_recording command. Validate during Story 2.6 implementation. |
| **A2.8** | **Recording output directory ~/Documents/clippy/recordings is acceptable** - Standard macOS Documents folder pattern | User feedback during beta testing | If invalid: Epic 4 can add user-configurable output directory setting. Default is reasonable for Epic 2. |
| **A2.9** | **nokhwa 0.10.9 AVFoundation backend supports all Mac cameras** - Built-in cameras, USB webcams, virtual cameras (OBS, etc.) | Story 2.7 device enumeration testing | If invalid: May need to filter unsupported cameras or fall back to custom AVFoundation bindings. nokhwa well-maintained, likely sufficient. |
| **A2.10** | **Pause/resume doesn't require complex state persistence** - Recording state held in memory during pause | Story 2.5 pause/resume implementation | If invalid: Add state persistence to disk if app crashes during pause. Epic 2 scope is in-memory only. Enhancement for Epic 3+. |

### Open Questions

| Question ID | Question | Decision Owner | Target Resolution | Impact |
|-------------|----------|----------------|-------------------|--------|
| **Q2.1** | **Should Epic 2 support multiple simultaneous recordings?** (e.g., screen + webcam as separate files) | Product Owner (zeno) | Before Story 2.7 | HIGH - Affects recording::orchestrator architecture. Current design assumes single active recording. If yes, refactor to HashMap<RecordingId, RecordingSession>. |
| **Q2.2** | **What should default recording resolution be?** (Source native, 1080p, or 720p?) | Product Owner | Before Story 2.2 | MEDIUM - Affects initial RecordingConfig. Recommend: Source for screen (most users have 1080p+ displays), 1080p for webcam. |
| **Q2.3** | **Should recordings have automatic naming convention?** (e.g., "Screen Recording 2025-10-28 at 10.15.30.mp4") | Product Owner | Before Story 2.6 | LOW - AC 2.6.5 mentions organized location but not naming. Apple's pattern is descriptive + timestamp. |
| **Q2.4** | **Should Epic 2 include recording countdown timer (3-2-1-Record)?** | Product Owner | Before Story 2.5 | LOW - Nice-to-have UX feature. Not in AC, could be fast-follow in Epic 2 or defer to Epic 4. Estimate: +2 hours for Story 2.5. |
| **Q2.5** | **How to handle screen resolution changes during recording?** (User drags window to different display) | Tech Lead (AI Agent) | During Story 2.2 implementation | MEDIUM - ScreenCaptureKit may handle automatically, or may need to restart SCStream. Test during Story 2.2. |
| **Q2.6** | **Should system audio capture work for apps using exclusive audio mode?** (e.g., DAWs) | Deferred to post-Epic 2 | N/A | LOW - macOS limitation, ScreenCaptureKit may not capture exclusive audio. Document as known limitation if encountered. |
| **Q2.7** | **What bitrate should FFmpeg use for H.264 encoding?** | Tech Lead | Story 2.3 implementation | MEDIUM - Trade-off: file size vs quality. Recommend: 5 Mbps for 1080p (balance), 3 Mbps for 720p. Configurable in Epic 4. |
| **Q2.8** | **Should pause/resume show elapsed time or real clock time?** | Product Owner | Before Story 2.5 | LOW - AC 2.5.2 shows "elapsed time" (excludes pauses). Clarify: Timer shows recording duration, not wall-clock time. |
| **Q2.9** | **Should auto-import trigger immediately or with delay?** | Tech Lead | Story 2.6 implementation | LOW - AC 2.6.4 requires < 2 seconds. Recommend: Immediate trigger after FFmpeg finalization. No artificial delay. |
| **Q2.10** | **Should webcam preview show mirrored image?** (Like FaceTime, or true camera view?) | Product Owner | Before Story 2.7 | LOW - UX preference. Apple mirrors by default for selfie cameras. Recommend: Mirror preview, record non-mirrored (true view). |

### Decision Log

| Decision ID | Decision | Date | Rationale | Changed By |
|-------------|----------|------|-----------|------------|
| **D2.1** | Use screencapturekit 0.3.6 crate instead of custom Objective-C bindings | Story 2.1 (2025-10-28) | Reduces implementation complexity, crate maintained, sufficient for proof-of-concept. Can revisit in Story 2.2 if insufficient. | Story 2.1 Dev Agent |
| **D2.2** | Use bounded channel with 30 frame buffer (Novel Pattern 2) | Architecture doc | Prevents memory bloat during long recordings. 1 second buffer sufficient for backpressure handling. | Architecture review |
| **D2.3** | Epic 2 targets 30 FPS only, defer 60 FPS to Epic 4 | Epic scope | Simplifies initial implementation, 30 FPS sufficient for tutorials/demos. 60 FPS adds complexity for gaming content. | PRD Epic breakdown |
| **D2.4** | Use FFmpeg stdin pipe instead of intermediate files | Architecture Novel Pattern 2 | Real-time encoding, no disk space waste on raw frames. Proven pattern from architecture analysis. | Architecture review |
| **D2.5** | Accept frame drops as logged events (not hard errors) for Epic 2 | AC 2.3.6 | Graceful degradation better than recording failure. Quality settings in Epic 4 will reduce frame drops. | PRD NFR003 |
| **D2.6** | Store recordings in ~/Documents/clippy/recordings | AC 2.6.5 | Standard macOS Documents pattern, user-visible, easy to find. Configurable in Epic 4 if needed. | Story 2.6 planning |
| **D2.7** | Use ffmpeg-sidecar for auto-download instead of system FFmpeg | Architecture dependencies | Better UX (no manual install), consistent FFmpeg version, smaller download than full ffmpeg package. | Architecture review |
| **D2.8** | Separate recording::orchestrator service for multi-stream coordination | Architecture services | Future-proofs for Epic 4 PiP (simultaneous screen+webcam). Epic 2 uses simple single-stream pattern. | Architecture review |

**Risk Severity Definitions:**
- **HIGH:** Blocks epic completion or causes major rework
- **MEDIUM:** Degrades user experience or requires workaround
- **LOW:** Minor inconvenience with acceptable workaround

## Test Strategy Summary

**Epic 2 Test Strategy: Multi-Layered Testing for Recording Architecture**

### Test Pyramid Overview

```
                    E2E Tests (5)
                  /              \
         Integration Tests (25)
        /                        \
   Unit Tests (15)    Manual/Visual (3)
  /__________________________________________\
```

**Coverage by Story:**

| Story | Unit Tests | Integration Tests | E2E Tests | Manual Tests | Total |
|-------|-----------|-------------------|-----------|--------------|-------|
| 2.1 ✅ | 3 | 2 | 0 | 1 | 6 |
| 2.2 | 2 | 3 | 1 | 1 | 7 |
| 2.3 | 3 | 6 | 0 | 1 | 10 |
| 2.4 | 2 | 3 | 1 | 1 | 7 |
| 2.5 | 2 | 2 | 2 | 1 | 7 |
| 2.6 | 1 | 5 | 1 | 0 | 7 |
| 2.7 | 1 | 1 | 2 | 0 | 4 |
| 2.8 | 1 | 3 | 1 | 0 | 5 |
| **Total** | **15** | **25** | **8** | **5** | **53** |

### Test Levels

**1. Unit Tests (Rust - cargo test)**

**Framework:** Built-in Rust test framework with `#[cfg(test)]` modules

**Scope:** Individual functions and modules in isolation

**Key Unit Tests for Epic 2:**

```rust
// src-tauri/src/services/permissions/macos.rs
#[cfg(test)]
mod tests {
    #[test]
    fn test_permission_check_returns_bool() {
        // AC 2.1.3: Verify check_screen_recording_permission() returns bool
        let result = check_screen_recording_permission();
        assert!(result.is_ok());
    }

    #[test]
    fn test_macos_version_check() {
        // AC 2.1.1: Verify macOS 12.3+ detection
        let version = get_macos_version().unwrap();
        assert!(version >= (12, 3));
    }
}

// src-tauri/src/services/screen_capture/screencapturekit.rs
#[cfg(test)]
mod tests {
    #[test]
    fn test_screencapture_init_requires_permission() {
        // AC 2.2.2: Verify ScreenCapture::new() checks permission
        mock_permission_denied();
        let result = ScreenCapture::new();
        assert!(result.is_err());
    }
}

// src-tauri/src/services/ffmpeg/encoder.rs
#[cfg(test)]
mod tests {
    #[test]
    fn test_bounded_channel_backpressure() {
        // AC 2.2.5: Verify channel never exceeds 30 buffer size
        let (tx, rx) = mpsc::channel(30);
        for i in 0..100 {
            tx.try_send(frame).unwrap_or_else(|_| {
                // Channel full - expected behavior
            });
        }
        // Verify rx has max 30 frames buffered
    }

    #[test]
    fn test_recording_config_output_path() {
        // AC 2.2.6: Verify output path = ~/Documents/clippy/recordings/{uuid}.mp4
        let config = RecordingConfig::default();
        assert!(config.output_path.starts_with(dirs::document_dir().unwrap()));
        assert!(config.output_path.extension() == Some("mp4"));
    }
}
```

**Unit Test Checklist:**
- ✅ Permission checks (Story 2.1)
- ✅ Error type construction (thiserror derives)
- ✅ Data model serialization (RecordingConfig serde)
- ✅ Bounded channel buffer limits (Story 2.3)
- ✅ Timestamp alignment logic (Story 2.4)
- ✅ Disk space calculation (Story 2.5)
- ✅ Output path generation (Story 2.6)

**2. Integration Tests (Rust - cargo test --test integration_*)**

**Framework:** Rust integration tests in `src-tauri/tests/` directory

**Scope:** Multi-component workflows, service interactions, FFmpeg integration

**Key Integration Tests for Epic 2:**

```rust
// src-tauri/tests/integration_recording.rs

#[tokio::test]
async fn test_full_screen_recording_flow() {
    // AC 2.2.2, 2.2.4, 2.3.5: Start → Record 5s → Stop → Verify MP4
    let config = RecordingConfig {
        source: RecordingSource::FullScreen,
        frame_rate: 30,
        ..Default::default()
    };

    let recording_id = cmd_start_screen_recording(config).await.unwrap();
    tokio::time::sleep(Duration::from_secs(5)).await;
    let output_path = cmd_stop_recording(recording_id).await.unwrap();

    // Verify MP4 exists and is playable
    assert!(Path::new(&output_path).exists());
    let metadata = ffprobe_metadata(&output_path).await.unwrap();
    assert_eq!(metadata.codec, "h264");
    assert!(metadata.duration_ms >= 4500 && metadata.duration_ms <= 5500);
}

#[tokio::test]
async fn test_ffmpeg_encoding_realtime() {
    // AC 2.3.3: Verify MP4 exists and playable before stop command
    let recording_id = start_recording().await.unwrap();
    tokio::time::sleep(Duration::from_secs(10)).await;

    // Check MP4 file exists and is growing
    let output_path = get_recording_output_path(recording_id).await;
    assert!(Path::new(&output_path).exists());
    let size_1 = fs::metadata(&output_path).await.unwrap().len();

    tokio::time::sleep(Duration::from_secs(5)).await;
    let size_2 = fs::metadata(&output_path).await.unwrap().len();
    assert!(size_2 > size_1, "MP4 should be growing during recording");

    cmd_stop_recording(recording_id).await.unwrap();
}

#[tokio::test]
async fn test_audio_video_sync() {
    // AC 2.4.4: Record with audio → Verify timestamp alignment < 50ms
    let config = RecordingConfig {
        audio_sources: AudioSources {
            system_audio: true,
            microphone: true,
        },
        ..Default::default()
    };

    let recording_id = cmd_start_screen_recording(config).await.unwrap();
    tokio::time::sleep(Duration::from_secs(30)).await; // 30 seconds
    let output_path = cmd_stop_recording(recording_id).await.unwrap();

    // Use FFmpeg to analyze A/V sync
    let sync_drift = measure_av_sync(&output_path).await.unwrap();
    assert!(sync_drift < 50.0, "A/V drift {} ms exceeds 50ms limit", sync_drift);
}

#[tokio::test]
async fn test_memory_stable_during_long_recording() {
    // AC 2.3.4: Record 10 minutes → Monitor memory (should remain < 500MB total)
    let recording_id = start_recording().await.unwrap();

    for i in 0..10 {
        tokio::time::sleep(Duration::from_secs(60)).await;
        let memory_mb = get_process_memory_mb();
        assert!(memory_mb < 500, "Memory {} MB exceeds 500MB at minute {}", memory_mb, i+1);
    }

    cmd_stop_recording(recording_id).await.unwrap();
}
```

**Integration Test Checklist:**
- ✅ Full recording lifecycle (start → record → stop)
- ✅ FFmpeg process spawning and communication
- ✅ Real-time encoding verification
- ✅ Audio-video synchronization measurement
- ✅ Memory stability over time
- ✅ Auto-import to media library
- ✅ Thumbnail generation
- ✅ Graceful error handling (FFmpeg failure, disk full)

**3. End-to-End Tests (Playwright via @playwright/test)**

**Framework:** Playwright for browser automation (Tauri webview testing)

**Scope:** Full user workflows through UI, cross-process validation

**Key E2E Tests for Epic 2:**

```typescript
// tests/e2e/recording.spec.ts

import { test, expect } from '@playwright/test';

test('user can record screen and see it in media library', async ({ page }) => {
  // AC 2.2.1, 2.6.1, 2.6.6: Full recording workflow
  await page.goto('/');

  // Open recording panel
  await page.click('[data-testid="recording-button"]');
  await expect(page.locator('[data-testid="recording-panel"]')).toBeVisible();

  // Start recording
  await page.click('[data-testid="start-screen-recording"]');
  await expect(page.locator('[data-testid="recording-indicator"]')).toBeVisible();

  // Wait 5 seconds
  await page.waitForTimeout(5000);

  // Stop recording
  await page.click('[data-testid="stop-recording"]');

  // Verify auto-import toast
  await expect(page.locator('.toast').filter({ hasText: 'Recording imported' })).toBeVisible({ timeout: 5000 });

  // Verify recording appears in media library
  await expect(page.locator('[data-testid="media-library"]').locator('.media-item').first()).toBeVisible();
});

test('recording controls remain accessible during recording', async ({ page }) => {
  // AC 2.5.7: UI accessibility during recording
  await page.goto('/');
  await page.click('[data-testid="recording-button"]');
  await page.click('[data-testid="start-screen-recording"]');

  // Verify controls still clickable
  await expect(page.locator('[data-testid="stop-recording"]')).toBeEnabled();
  await expect(page.locator('[data-testid="pause-recording"]')).toBeEnabled();

  await page.click('[data-testid="stop-recording"]');
});

test('webcam preview shows before recording', async ({ page }) => {
  // AC 2.7.4: Webcam preview rendering
  await page.goto('/');
  await page.click('[data-testid="recording-button"]');
  await page.click('[data-testid="webcam-mode-tab"]');

  // Select camera
  await page.selectOption('[data-testid="camera-dropdown"]', { index: 0 });

  // Verify preview visible
  await expect(page.locator('[data-testid="webcam-preview"]')).toBeVisible({ timeout: 3000 });
});
```

**E2E Test Checklist:**
- ✅ Complete recording workflows (screen, webcam)
- ✅ UI state transitions
- ✅ Permission prompt flows
- ✅ Error notifications
- ✅ Auto-import verification

**4. Manual/Visual Tests**

**Scope:** Subjective quality checks, platform-specific behavior, UX validation

**Manual Test Cases for Epic 2:**

| Test ID | Test Case | AC Reference | Pass Criteria |
|---------|-----------|--------------|---------------|
| **MT2.1** | **Permission UX Flow** | AC 2.1.4 | Deny permission → Error message clear, System Preferences link works, restart app after granting → Recording works |
| **MT2.2** | **Recording Indicator Visibility** | AC 2.2.3 | Red dot pulsing animation smooth, visible during recording, disappears on stop |
| **MT2.3** | **Audio Quality Subjective Test** | AC 2.4.6 | Record with system audio + mic → Play back → No audible distortion, sync issues, or artifacts |
| **MT2.4** | **Visual Recording Quality** | AC 2.8.6 | Record screen with motion (scrolling, video playback) → Verify smooth 30 FPS, no stuttering |
| **MT2.5** | **macOS Version Compatibility** | Risk R2.4 | Test on macOS 12.7, 13.6, 14.5 → All features work, no version-specific crashes |

### Test Automation Strategy

**CI/CD Integration:**

```yaml
# .github/workflows/epic-2-tests.yml
name: Epic 2 Recording Tests

on: [push, pull_request]

jobs:
  rust-tests:
    runs-on: macos-13  # ScreenCaptureKit requires macOS
    steps:
      - uses: actions/checkout@v4
      - name: Run unit tests
        run: cd src-tauri && cargo test --lib
      - name: Run integration tests
        run: cd src-tauri && cargo test --test integration_*

  e2e-tests:
    runs-on: macos-13
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: npm install
      - name: Build app
        run: npm run tauri build
      - name: Run Playwright E2E tests
        run: npx playwright test tests/e2e/recording.spec.ts
```

**Test Data Management:**

- **Test Videos:** Store 3 sample videos in `tests/fixtures/videos/`:
  - `test_1080p_30fps.mp4` (5 seconds, H.264)
  - `test_4k_60fps.mp4` (3 seconds, HEVC)
  - `test_audio.mp4` (10 seconds, with system audio simulation)

- **Mock Permissions:** Create permission mocking utilities for automated testing on CI

**Performance Benchmarks:**

| Benchmark | Target | Test Method |
|-----------|--------|-------------|
| Recording start latency | < 2 seconds | Integration test: Measure time from cmd_start_screen_recording to first frame captured |
| Frame capture rate | 30 ± 1 FPS | Integration test: Count frames over 10 seconds, verify 295-305 frames |
| Memory usage (10 min recording) | < 500MB | Load test: Monitor `ps aux` RSS during recording |
| Auto-import speed | < 2 seconds | Integration test: Measure time from stop to MediaItem render |
| Encoding throughput | ≥ 1:1 ratio | Integration test: Record 60s → Verify encoding completes in ≤ 90s |

### Test Environments

**Development Environment:**
- macOS 14.5 (Sonoma) on M1 MacBook Pro
- Rust 1.80+, Node.js 18+
- Local FFmpeg via ffmpeg-sidecar

**CI Environment:**
- GitHub Actions: macOS-13 runners (Intel)
- Automated unit + integration tests only
- E2E tests run on PR review (slower, flaky on CI)

**Staging Environment (Manual Testing):**
- macOS 12.7 (Monterey, minimum supported)
- macOS 13.6 (Ventura)
- macOS 14.5 (Sonoma)
- Various hardware: M1, M2, M3, Intel (verify VideoToolbox availability)

### Test Coverage Goals

**Epic 2 Coverage Targets:**

| Coverage Type | Target | Measurement |
|---------------|--------|-------------|
| **Line Coverage (Rust)** | 80% | `cargo tarpaulin --out Html` |
| **AC Coverage** | 100% | Traceability matrix: 48/48 ACs have tests |
| **Integration Coverage** | 90% | All critical workflows tested |
| **E2E Coverage** | 70% | Major user journeys covered |

**Coverage Exclusions:**
- FFI bindings to macOS frameworks (tested via integration, hard to unit test)
- Error branches for system failures (simulated in integration tests)
- Logging code (tracing macros)

### Test Execution Schedule

**Per Story (Stories 2.2-2.8):**
1. Write unit tests during implementation (TDD)
2. Run `cargo test` on every save (watch mode)
3. Integration tests after service implementation complete
4. E2E tests after frontend UI complete
5. Manual testing before marking story "ready for review"

**Per Epic (Epic 2 Complete):**
1. Full regression test suite (all 53 tests)
2. Performance benchmark suite
3. Manual testing on all 3 macOS versions
4. Load testing (30-minute recordings)
5. Audio quality review

### Known Testing Limitations

**Limitations in Automated Testing:**
1. **macOS Permissions:** Cannot automate permission grant/deny in tests (requires manual System Preferences)
2. **ScreenCaptureKit on CI:** GitHub Actions runners may not support ScreenCaptureKit (virtualized environment)
3. **Audio Quality:** Subjective audio quality requires human listening tests
4. **Visual Quality:** Frame smoothness and artifacts require manual review
5. **Hardware Acceleration:** VideoToolbox availability varies by macOS version and hardware

**Mitigation:**
- Use permission mocks for unit tests
- Integration tests skip ScreenCaptureKit tests if unsupported (feature flag)
- Manual testing checklist for audio/visual quality
- Document tested hardware configurations
