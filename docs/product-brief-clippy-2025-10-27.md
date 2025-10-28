# Product Brief: clippy

**Date:** 2025-10-27
**Author:** zeno
**Status:** Draft for PM Review
**Project Name:** clippy

---

## Executive Summary

**clippy** is a macOS-native video editor built with Tauri that combines intermediate editing capabilities with AI-powered workflow automation. Designed as both a learning project and functional tool, clippy bridges the gap between toy tutorial apps and production-grade desktop applications.

**The Problem:**
Developers learning modern desktop development lack real-world examples that integrate native OS capabilities, complex media processing, and AI services. Meanwhile, content creators face tedious manual workflows for video transcription and captioning, with options limited to expensive professional tools or basic free alternatives lacking automation.

**The Solution:**
clippy delivers AI-first accessibility features (automatic transcription, caption generation, content tagging via OpenAI) within a lightweight, native macOS editor. Built with Tauri, it demonstrates best practices for Rust/frontend integration while solving real workflow pain points.

**Target Market:**
Primary user is the developer/creator seeking to master Tauri architecture while building a genuinely useful tool for video editing needs. Secondary audience includes the broader Tauri learning community interested in reference implementations.

**Key Differentiators:**
1. **AI-powered automation** built-in from day one (not afterthought plugins)
2. **Learning-optimized codebase** demonstrating Tauri + macOS integration patterns
3. **Native performance** without Electron bloat
4. **Achievable scope** for short-term completion with high learning value

**Success Metrics:**
Deep understanding of Tauri fundamentals and Rust mastery, complete screen recording + editing tool with AI automation, portfolio-worthy demonstration of full-stack desktop development skills. TRUE MVP (import/trim/export) targeted for weeks 3-6, complete feature set targeted for 6-7 months (30 weeks) of incremental development.

---

## Initial Context

**Project Type:** Learning project + functional tool + portfolio piece

**Core Vision:**
- macOS desktop video editor built with Tauri
- **Native recording capabilities:** Screen capture, webcam, audio, simultaneous recording
- **Multi-track timeline editor:** Professional-grade editing with multiple video/audio tracks
- **AI-powered workflow automation:** OpenAI-powered transcription, captions, content analysis
- Focus on solid fundamentals: Tauri architecture, native macOS integration
- Incremental development: MVP → Feature-complete over multiple phases

**Key Differentiators:**
- **Native Recording Suite:** Screen + webcam + audio capture in one app
- **AI Workflow Automation:** Voice-to-text, auto-captioning, content tagging
- **Integrated Workflow:** Record → Edit → Export in single application

**Technical Stack:**
- Platform: macOS
- Framework: Tauri (Rust backend + web frontend)
- Native Integration: AVFoundation, macOS file system APIs
- AI: OpenAI Cloud API integration

**Collaboration Mode:** YOLO

---

## Problem Statement

**Learning Gap:**
Developers seeking to master modern desktop application development face a critical challenge: existing learning resources for Tauri focus on toy examples rather than real-world applications that integrate native OS capabilities, handle complex media processing, and incorporate AI services. There's a significant gap between "hello world" tutorials and production-grade desktop applications that leverage the full power of Tauri's architecture.

**Practical Pain:**
Content creators, educators, and developers producing video content face tedious manual workflows for accessibility and content discovery:
- Manual transcription and captioning costs 4-8 hours per hour of video content
- Professional captioning services cost $1-3 per minute
- Content tagging and description generation is time-consuming and inconsistent
- Existing professional tools (Final Cut Pro + plugins) require expensive subscriptions ($300+/year)
- Free tools (iMovie) lack AI-powered automation entirely

**The Gap:**
No accessible, lightweight desktop video editor exists that combines:
1. Native macOS performance and integration
2. AI-powered workflow automation for captions, transcription, and tagging
3. Modern, learnable codebase that demonstrates best practices
4. Free and open foundation for experimentation

---

## Proposed Solution

**Clippy** is a macOS-native video editor built with Tauri that combines intermediate editing capabilities with AI-powered workflow automation.

**Core Approach:**
- **Tauri-first architecture:** Demonstrates proper separation between Rust backend (media processing, file system, native APIs) and modern web frontend (UI/timeline)
- **Native macOS integration:** Leverages AVFoundation for video processing, native file dialogs, and macOS-specific optimizations
- **AI workflow layer:** OpenAI API integration for automatic transcription, caption generation, and intelligent content tagging
- **Focused scope:** Intermediate editing features (timeline, effects, filters, export) without attempting to compete with professional tools

**Key Differentiators:**
1. **Learning-optimized codebase:** Clear architectural patterns, well-documented integration points, demonstrates Tauri best practices
2. **AI-first accessibility:** Automatic captioning and transcription built-in from day one, not as afterthought plugins
3. **Native performance:** True macOS app performance, not Electron bloat
4. **Short-term achievable:** Scoped for rapid development while remaining genuinely useful

**Why This Will Succeed:**
- Solves real pain (AI automation) while achieving learning objectives (Tauri mastery)
- Focused enough to complete in short-term timeline
- Differentiating AI features create genuine utility beyond learning exercise
- Portfolio-worthy demonstration of modern desktop development skills

---

## Target Users

### Primary User Segment

