import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Mock the Timeline component to avoid Konva canvas issues
vi.mock("@/components/timeline/Timeline", () => ({
  Timeline: () => <div data-testid="timeline-mock">Timeline Component</div>,
}));

describe("App", () => {
  it("renders without crashing", () => {
    render(<App />);
    expect(document.body).toBeTruthy();
  });

  it("renders the main layout with all three panels", () => {
    render(<App />);

    // Verify all three panels are present
    expect(screen.getByLabelText("Video Preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Timeline Editor")).toBeInTheDocument();
    expect(screen.getByLabelText("Media Library")).toBeInTheDocument();
  });
});
