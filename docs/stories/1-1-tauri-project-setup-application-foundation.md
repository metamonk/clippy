# Story 1.1: Tauri Project Setup & Application Foundation

Status: ready-for-dev

## Story

As a developer,
I want to set up a Tauri project with React frontend and establish basic app structure,
So that I have a working foundation to build clippy features upon.

## Acceptance Criteria

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

## Tasks / Subtasks

- [ ] Initialize Tauri project with React + TypeScript (AC: 1, 4)
  - [ ] Run `npm create tauri-app@latest clippy` with React + TypeScript options
  - [ ] Verify src-tauri/ and src/ directory structure created
  - [ ] Install initial dependencies listed in architecture.md
  - [ ] Verify project builds with `npm run tauri build`

- [ ] Configure development environment and tooling (AC: 5, 9)
  - [ ] Add Tailwind CSS with PostCSS configuration
  - [ ] Install and configure ESLint with TypeScript parser
  - [ ] Install and configure Prettier with ESLint integration
  - [ ] Configure shadcn/ui component library
  - [ ] Verify hot reload works with `npm run tauri dev`

- [ ] Set up frontend testing infrastructure (AC: 7)
  - [ ] Install Vitest and React Testing Library
  - [ ] Create vitest.config.ts configuration file
  - [ ] Write sample component test that passes
  - [ ] Verify tests run with `npm run test`

- [ ] Set up Rust backend testing infrastructure (AC: 8)
  - [ ] Create sample Rust module with unit test
  - [ ] Verify tests run with `cargo test` from src-tauri/
  - [ ] Configure test coverage reporting

- [ ] Configure Rust dependencies and logging (AC: 10)
  - [ ] Add required Rust dependencies to Cargo.toml (serde, tokio, anyhow, thiserror, tracing, tracing-subscriber, chrono, uuid)
  - [ ] Configure tracing with file output to ~/Library/Logs/clippy/app.log
  - [ ] Add sample tracing::info! log and verify output to file
  - [ ] Verify log directory created on first run

- [ ] Verify native macOS integration (AC: 2, 3)
  - [ ] Launch app and verify native macOS window chrome
  - [ ] Verify native menu bar appears with app name
  - [ ] Test window minimize/maximize/close buttons
  - [ ] Verify app respects macOS light/dark mode

- [ ] Initialize version control (AC: 11)
  - [ ] Run `git init` if not already initialized
  - [ ] Create .gitignore with node_modules/, target/, dist/, etc.
  - [ ] Create initial commit with project scaffold
  - [ ] Verify all necessary files tracked

## Dev Notes

### Architecture Context

This story implements the foundational architecture decisions from [architecture.md](../architecture.md):

**Technology Stack:**
- Tauri 2.x framework (latest 2025 version)
- React 18 with TypeScript 5.x
- Vite build tool for fast HMR
- Tailwind CSS 3.x for styling
- shadcn/ui component library (Radix UI + Tailwind)
- Zustand for state management (will be used in later stories)

**Key Dependencies (from architecture.md):**

Frontend:
```bash
npm install zustand konva react-konva video.js @videojs/themes
npm install @tauri-apps/api @tauri-apps/plugin-fs @tauri-apps/plugin-dialog
npm install @tauri-apps/plugin-notification @tauri-apps/plugin-shell @tauri-apps/plugin-os
```

Rust (Cargo.toml):
```toml
[dependencies]
tauri = { version = "2", features = ["..." ] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
anyhow = "1"
thiserror = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
async-openai = "0.28"
ffmpeg-sidecar = "2.1"
screencapturekit = "0.3"
nokhwa = { version = "0.10", features = ["input-avfoundation"] }
```

**Logging Strategy:**
- File: ~/Library/Logs/clippy/app.log (macOS standard location)
- Use tracing crate with structured fields
- Levels: error!, warn!, info!, debug!, trace!
- Example: `tracing::info!(event = "app_startup", version = env!("CARGO_PKG_VERSION"))`

**Testing Requirements:**
- Frontend: Vitest + React Testing Library
- Backend: cargo test with standard Rust testing
- Sample tests must pass to satisfy AC #7 and #8

**macOS Conventions:**
- Native window chrome (system titlebar, traffic lights)
- Native menu bar with app name
- Respects system light/dark mode
- Minimum window size enforced (1280x720) - to be implemented in Story 1.2

### Project Structure Notes

The initialized project will follow this structure (from architecture.md):

```
clippy/
├── src/                                    # React frontend
│   ├── components/
│   │   └── ui/                             # shadcn/ui components
│   ├── stores/                             # Zustand state (future stories)
│   ├── lib/
│   │   ├── tauri/                          # Tauri command wrappers
│   │   └── utils.ts
│   ├── types/
│   ├── hooks/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css                           # Tailwind imports
│
├── src-tauri/                              # Rust backend
│   ├── src/
│   │   ├── commands/                       # Tauri commands (future)
│   │   ├── services/                       # Business logic (future)
│   │   ├── models/                         # Data structures (future)
│   │   ├── utils/
│   │   ├── error.rs                        # Custom error types
│   │   ├── lib.rs                          # Tauri app setup
│   │   └── main.rs                         # Entry point
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── build.rs
│
├── public/                                 # Static assets
├── docs/                                   # Project documentation
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
├── vitest.config.ts
└── README.md
```

### References

- [Source: docs/architecture.md - Project Initialization section]
- [Source: docs/architecture.md - Complete Project Structure section]
- [Source: docs/architecture.md - Decision Summary table]
- [Source: docs/epics.md - Story 1.1: Tauri Project Setup & Application Foundation]
- [Source: docs/PRD.md - NFR002: Platform Compatibility (macOS 12+)]

## Dev Agent Record

### Context Reference

- [Story Context XML](./1-1-tauri-project-setup-application-foundation.context.xml)

### Agent Model Used

<!-- Will be populated during implementation -->

### Debug Log References

<!-- Will be populated during implementation -->

### Completion Notes List

<!-- Will be populated during implementation -->

### File List

<!-- Will be populated during implementation -->