**Developer/Creator (You)**
- **Profile:** Experienced developer learning Tauri and native macOS development, creates video content occasionally (tutorials, demos, documentation)
- **Current Workflow:** Uses heavyweight professional tools for simple edits, manually adds captions, lacks automation
- **Pain Points:**
  - Overkill tools for simple editing needs
  - Time-consuming manual captioning workflow
  - No good reference implementation for Tauri + native integration
- **Goals:** Master Tauri architecture, build portfolio-worthy project, create actually useful tool for personal video editing needs
- **Success Criteria:** Completes project with deep understanding of Tauri fundamentals, has functional tool for quick video edits with AI automation

### Secondary User Segment

**Developer Community / Tauri Learners**
- **Profile:** Developers interested in modern desktop development, looking for real-world Tauri examples beyond tutorials
- **Current Approach:** Piecing together knowledge from scattered tutorials, lacking comprehensive examples
- **Pain Points:** Gap between toy examples and production apps, unclear how to integrate native APIs, no clear patterns for AI service integration
- **Goals:** Learn from working codebase, understand architectural patterns, see best practices in action
- **Value:** Open-source reference implementation demonstrating Tauri + macOS + AI integration patterns

---

## Goals and Success Metrics

### Business Objectives

**Learning Outcomes:**
1. Master Tauri architecture and Rust/frontend bridge patterns
2. Gain practical experience with native macOS APIs (AVFoundation, file system)
3. Understand AI service integration patterns (OpenAI API)
4. Build portfolio piece demonstrating full-stack desktop development

**Functional Outcomes:**
1. Create genuinely useful tool for personal video editing workflows
2. Reduce time spent on manual captioning from hours to minutes
3. Build foundation for potential open-source project or further development

### User Success Metrics

**Learning Success:**
- Complete understanding of Tauri project structure and build process
- Ability to confidently integrate native macOS APIs in future projects
- Clear mental model of async communication between Rust backend and frontend
- Working knowledge of video processing fundamentals

**Tool Utility:**
- Successfully edit and export videos using clippy
- Generate accurate captions/transcriptions via AI automation
- Reduce caption workflow time by 80%+ compared to manual approach
- Use clippy as primary tool for quick video edits

### Key Performance Indicators (KPIs)

**Development Progress:**
1. Project completion within short-term timeline (weeks, not months)
2. All core MVP features functional
3. Clean, documented codebase ready for portfolio presentation

**Learning Validation:**
1. Can explain Tauri architecture to others
2. Can extend project with new features independently
3. Codebase demonstrates best practices (linting, error handling, testing basics)

**Functional Performance:**
1. Video playback is smooth (30+ FPS)
2. AI caption generation completes in < 2x video length
3. Export produces valid, playable video files
4. App launches in < 3 seconds

---

## Strategic Alignment and Financial Impact

### Financial Impact

**Development Investment:**
- Time: **6-7 months estimated for complete feature set** (30 weeks)
  - Weeks 1-2: Rust fundamentals + Tauri basics
  - Weeks 3-6: TRUE MVP (import, trim, export)
  - Weeks 7-12: Recording foundation (screen + webcam)
  - Weeks 13-18: Timeline maturity (multi-track, clip management)
  - Weeks 19-24: Advanced recording (PiP, audio tracks)
  - Weeks 25-30: AI integration (captions, transcription)
- Cost: Minimal - leverages free/open-source tools (Tauri, Rust)
- API costs: ~$50-100 for OpenAI API during development and testing

**Value Generated:**
- **Learning ROI:** Skills applicable to future desktop applications, consulting opportunities, career advancement
- **Tool Utility:** Eliminates $100-300/year subscription costs for basic video editing + AI captions
- **Time Savings:** 4-8 hours saved per video with automated captioning
- **Portfolio Value:** Demonstrates advanced technical skills to employers/clients

**Break-even:** Immediate (minimal cost) with ongoing value through skill development and tool utility

### Company Objectives Alignment

**Personal Development Goals:**
- Advance Rust proficiency beyond web services into desktop/systems programming
- Build portfolio pieces demonstrating full-stack capabilities
- Explore AI integration patterns for future project opportunities
- [NEEDS CONFIRMATION: Add any specific career or learning objectives]

### Strategic Initiatives

**Skill Development Path:**
- Foundation for future Tauri projects (potential consulting work, SaaS tools)
- Establishes expertise in emerging desktop development stack
- Creates opportunities for technical writing/teaching (blog posts, tutorials on learnings)

**Potential Future Opportunities:**
- Open-source community engagement if project gains traction
- Possible monetization paths (if expanded beyond learning scope)
- Foundation for other media processing applications

---

## MVP Scope

**Note:** This section defines the COMPLETE feature set for clippy. The PM will break this into epics and stories, with the TRUE MVP being the first sequence of stories that proves the core concept.

### Core Features (Complete Vision - All Non-Negotiable)

**1. Native Recording Capabilities**
- **Screen Recording:**
  - Full screen capture
  - Window selection mode
  - System audio capture
  - Microphone audio capture
  - Recording controls (start, stop, pause)
  - Save recordings directly to timeline or media library

- **Webcam Recording:**
  - Access system camera via getUserMedia() or native APIs
  - Camera selection (if multiple cameras available)
  - Audio from webcam microphone
  - Preview before recording
  - Save to timeline or media library

