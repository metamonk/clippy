import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelinePanel } from "./TimelinePanel";

// Mock the Timeline component to avoid Konva canvas issues
vi.mock("@/components/timeline/Timeline", () => ({
  Timeline: () => <div data-testid="timeline-mock">Timeline Component</div>,
}));

describe("TimelinePanel", () => {
  it("renders the timeline panel", () => {
    render(<TimelinePanel />);

    const panel = screen.getByRole("region", { name: "Timeline Editor" });
    expect(panel).toBeInTheDocument();
  });

  it("has correct macOS styling classes", () => {
    const { container } = render(<TimelinePanel />);
    const panel = container.firstChild as HTMLElement;

    expect(panel).toHaveClass("bg-gray-50");
    expect(panel).toHaveClass("rounded-lg");
    expect(panel).toHaveClass("shadow-sm");
  });

  it("has correct height proportion (60%)", () => {
    const { container } = render(<TimelinePanel />);
    const panel = container.firstChild as HTMLElement;

    expect(panel).toHaveClass("h-3/5");
  });

  it("is keyboard focusable", () => {
    const { container } = render(<TimelinePanel />);
    const panel = container.firstChild as HTMLElement;

    expect(panel).toHaveAttribute("tabIndex", "0");
  });

  it("has focus ring styles", () => {
    const { container } = render(<TimelinePanel />);
    const panel = container.firstChild as HTMLElement;

    expect(panel).toHaveClass("focus:ring-2");
    expect(panel).toHaveClass("focus:ring-blue-500");
  });

  it("has proper ARIA attributes", () => {
    render(<TimelinePanel />);

    const panel = screen.getByRole("region", { name: "Timeline Editor" });
    expect(panel).toBeInTheDocument();
  });
});
