import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MainLayout } from "./MainLayout";

// Mock the Timeline component to avoid Konva canvas issues
vi.mock("@/components/timeline/Timeline", () => ({
  Timeline: () => <div data-testid="timeline-mock">Timeline Component</div>,
}));

describe("MainLayout", () => {
  it("renders all three panels", () => {
    render(<MainLayout />);

    // Check that all three panels are present by their aria-labels
    expect(screen.getByLabelText("Video Preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Timeline Editor")).toBeInTheDocument();
    expect(screen.getByLabelText("Media Library")).toBeInTheDocument();
  });

  it("has full viewport dimensions", () => {
    const { container } = render(<MainLayout />);
    const mainDiv = container.firstChild as HTMLElement;

    expect(mainDiv).toHaveClass("h-screen");
    expect(mainDiv).toHaveClass("w-screen");
  });

  it("uses flexbox layout", () => {
    const { container } = render(<MainLayout />);
    const mainDiv = container.firstChild as HTMLElement;

    expect(mainDiv).toHaveClass("flex");
  });

  it("displays preview and media library empty state messages", () => {
    render(<MainLayout />);

    expect(
      screen.getByText(/no video loaded.*select a file.*preview/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no media imported.*drag files.*import video/i)
    ).toBeInTheDocument();
  });

  describe("Keyboard Navigation", () => {
    let user: ReturnType<typeof userEvent.setup>;

    beforeEach(() => {
      user = userEvent.setup();
    });

    it("cycles focus forward through panels in correct order: Media Library → Preview → Timeline", async () => {
      render(<MainLayout />);

      const mediaLibrary = screen.getByLabelText("Media Library");
      const preview = screen.getByLabelText("Video Preview");
      const timeline = screen.getByLabelText("Timeline Editor");

      // Focus Media Library first
      mediaLibrary.focus();
      expect(document.activeElement).toBe(mediaLibrary);

      // Press Tab: should move to Preview
      await user.keyboard("{Tab}");
      expect(document.activeElement).toBe(preview);

      // Press Tab: should move to Timeline
      await user.keyboard("{Tab}");
      expect(document.activeElement).toBe(timeline);
    });

    it("wraps focus from Timeline back to Media Library when Tab is pressed", async () => {
      render(<MainLayout />);

      const mediaLibrary = screen.getByLabelText("Media Library");
      const timeline = screen.getByLabelText("Timeline Editor");

      // Start at Timeline
      timeline.focus();
      expect(document.activeElement).toBe(timeline);

      // Press Tab: should wrap to Media Library
      await user.keyboard("{Tab}");
      expect(document.activeElement).toBe(mediaLibrary);
    });

    it("cycles focus backward through panels with Shift+Tab", async () => {
      render(<MainLayout />);

      const mediaLibrary = screen.getByLabelText("Media Library");
      const preview = screen.getByLabelText("Video Preview");
      const timeline = screen.getByLabelText("Timeline Editor");

      // Start at Preview
      preview.focus();
      expect(document.activeElement).toBe(preview);

      // Press Shift+Tab: should move to Media Library
      await user.keyboard("{Shift>}{Tab}{/Shift}");
      expect(document.activeElement).toBe(mediaLibrary);

      // Press Shift+Tab: should wrap to Timeline
      await user.keyboard("{Shift>}{Tab}{/Shift}");
      expect(document.activeElement).toBe(timeline);
    });

    it("starts Tab cycling at Media Library when no panel is focused", async () => {
      render(<MainLayout />);

      const mediaLibrary = screen.getByLabelText("Media Library");

      // Don't focus any panel initially
      // Press Tab: should focus Media Library (first in cycle)
      await user.keyboard("{Tab}");
      expect(document.activeElement).toBe(mediaLibrary);
    });

    it("keeps panel focused when Enter is pressed (placeholder behavior)", async () => {
      render(<MainLayout />);

      const preview = screen.getByLabelText("Video Preview");

      // Focus Preview
      preview.focus();
      expect(document.activeElement).toBe(preview);

      // Press Enter: should keep focus on Preview
      await user.keyboard("{Enter}");
      expect(document.activeElement).toBe(preview);
    });

    it("all panels are keyboard focusable with tabIndex", () => {
      render(<MainLayout />);

      const mediaLibrary = screen.getByLabelText("Media Library");
      const preview = screen.getByLabelText("Video Preview");
      const timeline = screen.getByLabelText("Timeline Editor");

      expect(mediaLibrary).toHaveAttribute("tabIndex", "0");
      expect(preview).toHaveAttribute("tabIndex", "0");
      expect(timeline).toHaveAttribute("tabIndex", "0");
    });
  });
});
