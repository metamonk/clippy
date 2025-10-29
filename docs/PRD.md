# clippy Product Requirements Document (PRD)

**Author:** zeno
**Date:** 2025-10-27
**Project Level:** 2
**Target Scale:** Learning project + functional tool (6-7 month timeline for complete feature set)

---

## Goals and Background Context

### Goals

- Master Tauri architecture and Rust fundamentals through building a production-quality macOS desktop application with native API integration (AVFoundation, ScreenCaptureKit)
- Create a genuinely useful video editing tool with screen recording, multi-track timeline editing, and AI-powered transcription/captioning that reduces manual captioning time by 80%+
- Build a portfolio-worthy demonstration of full-stack desktop development integrating native macOS capabilities, complex media processing, and AI services

### Background Context

Developers learning modern desktop application development face a critical gap: existing Tauri resources focus on toy examples rather than real-world applications integrating native OS capabilities, complex media processing, and AI services. Meanwhile, content creators producing video content face tedious manual workflows for accessibility—manual transcription and captioning costs 4-8 hours per hour of video, with professional services costing $1-3 per minute.

clippy bridges both gaps as a macOS-native video editor built with Tauri that combines intermediate editing capabilities with AI-powered workflow automation. It serves dual purposes: a learning vehicle for mastering Tauri + Rust + native macOS integration, and a functional tool that delivers AI-first accessibility features (automatic transcription, caption generation via OpenAI) within a lightweight, native editor. This positions clippy as both a reference implementation for the Tauri community and a practical solution for video editing with automated captioning workflows.

---

## Requirements

### Functional Requirements

**FR001: Video File Import and Management**
- System shall support drag-and-drop and file picker import of video files in any format with universal codec support (H.264, HEVC/H.265, ProRes, DNxHD, VP9, AV1) via MPV playback engine
- System shall maintain a media library with thumbnail previews, metadata (duration, resolution, file size, codec), search/filter, and organizational capabilities

**FR002: Screen Recording Capabilities**
- System shall capture screen recordings (full screen and window selection modes) with system audio and microphone audio using macOS ScreenCaptureKit API
- System shall provide recording controls (start, stop, pause) and save recordings directly to timeline or media library

**FR003: Webcam Recording**
- System shall access and record from system cameras with audio, provide preview before recording, and support camera selection when multiple cameras are available

**FR004: Simultaneous Screen and Webcam Recording**
- System shall record screen and webcam simultaneously in picture-in-picture (PiP) style with configurable position/size, independent audio tracks, and real-time preview

**FR005: Multi-Track Timeline Editor**
- System shall provide visual timeline with playhead, multiple tracks (minimum 2, expandable to 4+), time ruler, zoom/scroll capabilities
- System shall support drag-drop clip arrangement, trimming (in/out points), splitting at playhead, deletion, track movement, and snap-to-grid editing

**FR006: Real-Time Video Preview and Playback**
- System shall provide **Preview Mode** for playing selected media files independently with basic controls (play/pause, seek, scrub)
- System shall provide **Timeline Mode** for rendering multi-track composition with PiP overlays in real-time preview window
- System shall automatically switch between modes based on user's last interaction context: library interactions activate Preview Mode, timeline interactions activate Timeline Mode
- System shall use single MPV (libmpv) playback engine with automatic mode switching for resource efficiency
- System shall maintain 30+ FPS playback and frame-accurate seeking (<33ms precision) in both modes

**FR007: Audio Track Management**
- System shall provide separate audio visualization, per-clip volume control, mute/unmute tracks, and audio fade in/out capabilities

**FR008: AI-Powered Transcription**
- System shall extract audio from video, send to OpenAI Whisper API for transcription, and display editable transcript with timestamps

**FR009: AI-Generated Captions**
- System shall generate captions with timing from transcripts, provide caption editor for timing/text adjustments, support style customization (font, size, position, background), and preview captions on video

**FR010: AI Content Analysis**
- System shall leverage OpenAI API for video description generation, automatic tag suggestions, and scene detection with chapter recommendations

**FR011: Video Export**
- System shall export timeline to MP4 (H.264 codec) with configurable resolution (720p, 1080p, source), quality/bitrate settings, audio track inclusion/exclusion, and caption options (burned-in or separate SRT/VTT files)
- System shall provide progress indicator with percentage/ETA and cancel option

**FR012: Native macOS Integration**
- System shall implement native menu bar, window chrome, file dialogs, keyboard shortcuts following macOS conventions, notifications, and proper system permissions handling (screen recording, camera, microphone)

### Non-Functional Requirements

**NFR001: Performance**
- Video playback shall maintain 30+ FPS for 1080p content with smooth timeline rendering
- Screen recording shall capture at 30+ FPS without dropped frames
- Video export shall complete near real-time (1 minute video exports in 60-90 seconds)
- Application shall launch in under 3 seconds

**NFR002: Platform Compatibility**
- System shall run on macOS 12+ (Monterey and later) with primary support for Apple Silicon (M1/M2/M3) and secondary Intel support
- System shall require minimum 8GB RAM (16GB recommended)

**NFR003: Usability and Reliability**
- Recording workflow shall require maximum 2-3 clicks to start
- AI caption generation shall complete in under 2x video length
- System shall implement graceful error handling with user-friendly messages and actionable suggestions
- System shall handle permissions errors, API failures, and recording failures without application crashes