- **Simultaneous Recording:**
  - Screen + webcam simultaneously (picture-in-picture style)
  - Configurable PiP position and size
  - Independent audio tracks (system, microphone, webcam)
  - Real-time preview during recording
  - Save composite recording to timeline

**2. Content Import & Media Library**
- **Import Methods:**
  - Drag and drop video files (MP4, MOV, WebM)
  - File picker for importing from disk
  - Direct import from recordings

- **Media Library Panel:**
  - Thumbnail previews of all clips
  - Basic metadata display (duration, resolution, file size, codec)
  - Search/filter clips
  - Delete clips from library
  - Rename clips
  - Sort by date, name, duration

**3. Timeline Editor (Heart of the Application)**
- **Timeline Structure:**
  - Visual timeline with playhead (current time indicator)
  - Multiple tracks (minimum 2: main video + overlay/PiP, expandable to 4+)
  - Time ruler with markers
  - Zoom in/out for precision editing
  - Horizontal scrolling for long timelines

- **Clip Manipulation:**
  - Drag clips from media library onto timeline
  - Arrange clips in sequence
  - Trim clips (adjust start/end points, in/out points)
  - Split clips at playhead position
  - Delete clips from timeline
  - Move clips between tracks
  - Snap-to-grid or snap-to-clip edges
  - Ripple delete (auto-close gaps)

- **Audio Tracks:**
  - Separate audio visualization
  - Volume control per clip
  - Mute/unmute tracks
  - Audio fade in/out

**4. Preview & Playback**
- **Real-time Preview:**
  - Preview window shows current frame at playhead
  - Multi-track composition rendering
  - PiP overlay rendering
  - Smooth playback (30+ FPS)

- **Playback Controls:**
  - Play/pause
  - Stop (return to beginning)
  - Skip forward/backward (frame-by-frame, 1s, 5s)
  - Scrubbing (drag playhead to any position)
  - Audio playback synchronized with video
  - Playback speed control (0.5x, 1x, 1.5x, 2x)

**5. AI Workflow Automation (DIFFERENTIATOR)**
- **Automatic Transcription:**
  - Extract audio from video
  - Send to OpenAI Whisper API
  - Display transcript with timestamps
  - Edit transcript text

- **Caption Generation:**
  - AI-generated captions with timing
  - Caption editor (adjust timing, text)
  - Style customization (font, size, position, background)
  - Preview captions on video

- **Content Analysis:**
  - OpenAI-powered video description generation
  - Automatic tag suggestions
  - Scene detection and chapter recommendations

- **Export Options:**
  - Export captions as SRT/VTT files
  - Burn captions into video
  - Separate caption file alongside video

**6. Export & Sharing**
- **Export Configuration:**
  - Export timeline to MP4 (H.264 codec)
  - Resolution options (720p, 1080p, source resolution)
  - Quality/bitrate settings
  - Include/exclude audio tracks
  - Include/exclude captions (burned-in or separate)

- **Export Process:**
  - Progress indicator with percentage and ETA
  - Cancel export option
  - Background export (continue working)
  - Native file save dialog
  - Export queue (multiple exports)

- **Sharing (Future Enhancement):**
  - Upload to cloud storage (Google Drive, Dropbox)
  - Generate shareable link
  - Direct upload to YouTube/Vimeo

**7. Native macOS Integration**
- Native menu bar and window chrome
- macOS file dialogs and system integration
- Proper app lifecycle management
- Keyboard shortcuts following macOS conventions
- Native notifications (recording started, export complete)
- System permissions handling (screen recording, camera, microphone)

### TRUE MVP (First Story Sequence - Weeks 1-6)

**The absolute minimum to prove the concept and establish foundation:**

1. **Desktop App Foundation:**
   - Tauri app launches successfully
   - Basic UI shell (menu bar, main window)
   - Native macOS window chrome

2. **Video Import (NO recording yet):**
   - Drag & drop video files (MP4, MOV only)
   - File picker for importing
   - Display imported clip in preview window

3. **Simple Timeline View:**
   - Single-track timeline
   - Drag imported clip onto timeline
   - Playhead indicator

4. **Basic Playback:**
   - Play/pause imported video
   - Scrub playhead
   - Preview window shows video

5. **Basic Trim:**
   - Set in/out points on single clip
   - Visual trim handles

6. **Export:**
   - Export trimmed clip to MP4
   - Progress indicator
   - Native save dialog

**Success Criteria for TRUE MVP:**
- Can import a video file
- Can trim it
- Can export result
- All in native macOS app
- Foundation for adding more features

### Incremental Feature Rollout (Post-MVP)

**Phase 2 (Weeks 7-12): Recording Foundation**
- Screen recording (full screen only)
- Webcam recording (basic)
- Save recordings to media library
- Import recordings to timeline

**Phase 3 (Weeks 13-18): Timeline Maturity**
- Multi-track timeline (2-4 tracks)
- Multiple clip support
- Split, delete, arrange clips
- Media library panel with thumbnails
- Snap-to-grid editing

**Phase 4 (Weeks 19-24): Advanced Recording**
- Window selection for screen recording
- Simultaneous screen + webcam (PiP)
- Audio track management
- Recording controls (pause/resume)

**Phase 5 (Weeks 25-30): AI Integration**
- OpenAI Whisper transcription
- Caption generation and editing
- Content analysis and tagging
- Caption export (SRT/VTT)

