# Story 1.2: Frontend UI Shell & Layout Structure

Status: drafted

## Story

As a user,
I want to see a professional layout when I launch the app,
So that I understand where video preview, timeline, and media library will be.

## Acceptance Criteria

1. Main layout divided into three areas: preview (top), timeline (bottom), media library (sidebar)
2. Styled with Tailwind CSS following macOS design aesthetics
3. Responsive layout adjusts to window resizing
4. Empty states show placeholders for each area with helpful text
5. Basic navigation menu in native macOS menu bar
6. All UI controls accessible via keyboard navigation (Tab, Arrow keys, Enter)
7. Application enforces minimum window size of 1280x720 for timeline usability

## Tasks / Subtasks

- [ ] Create main layout component structure (AC: 1, 3)
  - [ ] Create src/components/layout/ directory
  - [ ] Create MainLayout.tsx with three-panel flex layout (preview top, timeline bottom, media library sidebar)
  - [ ] Implement responsive sizing with flexbox (preview 40% height, timeline 60% height, sidebar 20% width)
  - [ ] Add resize handles between panels for user adjustment
  - [ ] Test layout responds correctly to window resize events

- [ ] Build individual panel components with empty states (AC: 1, 4)
  - [ ] Create PreviewPanel.tsx with empty state: "No video loaded. Import a file to preview."
  - [ ] Create TimelinePanel.tsx with empty state: "Timeline will appear here. Drag clips from media library."
  - [ ] Create MediaLibraryPanel.tsx with empty state: "Import videos to begin editing."
  - [ ] Style empty states with centered text, subtle icons, and helpful hints

- [ ] Apply macOS-style Tailwind CSS styling (AC: 2)
  - [ ] Use neutral gray color palette (bg-gray-50, bg-gray-100 for panels)
  - [ ] Apply rounded corners (rounded-lg) to panel containers
  - [ ] Add subtle shadows (shadow-sm) for depth
  - [ ] Use system font stack (font-sans in Tailwind = San Francisco on macOS)
  - [ ] Ensure consistent spacing with Tailwind scale (p-4, gap-2, etc.)

- [ ] Integrate layout into App.tsx (AC: 1)
  - [ ] Update App.tsx to import and render MainLayout component
  - [ ] Remove default Tauri scaffold content
  - [ ] Verify layout fills entire window viewport (h-screen, w-screen)

- [ ] Configure native macOS menu bar (AC: 5)
  - [ ] Update src-tauri/tauri.conf.json to define menu structure
  - [ ] Add File menu with: Import (Cmd+O), Save Project (Cmd+S), Quit (Cmd+Q)
  - [ ] Add Edit menu with: Undo (Cmd+Z), Redo (Cmd+Shift+Z)
  - [ ] Add Window menu with: Minimize, Zoom, Close
  - [ ] Test menu items appear in native macOS menu bar

- [ ] Implement keyboard navigation (AC: 6)
  - [ ] Ensure Tab key cycles through panels in logical order (media library → preview → timeline)
  - [ ] Add focus indicators (ring-2, ring-blue-500) when panels receive keyboard focus
  - [ ] Test Arrow keys work for navigating within focused panels (future stories will expand this)
  - [ ] Verify Enter key activates focused elements

- [ ] Enforce minimum window size (AC: 7)
  - [ ] Update src-tauri/tauri.conf.json window configuration
  - [ ] Set minWidth: 1280, minHeight: 720 in window.json config
  - [ ] Test window cannot be resized below minimum dimensions
  - [ ] Verify layout remains usable at exactly 1280x720

- [ ] Write component tests (AC: testing standard)
  - [ ] Write Vitest test for MainLayout: renders three panels
  - [ ] Write Vitest test for PreviewPanel: displays empty state correctly
  - [ ] Write Vitest test for TimelinePanel: displays empty state correctly
  - [ ] Write Vitest test for MediaLibraryPanel: displays empty state correctly
  - [ ] Verify all tests pass with `npm run test`

## Dev Notes

### Architecture Context

This story implements the core UI layout structure defined in architecture.md and establishes the visual foundation for clippy.

**UI Framework Stack:**
- React 18 with TypeScript (configured in Story 1.1)
- Tailwind CSS 3.x for utility-first styling
- shadcn/ui components for accessible UI elements (buttons, cards, etc.)
- Flexbox layout for responsive three-panel design

**Layout Design (from architecture.md, PRD.md):**

The main editing view follows a professional video editor pattern:
- **Preview Panel (top, ~40% height)**: Video playback area, will host Video.js player in Story 1.4
- **Timeline Panel (bottom, ~60% height)**: Timeline canvas, will host Konva.js timeline in Story 1.6
- **Media Library Panel (right sidebar, ~20% width)**: Imported clips, thumbnails, metadata

**macOS Design Aesthetics (PRD UX Design Principles):**
- Native macOS Human Interface Guidelines compliance
- System font (San Francisco via Tailwind font-sans)
- Neutral gray color palette (bg-gray-50, bg-gray-100, bg-gray-200)
- Subtle shadows and rounded corners for depth
- Native menu bar integration (File, Edit, Window menus)
- Minimum window size: 1280x720 (ensures timeline usability)

**Component Structure:**

```
src/
├── components/
│   ├── layout/
│   │   ├── MainLayout.tsx       # Three-panel flex container
│   │   ├── PreviewPanel.tsx     # Top: video preview area
│   │   ├── TimelinePanel.tsx    # Bottom: timeline editing area
│   │   └── MediaLibraryPanel.tsx # Right: media library sidebar
│   └── ui/                      # shadcn/ui components (from Story 1.1)
└── App.tsx                      # Integrates MainLayout
```

