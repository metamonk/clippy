import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock ResizeObserver for Radix UI components (Slider)
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock canvas for Konva.js tests
vi.mock("canvas", () => ({
  default: {},
}));

// Mock Tauri internals to prevent test warnings
// @ts-expect-error - Tauri types not available in test environment
window.__TAURI_INTERNALS__ = {
  transformCallback: (callback: unknown, once = false) => {
    return { id: Math.random(), callback, once };
  },
  invoke: vi.fn(),
  convertFileSrc: vi.fn((filePath: string) => `asset://localhost/${filePath}`),
};

// Mock Tauri event plugin internals
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
  unregisterListener: vi.fn(),
};