---

## User Journeys

_User journeys skipped for this Level 2 project. Primary workflows are captured in functional requirements and will be detailed in story acceptance criteria._

---

## UX Design Principles

1. **Native macOS Experience** - Follow macOS Human Interface Guidelines for menus, window chrome, keyboard shortcuts, and interactions to feel like a natural part of the macOS ecosystem
2. **Transparent Workflow** - Users should clearly understand recording state, editing actions, and AI processing status with real-time feedback and progress indicators
3. **Efficient Timeline Editing** - Prioritize keyboard shortcuts, drag-drop interactions, and snap-to-grid precision for fast, professional-feeling editing workflows
4. **Graceful AI Integration** - AI features (transcription, captions) enhance workflow without blocking core editing; offline mode allows editing even when AI services unavailable

---

## User Interface Design Goals

**Target Platform:**
- macOS desktop application (native Tauri window)
- Primary: Apple Silicon (M1/M2/M3), Secondary: Intel Macs
- macOS 12+ (Monterey and later)

**Core Screens/Views:**
- **Main Editing View:** Split layout with preview window (top), timeline editor (bottom), media library panel (side)
- **Recording Control Panel:** Overlay/modal for configuring and controlling screen/webcam recording
- **AI Workflow Panel:** Side panel for transcription display, caption editing, and content analysis results
- **Export Configuration:** Modal dialog for export settings and progress

**Key Interaction Patterns:**
- **Drag & Drop:** Primary method for importing files and arranging clips on timeline
- **Canvas-based Timeline:** HTML5 Canvas with Fabric.js for responsive, smooth timeline manipulation
- **Native Controls:** macOS-standard file dialogs, keyboard shortcuts (Cmd+Z for undo, Space for play/pause, etc.)
- **Real-time Preview:** Video player updates immediately as playhead moves or clips are adjusted

**Design Constraints:**
- **UI Framework:** React 18+ with Tailwind CSS for rapid styling
- **Video Player:** HTML5 video element enhanced with Video.js for professional controls
- **Timeline Rendering:** Fabric.js on HTML5 Canvas for drag-drop timeline UI
- **Browser Support:** WebView2 (system WebKit on macOS) - no cross-browser concerns
- **Accessibility:** Keyboard navigation support, basic VoiceOver compatibility, high contrast mode support

**Technical UI Constraints:**
- WebKit rendering performance for Canvas-based timeline (target 60 FPS UI interactions)
- Real-time video preview synchronization with timeline scrubbing
- Native macOS permissions UI for camera, microphone, screen recording access

---

## Epic List

**Epic 1: Foundation & TRUE MVP**
- Goal: Establish Tauri app foundation with basic video import, single-track timeline, trim capability, and export functionality
- Estimated stories: 8-10
- Delivers: Working macOS app that can import video, trim clips, and export - proves core concept

**Epic 2: Recording Foundation**
- Goal: Add native screen recording and basic webcam recording capabilities using ScreenCaptureKit and AVFoundation
- Estimated stories: 6-8
- Delivers: Screen capture (full screen), webcam recording, save to media library, import recordings to timeline

**Epic 3: Multi-Track Timeline & Editing Maturity**
- Goal: Expand timeline to support multiple tracks, enhanced clip manipulation, media library panel, and audio track management
- Estimated stories: 6-8
- Delivers: Professional multi-track editing with drag-drop arrangement, split/delete operations, audio visualization and control

**Epic 4: Advanced Recording & PiP Composition**
- Goal: Add window selection for screen recording, simultaneous screen + webcam (PiP), multi-audio track recording, and advanced recording controls
- Estimated stories: 5-7
- Delivers: Complete recording suite with picture-in-picture, configurable layouts, independent audio tracks

**Epic 5: AI-Powered Workflow Automation**
- Goal: Integrate OpenAI Whisper for transcription, caption generation and editing, content analysis, and caption export (SRT/VTT)
- Estimated stories: 6-8
- Delivers: Full AI automation features - automatic transcription, AI-generated captions, content tagging, caption export

> **Note:** Detailed epic breakdown with full story specifications is available in [epics.md](./epics.md)

---

## Out of Scope

**Advanced Professional Features:**
- Keyframe animation and advanced motion graphics
- Professional color grading and color correction tools
- Multi-camera editing and angle switching
- Proxy workflow for 4K+ files
- Plugin system and third-party extensions
- Motion tracking and object tracking
- Chroma key (green screen) compositing

**Platform and Distribution:**
- Windows and Linux versions (macOS-only focus)
- Mobile companion apps or remote control
- Team collaboration and multi-user workflows

**Advanced Workflow Features:**
- Version control and project history
- Asset management systems
- Workflow automation beyond AI features (scripting, macros)
- Batch processing multiple videos simultaneously
- Advanced audio mixing beyond basic volume/fade controls

**Deferred Enhancements (Post-Launch):**
- Local Whisper model (OpenAI API only for initial release)
- Advanced playback controls (frame-by-frame beyond basic)
- Comprehensive undo/redo history panel
- Project templates and presets
- Keyboard shortcut customization

**Technical Limitations Accepted:**
- Limited video format support (MP4/MOV/WebM only, no exotic codecs)
- macOS 12+ required (no backward compatibility)
- OpenAI API dependency for AI features
- Single project workspace (no multi-project management)
