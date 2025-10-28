import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MediaLibraryPanel } from "./MediaLibraryPanel";

describe("MediaLibraryPanel", () => {
  it("displays correct empty state text", () => {
    render(<MediaLibraryPanel />);

    expect(
      screen.getByText(/no media imported yet.*drag files above.*import video/i)
    ).toBeInTheDocument();
  });

  it("has correct macOS styling classes", () => {
    const { container } = render(<MediaLibraryPanel />);
    const panel = container.firstChild as HTMLElement;

    expect(panel).toHaveClass("bg-gray-100");
    expect(panel).toHaveClass("rounded-lg");
    expect(panel).toHaveClass("shadow-sm");
  });

  it("has correct width proportion (20%)", () => {
    const { container } = render(<MediaLibraryPanel />);
    const panel = container.firstChild as HTMLElement;

    expect(panel).toHaveClass("w-1/5");
  });

  it("is keyboard focusable", () => {
    const { container } = render(<MediaLibraryPanel />);
    const panel = container.firstChild as HTMLElement;

    expect(panel).toHaveAttribute("tabIndex", "0");
  });

  it("has focus ring styles", () => {
    const { container } = render(<MediaLibraryPanel />);
    const panel = container.firstChild as HTMLElement;

    expect(panel).toHaveClass("focus:ring-2");
    expect(panel).toHaveClass("focus:ring-blue-500");
  });

  it("has proper ARIA attributes", () => {
    render(<MediaLibraryPanel />);

    const panel = screen.getByRole("region", { name: "Media Library" });
    expect(panel).toBeInTheDocument();
  });
});