**Empty State Guidance:**

Empty states should be informative and friendly:
- **PreviewPanel**: "No video loaded. Import a file from the media library to preview."
- **TimelinePanel**: "Timeline will appear here. Drag clips from the media library to start editing."
- **MediaLibraryPanel**: "No media imported yet. Use File → Import or drag files here to begin."

Include subtle icons (from lucide-react or similar) to make empty states visually appealing.

**Keyboard Navigation (AC #6):**
- Tab order: Media Library → Preview → Timeline (logical workflow order)
- Focus indicators: Blue ring (ring-2 ring-blue-500) on focused panel
- Arrow keys: Enable navigation within focused panel (basic implementation, expanded in later stories)
- Enter: Activates focused elements (e.g., selecting a clip)

**Native macOS Menu Bar (AC #5):**

Configure in `src-tauri/tauri.conf.json`:

```json
{
  "tauri": {
    "windows": [{
      "title": "clippy",
      "width": 1280,
      "height": 720,
      "minWidth": 1280,
      "minHeight": 720
    }],
    "menu": {
      "items": [
        {
          "File": {
            "items": [
              { "title": "Import...", "accelerator": "CmdOrCtrl+O" },
              { "title": "Save Project", "accelerator": "CmdOrCtrl+S" },
              { "type": "Separator" },
              { "title": "Quit", "accelerator": "CmdOrCtrl+Q" }
            ]
          }
        },
        {
          "Edit": {
            "items": [
              { "title": "Undo", "accelerator": "CmdOrCtrl+Z" },
              { "title": "Redo", "accelerator": "CmdOrCtrl+Shift+Z" }
            ]
          }
        },
        {
          "Window": {
            "items": [
              { "title": "Minimize", "role": "minimize" },
              { "title": "Zoom", "role": "zoom" },
              { "title": "Close", "accelerator": "CmdOrCtrl+W" }
            ]
          }
        }
      ]
    }
  }
}
```

Note: Menu actions (Import, Save) will be wired to Tauri commands in future stories. This story only establishes the menu structure.

### Project Structure Notes

**Files Created in This Story:**
- `src/components/layout/MainLayout.tsx` - Main three-panel flex layout container
- `src/components/layout/PreviewPanel.tsx` - Top panel for video preview (empty state)
- `src/components/layout/TimelinePanel.tsx` - Bottom panel for timeline (empty state)
- `src/components/layout/MediaLibraryPanel.tsx` - Right sidebar for media library (empty state)

**Files Modified:**
- `src/App.tsx` - Replace scaffold with MainLayout integration
- `src-tauri/tauri.conf.json` - Add menu structure and minimum window size

**Expected Component API:**

```typescript
// MainLayout.tsx
export function MainLayout() {
  return (
    <div className="flex h-screen w-screen">
      <div className="flex flex-col flex-1">
        <PreviewPanel />
        <TimelinePanel />
      </div>
      <MediaLibraryPanel />
    </div>
  );
}

// PreviewPanel.tsx
export function PreviewPanel() {
  return (
    <div className="h-2/5 bg-gray-50 rounded-lg shadow-sm p-4 flex items-center justify-center">
      <EmptyState message="No video loaded. Import a file to preview." />
    </div>
  );
}

// Similar structure for TimelinePanel and MediaLibraryPanel
```

**Responsive Layout Implementation:**

Use Tailwind flex utilities for proportional sizing:
- PreviewPanel: `h-2/5` (40% of vertical space)
- TimelinePanel: `h-3/5` (60% of vertical space)
- MediaLibraryPanel: `w-1/5` (20% of horizontal space)
- Main content area: `flex-1` (remaining 80% width)

Future enhancement: Add draggable resize handles using react-resizable-panels or similar library.

**Testing Guidance:**

Component tests should verify:
1. MainLayout renders all three child panels
2. Each panel displays correct empty state text
3. Layout applies correct Tailwind classes (h-screen, w-screen, flex)
4. Panels are keyboard-focusable (tabIndex=0)

Example test structure:

```typescript
// MainLayout.test.tsx
import { render, screen } from '@testing-library/react';
import { MainLayout } from './MainLayout';

describe('MainLayout', () => {
  it('renders three panels', () => {
    render(<MainLayout />);

    expect(screen.getByText(/no video loaded/i)).toBeInTheDocument();
    expect(screen.getByText(/timeline will appear/i)).toBeInTheDocument();
    expect(screen.getByText(/import videos/i)).toBeInTheDocument();
  });

  it('has full viewport dimensions', () => {
    const { container } = render(<MainLayout />);
    const mainDiv = container.firstChild;

    expect(mainDiv).toHaveClass('h-screen', 'w-screen');
  });
});
```

### References

- [Source: docs/architecture.md - Complete Project Structure, lines 116-183]
- [Source: docs/architecture.md - User Interface Design Goals, lines 108-136]
- [Source: docs/architecture.md - Technology Stack Details, lines 262-305]
- [Source: docs/architecture.md - Implementation Patterns - React Component Structure, lines 591-648]
- [Source: docs/PRD.md - UX Design Principles, lines 97-103]
- [Source: docs/PRD.md - User Interface Design Goals - Core Screens/Views, lines 113-117]
- [Source: docs/PRD.md - NFR003: Usability and Reliability, lines 82-88]
- [Source: docs/epics.md - Story 1.2: Frontend UI Shell & Layout Structure, lines 63-79]

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

<!-- Will be populated during implementation -->

### Debug Log References

<!-- Will be populated during implementation -->

### Completion Notes List

<!-- Will be populated during implementation -->

### File List

<!-- Will be populated during implementation -->