**Phase 6+ (Future):**
- Advanced playback controls (speed, frame-by-frame)
- Export queue and background processing
- Cloud sharing integration
- Advanced audio controls

### Out of Scope (Not Planned)

**Advanced Professional Features:**
- Keyframe animation
- Advanced color grading tools
- Multi-camera editing
- Proxy workflow for 4K+ files
- Plugin system
- Motion tracking
- Chroma key (green screen)

**Platform Expansion:**
- Windows/Linux versions (macOS only for now)
- Mobile companion apps
- Cloud sync between devices

**Enterprise Features:**
- Team collaboration
- Version control
- Asset management systems
- Workflow automation beyond AI

### Success Criteria (Complete Vision)

**Functional (Complete Feature Set):**
1. Can record screen + webcam simultaneously with PiP
2. Can import external video files and recordings into media library
3. Can edit multi-track timeline with drag-drop, trim, split operations
4. Can preview timeline with smooth real-time playback
5. Can generate AI captions and transcriptions
6. Can export complete edited video with multiple resolution options
7. All features work reliably without crashes

**Technical:**
1. Demonstrates clean Tauri architecture (clear Rust/frontend separation)
2. Native macOS recording APIs properly integrated (ScreenCaptureKit, AVFoundation)
3. Multi-track timeline rendering performs smoothly (30+ FPS playback)
4. OpenAI API integration functional with error handling
5. Codebase is well-structured, documented, and maintainable
6. Proper error handling for permissions (camera, microphone, screen recording)

**Learning:**
1. Deep understanding of Rust fundamentals (ownership, borrowing, async)
2. Mastery of Tauri architecture and IPC patterns
3. Knowledge of video processing pipeline (capture → processing → encoding)
4. Can confidently build and extend desktop applications
5. Portfolio-worthy demonstration of full-stack desktop development

**Performance:**
1. Screen recording captures at 30+ FPS without dropping frames
2. Timeline preview renders smoothly for 1080p content
3. Video export completes near real-time (1 min video → ~60-90s export)
4. App launch time < 3 seconds
5. Memory usage remains reasonable with multiple clips (< 2GB for typical projects)

**Usability:**
1. Recording workflow is intuitive (2-3 clicks to start recording)
2. Timeline editing feels responsive and natural
3. AI caption generation completes in < 2x video length
4. Export process provides clear feedback and progress
5. Keyboard shortcuts work consistently

---

## Post-MVP Vision

**Note:** Phases 1-5 deliver all core non-negotiable features (see MVP Scope section). This section outlines potential future enhancements beyond the core feature set.

### Phase 7+ Features (Optional Enhancements)

**Enhanced AI Capabilities:**
- Real-time AI suggestions during editing
- Auto-removal of silence/filler words
- Smart b-roll suggestions
- Sentiment analysis for content optimization
- Auto-generated video summaries
- AI-powered video search (search by spoken words)

**Advanced Editing:**
- Visual effects library (transitions, overlays)
- Keyframe animation for effects
- Basic color grading panel
- Text overlays and titles with templates
- Audio waveform visualization
- Audio ducking (auto-reduce music when speaking)

**Workflow Improvements:**
- Project templates and presets
- Batch export functionality
- Auto-save and project recovery
- Keyboard shortcut customization
- Undo/redo with history panel
- Project folders and organization

**Collaboration Features:**
- Share project files
- Cloud sync (iCloud, Dropbox)
- Comments and annotations
- Version history

### Long-term Vision

**clippy as Learning Platform (1-2 years):**
Transform clippy into a comprehensive learning resource for Tauri development:
- Extensive documentation and architecture guides
- Tutorial series on building desktop apps
- Plugin system demonstrating extensibility patterns
- Community contributions and ecosystem

**clippy as Production Tool:**
If community adoption occurs, evolve into lightweight alternative to bloated video editors:
- Cross-platform support (Windows, Linux)
- Cloud sync and collaboration features
- Advanced AI-powered editing assistance
- Integration with content creation workflows

**clippy as AI Showcase:**
Demonstrate cutting-edge AI integration in desktop applications:
- Multi-modal AI (vision + language models)
- Real-time AI suggestions during editing
- Voice-controlled editing interface
- Automated content optimization for different platforms

### Expansion Opportunities

**Open Source Community:**
- GitHub repository with comprehensive docs
- Contributor guidelines and architecture documentation
- Plugin ecosystem for community extensions
- Educational resource for desktop development

**Commercial Potential:**
- Freemium model (basic free, advanced AI features paid)
- Educational licensing for coding bootcamps
- White-label opportunities for video platforms

**Technical Writing:**
- Blog series on Tauri development learnings
- Conference talks on modern desktop development
- Video tutorial series (meta: editing tutorial videos with clippy)
- Technical book or course on Tauri applications

**Career Development:**
- Portfolio piece for desktop development roles
- Consulting opportunities in Tauri/Rust desktop apps
- Technical leadership in emerging frameworks

---

## Technical Considerations

### Platform Requirements

**Target Platform:**
- macOS 12+ (Monterey and later)
- Apple Silicon (M1/M2/M3) primary target, Intel support secondary
- Minimum 8GB RAM, 16GB recommended for smooth performance

**Browser/Runtime:**
- Tauri 2.x (latest stable)
- WebView2 (system-provided WebKit on macOS)

