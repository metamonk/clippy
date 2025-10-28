# E2E Tests for clippy

This directory contains end-to-end tests that validate the complete user workflows in the clippy video editor.

## Test Structure

Tests follow the **Given-When-Then** pattern and use **Test IDs** for traceability:

```typescript
// Test ID format: {STORY_ID}-{LEVEL}-{SEQ}
// Example: 1.3-E2E-001

test('1.3-E2E-001: User can import MP4 file via file picker', async ({ page }) => {
  // GIVEN: clippy app is open with empty media library
  // WHEN: User imports a valid MP4 file
  // THEN: Video appears in media library with correct metadata
});
```

## Test Levels

- **E2E (End-to-End):** Full user journeys through the UI
- **INT (Integration):** Cross-layer validation (Frontend ↔ Tauri ↔ Backend)

## Running E2E Tests

**Prerequisites:**
- Build the Tauri app: `npm run tauri build`
- Ensure test fixtures exist in `tests/fixtures/`

**Run all E2E tests:**
```bash
npx playwright test
```

**Run specific test:**
```bash
npx playwright test tests/e2e/video-import.spec.ts
```

**Run with UI mode (debugging):**
```bash
npx playwright test --ui
```

**View test report:**
```bash
npx playwright show-report
```

## Test Fixtures

Test fixtures are located in `tests/fixtures/`:
- `sample-video.mp4` - Short (5s) valid MP4 for import tests
- `long-video.mp4` - Longer (30s) video for playback/export tests
- `invalid-video.avi` - Invalid format for negative testing

## Writing New E2E Tests

1. **Identify the story and AC:** Start from `docs/epics.md`
2. **Assign Test ID:** Use format `{STORY}-{LEVEL}-{SEQ}` (e.g., `1.3-E2E-001`)
3. **Use Given-When-Then:** Structure test with clear phases
4. **Add explicit assertions:** Verify observable user outcomes
5. **Clean up:** Tests should be self-cleaning (reset state after)

**Example:**

```typescript
import { test, expect } from '@playwright/test';

test('1.6-E2E-001: User can drag clip from library to timeline', async ({ page }) => {
  // GIVEN: clippy is open with a video in the media library
  await page.goto('tauri://localhost');
  await importTestVideo(page, 'sample-video.mp4');

  // WHEN: User drags the clip from library to timeline
  const mediaItem = page.locator('[data-testid="media-item"]').first();
  const timeline = page.locator('[data-testid="timeline-drop-zone"]');
  await mediaItem.dragTo(timeline);

  // THEN: Clip appears on the timeline at position 0
  await expect(page.locator('[data-testid="timeline-clip"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-clip"]')).toHaveAttribute('data-start-time', '0');
});
```

## CI/CD Integration

E2E tests run on:
- **Pull Requests:** Block merge if tests fail
- **Main branch:** Run after every commit
- **Nightly:** Full E2E suite with extended timeouts

## Troubleshooting

**Test fails with "App not found":**
- Run `npm run tauri build` first
- Check that `.app` bundle exists in `src-tauri/target/release/bundle/`

**Test times out:**
- Increase timeout in `playwright.config.ts`
- Check that FFmpeg is installed and working
- Look for errors in `~/Library/Logs/clippy/app.log`

**Flaky tests:**
- Add explicit wait conditions: `await expect(element).toBeVisible()`
- Avoid hard waits (`page.waitForTimeout(1000)`)
- Use Playwright's auto-waiting features

## Coverage Goals

- **P0 Acceptance Criteria:** 100% E2E coverage
- **P1 Acceptance Criteria:** 90% E2E coverage
- **P2 Acceptance Criteria:** 70% E2E coverage

Current coverage tracked in `docs/traceability-matrix-epic-N.md`