**Performance Requirements:**
- Video playback: 30+ FPS for 1080p content
- UI responsiveness: < 100ms interaction latency
- Export speed: Near real-time for 1080p content (1 minute video exports in ~60-90 seconds)
- App launch time: < 3 seconds cold start

**Accessibility:**
- Keyboard navigation support
- VoiceOver compatibility (basic level)
- High contrast mode support

### Technology Preferences

**Backend (Rust):**
- **Tauri 2.x:** Core framework for desktop app shell
- **ffmpeg-next / ffmpeg bindings:** Video processing, encoding, decoding, format conversion
- **tokio:** Async runtime for API calls, file operations, and real-time recording
- **serde:** JSON serialization for frontend communication
- **reqwest:** OpenAI API client (async HTTP)
- **ScreenCaptureKit bindings:** macOS screen recording (requires macOS 12.3+)
- **AVFoundation bindings:** Native macOS camera/webcam access and audio capture (via Objective-C bridge)
- **CoreAudio bindings:** System audio and microphone capture
- **screencapturekit-rs or custom bindings:** Access to native recording APIs

**Frontend:**
- **Framework:** React 18+
- **Video player:** HTML5 video element with Video.js or Plyr for enhanced controls
- **Timeline UI:** HTML5 Canvas with Fabric.js for drag-drop timeline manipulation
- **State management:** Zustand for simplicity (lightweight, less boilerplate than Redux)
- **Build tool:** Vite (Tauri default)
- **UI Library:** Tailwind CSS for rapid styling
- **Drag & Drop:** react-dnd or native HTML5 drag-drop API
- **Recording UI:** getUserMedia() API for webcam preview in browser

**AI/API Integration:**
- **OpenAI API:** Whisper for transcription, GPT-4 for content analysis
- **API client:** Rust-based (reqwest) for better error handling and security

**Data Storage:**
- **Project files:** JSON-based format for editability and debugging
- **User preferences:** Native macOS preferences system
- **Media cache:** Temporary directory with cleanup

### Architecture Considerations

**Core Architecture Pattern:**
```
┌─────────────────────────────────────────────┐
│         Frontend (React + Canvas)          │
│  - Timeline UI (Fabric.js)                 │
│  - Video Player (HTML5 + Video.js)         │
│  - Recording Controls                       │
│  - Media Library Panel                      │
└──────────────────┬──────────────────────────┘
                   │ IPC Commands/Events
┌──────────────────▼──────────────────────────┐
│          Tauri Core (Rust Backend)         │
│  - Recording Manager (Screen/Webcam)        │
│  - Video Processing (FFmpeg)                │
│  - Timeline State & Rendering               │
│  - Export Pipeline                          │
│  - AI Integration (OpenAI Client)           │
└──────────────────┬──────────────────────────┘
                   │ Native API Calls
┌──────────────────▼──────────────────────────┐
│      macOS System (Native APIs)            │
│  - ScreenCaptureKit (screen recording)      │
│  - AVFoundation (webcam, audio)             │
│  - CoreAudio (system audio, mic)            │
│  - FileSystem (import/export)               │
└──────────────────┬──────────────────────────┘
                   │ External API
┌──────────────────▼──────────────────────────┐
│         OpenAI Services (Cloud)            │
│  - Whisper API (transcription)              │
│  - GPT-4 (content analysis)                 │
└─────────────────────────────────────────────┘
```

**Key Architectural Decisions:**

**1. Recording Architecture:**
- **Screen Recording:** ScreenCaptureKit API called from Rust backend (macOS 12.3+)
- **Webcam:** getUserMedia() in frontend for preview, AVFoundation in Rust for actual recording
- **Audio:** CoreAudio in Rust for system audio + microphone capture
- **Real-time Encoding:** FFmpeg encodes streams in real-time to prevent memory bloat
- **PiP Composition:** Rust backend composites screen + webcam streams using FFmpeg filters

**2. Video Processing Location:**
- **Rust backend handles all video processing** (recommended for learning and performance)
- WebCodecs API not used (experimental, limited support)
- Backend-heavy approach demonstrates Tauri patterns and avoids browser limitations

**3. State Management:**
- **Project state:** Rust backend owns canonical state (timeline, clips, recordings)
- **UI state:** Frontend manages ephemeral UI state only (playhead position, UI controls)
- **Sync pattern:** Command pattern with event-driven updates
- **Recording state:** Backend streams recording status events to frontend

**4. Timeline & Rendering Pipeline:**
- **Import Flow:** File → FFmpeg metadata extraction → Thumbnail generation → Media library
- **Timeline Flow:** Drag clips to timeline → Build edit decision list (EDL) → Preview renderer
- **Preview Rendering:** FFmpeg processes EDL on-demand for playhead position
- **Export Flow:** Final EDL → FFmpeg encoding → MP4 file

**5. Recording Pipeline:**
- **Start Recording:** Frontend triggers command → Rust starts ScreenCaptureKit/AVFoundation → Real-time FFmpeg encoding
- **Stop Recording:** Frontend stops → Rust finalizes file → Auto-import to media library → Notify frontend
- **Simultaneous Mode:** Two capture streams → FFmpeg composites with PiP filter → Single output file

**6. AI Integration:**
- Audio extraction in Rust backend (FFmpeg)
- API calls from Rust (better secret management, API key security)
- Progressive results streaming to frontend for UX (chunk-by-chunk transcription)
- Results cached in project file to avoid re-processing

**7. Error Handling:**
- Rust Result types throughout backend
- Permission errors surfaced early (request permissions on first use)
- Graceful degradation for AI features (offline mode shows error, editing still works)
- Recording failures don't crash app (show notification, save partial recording)
- User-friendly error messages in frontend with actionable suggestions

**Integration Points:**
- **Tauri Commands:** Rust functions exposed to frontend (recording control, import, export, AI calls)
- **Events:** Backend-to-frontend notifications (recording status, progress updates, AI results, errors)
- **File System:** Native dialogs, drag-drop handling, file watching for imports
- **Process Management:** FFmpeg as subprocess pool, managed by Rust for parallel operations
- **Permissions:** Request and manage macOS permissions (camera, microphone, screen recording)

---

## Constraints and Assumptions

### Constraints

**Time:**
- **6-7 month development timeline** for complete feature set
- Learning Rust from zero will consume significant time upfront
- Must balance learning fundamentals vs progress velocity
- Incremental delivery across 6 phases required to maintain momentum

**Resources:**
- Solo developer project (no team support)
- Limited budget for paid services (OpenAI API usage)
- No dedicated QA or testing resources

**Technical:**
- macOS 12.3+ required for ScreenCaptureKit (modern API)
- macOS-only limits reach but reduces complexity
- FFmpeg limitations and real-time encoding performance challenges
- OpenAI API rate limits and cumulative costs during development ($50-100)
- Tauri ecosystem maturity (some features still evolving)
- **ScreenCaptureKit Rust bindings may not exist** - may need custom Objective-C bridge
- Multi-track timeline rendering performance is complex
- Real-time video composition (PiP) requires careful optimization

**Skill/Expertise:**
- **No prior Rust experience** - learning language fundamentals while building
- Limited video processing domain knowledge (learning as building)
- First Tauri project (learning framework fundamentals)
- AVFoundation expertise limited
- **Double learning curve:** Rust language + Tauri framework + video processing simultaneously

**Scope:**
- **Extremely ambitious for solo developer learning Rust from zero**
- Feature set comparable to commercial products (Loom, basic Premiere)
- Must maintain strict phase boundaries to avoid burnout
- AI features dependent on OpenAI API quality/availability
- Recording + editing + AI is effectively three complex applications in one

### Key Assumptions

**Technical Assumptions:**
1. FFmpeg bindings for Rust are stable and well-documented enough for recording, editing, and export
2. Tauri 2.x provides sufficient native macOS integration capabilities
3. ScreenCaptureKit can be accessed from Rust (via Objective-C bridge or custom bindings)
4. AVFoundation can be accessed via Objective-C bridge from Rust for webcam/audio
5. Real-time screen recording performance is achievable without dropped frames (30+ FPS)
6. OpenAI Whisper API provides sufficient accuracy for captions (>90%)
7. macOS WebKit webview + Canvas performance is adequate for multi-track timeline UI
8. FFmpeg can composite screen + webcam streams in real-time for PiP recording

**User Assumptions:**
1. Target Mac has sufficient processing power (M1 or better recommended)
2. Users have OpenAI API access (or willing to provide API key)
3. Video files are in common formats (MP4, MOV) not exotic codecs
4. Users accept some rough edges in exchange for AI automation features

**Learning Assumptions:**
1. Tauri documentation and community resources are sufficient for learning
2. Building real project is better learning than tutorials for experienced developer
3. Making architectural mistakes and refactoring is valuable learning
4. Short timeline creates helpful forcing function against over-engineering

**Product Assumptions:**
1. AI-powered captions are sufficiently valuable to justify tool use
2. Lightweight, fast editor has market appeal vs bloated alternatives
3. Open-source release could attract community interest
4. Portfolio value justifies investment even if tool isn't widely adopted

**Validation Needed:**
- ScreenCaptureKit Rust bindings availability (may need to build custom)
- Real-time recording performance on target hardware (M1/M2 Macs)
- OpenAI API costs for typical video processing workload
- FFmpeg learning curve and real-time encoding complexity
- Multi-track timeline UI performance with Canvas + Fabric.js
- PiP composition performance during simultaneous recording
- macOS app distribution requirements (signing, notarization)
- Memory usage with multiple video streams and timeline clips

---

## Risks and Open Questions

### Key Risks

**Technical Risks:**

1. **ScreenCaptureKit Integration (CRITICAL)**
   - *Risk:* Rust bindings for ScreenCaptureKit don't exist or are immature, requiring custom Objective-C bridge
   - *Impact:* Weeks of additional work, potential project blocker
   - *Mitigation:* Research existing bindings immediately, prepare to write custom bridge using objc crate, consider alternative APIs if ScreenCaptureKit proves too difficult

2. **Real-time Recording Performance (HIGH)**
   - *Risk:* Cannot achieve 30+ FPS screen capture with encoding, or PiP composition causes frame drops
   - *Impact:* Core feature unusable, poor user experience
   - *Mitigation:* Prototype recording early (Phase 2), test on target hardware, accept lower resolution/frame rate initially, optimize encoding settings

3. **FFmpeg Integration Complexity (HIGH)**
   - *Risk:* Video processing and real-time encoding proves more complex than anticipated
   - *Impact:* Project delayed significantly, features cut
   - *Mitigation:* Start with FFmpeg proof-of-concept early, use existing libraries (ffmpeg-next), accept limited format support, focus on MP4/H.264 only

4. **Rust Learning Curve (CRITICAL)**
   - *Risk:* Learning Rust fundamentals (ownership, borrowing, lifetimes) while building complex application is extremely challenging
   - *Impact:* Severe development slowdown, potential project abandonment, frustration
   - *Mitigation:* Complete Rust Book chapters 1-10 first, start with simplest Tauri examples, lean heavily on community (Tauri Discord, Rust forums), accept using examples/templates without full understanding initially, budget extra time for Rust-specific debugging

3. **Tauri Learning Curve (MEDIUM-HIGH)**
   - *Risk:* Tauri patterns and Rust/frontend bridge take longer to master than expected, compounded by Rust inexperience
   - *Impact:* Development slowdown, frustration
   - *Mitigation:* Work through official Tauri examples first, join Tauri Discord community, start with simple features, build UI-first to stay in React comfort zone while learning Rust backend incrementally

4. **Video Performance Issues (MEDIUM)**
   - *Risk:* Video playback/timeline sluggish, poor user experience
   - *Impact:* Tool unusable for real editing
   - *Mitigation:* Implement performance profiling early, use proxy/thumbnail strategies, accept lower resolution for preview

5. **OpenAI API Costs (LOW-MEDIUM)**
   - *Risk:* AI features too expensive to use regularly during development
   - *Impact:* Limited testing, unexpected costs
   - *Mitigation:* Use short test videos, monitor API usage, implement cost warnings

6. **Multi-track Timeline Complexity (MEDIUM-HIGH)**
   - *Risk:* Real-time multi-track rendering and preview too slow or buggy
   - *Impact:* Poor editing experience, frustrated users
   - *Mitigation:* Start with single track, add tracks incrementally, use proxy/thumbnail strategies for preview, accept lower preview quality

7. **Scope Creep (CRITICAL - Already At Risk)**
   - *Risk:* Feature additions push beyond 6-month timeline, project never completes
   - *Impact:* Burnout, abandoned project, wasted investment
   - *Mitigation:* **STRICT phase boundaries**, complete Phase 1 (TRUE MVP) before any Phase 2 work, weekly progress reviews, ruthlessly defer nice-to-haves, accept "good enough" at each phase

**Learning Risks:**

7. **Surface-Level Learning (MEDIUM)**
   - *Risk:* Focus on getting things working rather than understanding deeply
   - *Impact:* Weak foundation for future Tauri projects
   - *Mitigation:* Document architectural decisions, explain code to yourself, refactor key sections

8. **Burnout Risk (HIGH)**
   - *Risk:* 6-month solo project with steep learning curve leads to burnout
   - *Impact:* Project abandonment before completion
   - *Mitigation:* Celebrate phase completions, take breaks between phases, maintain sustainable pace, engage community for motivation

9. **Tutorial Hell Avoidance (LOW)**
   - *Risk:* Get stuck seeking perfect tutorial instead of building
   - *Impact:* Analysis paralysis, no progress
   - *Mitigation:* Time-box research phases (2 weeks max for Rust learning), embrace learning through mistakes

**Product Risks:**

10. **Tool Not Actually Useful (MEDIUM)**
   - *Risk:* After 6 months building, don't actually use clippy for real work due to bugs or missing features
   - *Impact:* Demotivation, questionable portfolio value
   - *Mitigation:* Dog-food the tool early (use it to edit dev logs), test with real video editing tasks during development, Phase 1 MVP must be actually useful

### Open Questions

**Technical - Recording:**
1. Do mature Rust bindings exist for ScreenCaptureKit? If not, how difficult to build custom bridge?
2. What's the performance overhead of real-time FFmpeg encoding during screen capture?
3. How to handle simultaneous screen + webcam streams efficiently?
4. Best approach for PiP composition - real-time or post-recording?
5. How to manage system permissions (screen recording, camera, microphone) gracefully?
6. What's the memory footprint of recording 1080p + webcam + audio simultaneously?

**Technical - Editing:**
1. Which FFmpeg Rust bindings library is most mature? (ffmpeg-next, ffmpeg-sys-next, or other)
2. How to handle audio extraction efficiently for AI processing?
3. Best approach for timeline scrubbing performance with multi-track?
4. Should we use native AVFoundation or stick with FFmpeg entirely?
5. How to handle large video files (>1GB) without performance issues?
6. What's the best pattern for Rust ↔ Frontend state synchronization?
7. How to render multi-track preview in real-time?
8. Fabric.js vs custom Canvas implementation for timeline?

**AI Integration:**
1. Should we support local Whisper model as alternative to API?
2. What's acceptable latency for AI features? (2x video length? 5x?)
3. How to handle API failures gracefully?
4. Should we cache AI results in project files?
5. What level of caption editing capability is needed?

**Development Process:**
1. How much time for pure Rust + Tauri learning before coding? (Critical given no Rust experience)
2. What testing strategy is realistic for short timeline?
3. Should we build UI-first (React comfort zone) or backend-first (steeper learning)?
4. When to introduce CI/CD if at all?
5. What's the right balance between learning fundamentals vs. getting things working?

**User Experience:**
1. What's minimum viable UI polish for portfolio piece?
2. Should we support project files for saving/loading edits?
3. How important is undo/redo for MVP?
4. What keyboard shortcuts are must-haves?

**Distribution:**
1. How to handle macOS app signing and notarization?
2. GitHub releases sufficient or need formal distribution?
3. Should we plan for Homebrew distribution?
4. What licensing makes sense if open-sourcing?

### Areas Needing Further Research

**Pre-Development Research (Weeks 1-2):**
1. **Rust Fundamentals (CRITICAL - No Prior Experience - 1-2 weeks)**
   - Complete Rust Book chapters 1-10 minimum (ownership, borrowing, structs, enums, error handling)
   - Work through Rustlings exercises for hands-on practice
   - Understand async/await basics (critical for Tauri)
   - Practice with simple CLI tools before Tauri
   - Build a simple multi-threaded CLI tool to understand concurrency

2. **ScreenCaptureKit Investigation (CRITICAL - Week 2)**
   - Research ScreenCaptureKit API capabilities and requirements
   - Find or evaluate existing Rust bindings (screencapturekit-rs, or build custom)
   - Test basic screen capture proof-of-concept
   - Measure performance and frame rate capabilities
   - Understand permission model and user prompts

3. **Tauri Ecosystem Survey (Week 2)**
   - Review official Tauri 2.x documentation and getting started guide
   - Study 2-3 existing Tauri video/media projects
   - Understand IPC patterns and best practices
   - Identify pain points from community discussions
   - Complete official Tauri tutorial/examples

4. **FFmpeg Integration Path (Week 2)**
   - Compare available Rust FFmpeg bindings
   - Test basic video import/export proof-of-concept
   - Test real-time encoding during "recording" simulation
   - Understand codec support and limitations
   - Estimate complexity of timeline → export pipeline
   - Test PiP composition with FFmpeg filters

5. **macOS Native Integration (Week 2)**
   - Research AVFoundation access from Tauri for webcam
   - Research CoreAudio for microphone/system audio capture
   - Understand file dialog and system integration patterns
   - Review app signing/notarization requirements
   - Test WebView + Canvas performance with timeline mockup

6. **OpenAI API Testing (Optional - Can defer to Phase 5)**
   - Test Whisper API with sample videos
   - Measure accuracy and processing time
   - Calculate cost projections for development
   - Explore GPT-4 content tagging capabilities

**Ongoing Research:**
- Real-time video recording and encoding optimization
- Multi-track timeline rendering performance
- Canvas + Fabric.js timeline UI patterns
- Rust async patterns for long-running operations (recording, encoding)
- Error handling best practices in Tauri apps
- Memory management for video streams

---

## Appendices

### A. Research Summary

*Research to be conducted during pre-development phase (Week 1)*

**Tauri Ecosystem:**
- Official documentation review and tutorials
- Community examples and best practices
- Performance benchmarks for desktop video apps

**Video Processing:**
- FFmpeg Rust bindings comparison
- Video codec support and limitations
- Performance optimization strategies

**AI Integration:**
- OpenAI API capabilities and pricing
- Whisper accuracy benchmarks
- Content analysis use cases

### B. Stakeholder Input

**Primary Stakeholder:** zeno (developer/creator)
- Learning objective: Master Tauri fundamentals, Rust language, and native macOS integration (recording + video processing)
- Functional objective: Build complete screen recording + editing tool with AI automation
- Timeline: 6-7 months (30 weeks) for full feature set, 3-6 weeks for TRUE MVP
- Success criteria: Working application with recording, multi-track editing, and AI features. Portfolio-worthy demonstration of advanced desktop development skills.

**Secondary Stakeholders:** Developer community
- Potential interest in Tauri reference implementation
- Value from documented learning journey
- Possible contributors if open-sourced

### C. References

**Technical Resources:**
- Tauri Documentation: https://tauri.app/
- ScreenCaptureKit Documentation: https://developer.apple.com/documentation/screencapturekit
- AVFoundation Documentation: https://developer.apple.com/av-foundation/
- FFmpeg Documentation: https://ffmpeg.org/documentation.html
- OpenAI API Documentation: https://platform.openai.com/docs
- Rust AVFoundation Bindings: (to be researched)
- Fabric.js Documentation: http://fabricjs.com/
- Video.js Documentation: https://videojs.com/

**Inspiration / Competitive Analysis:**
- **Loom:** Screen recording + webcam, simple editing, cloud-based ($12.50/month) - PRIMARY COMPETITOR
- **Descript:** AI-powered editing + transcription ($12-24/month)
- **ScreenFlow:** macOS screen recorder + editor ($169 one-time)
- **Camtasia:** Screen recording + editing ($179.99)
- **OBS Studio:** Free, open-source recording but no editing
- **iMovie:** Free but limited, no recording, no AI features
- **Final Cut Pro:** Professional but expensive ($299), no native recording
- **DaVinci Resolve:** Complex, steep learning curve, free but advanced

**Learning Resources:**
- Tauri Discord community
- Rust video processing examples
- Desktop app architecture patterns
- AI integration best practices

**Market Context:**
- Growing demand for AI-powered content creation tools
- Trend toward lightweight desktop apps (vs Electron bloat)
- Increasing Tauri adoption in developer community
- Rising importance of accessibility (captions) for video content

---

_This Product Brief serves as the foundational input for Product Requirements Document (PRD) creation._

_Next Steps: Handoff to Product Manager for PRD development using the `workflow prd` command._
