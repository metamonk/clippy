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

// Mock canvas for WebcamPreview component tests
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextType: string) => {
  if (contextType === '2d') {
    return {
      clearRect: vi.fn(),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(4),
      })),
      canvas: {
        width: 640,
        height: 480,
      },
    };
  }
  return null;
});

// Mock Radix UI Tabs component for tests
vi.mock('@radix-ui/react-tabs', () => {
  const React = require('react');

  // Create context for managing tab state
  const TabsContext = React.createContext(null);

  const Tabs = ({ value, onValueChange, children, ...props }: any) => {
    return React.createElement(
      TabsContext.Provider,
      { value: { value, onValueChange } },
      React.createElement('div', props, children)
    );
  };

  const TabsList = ({ children, ...props }: any) => {
    return React.createElement('div', { role: 'tablist', ...props }, children);
  };

  const TabsTrigger = ({ value, children, ...props }: any) => {
    const context = React.useContext(TabsContext);
    const isActive = context?.value === value;

    return React.createElement(
      'button',
      {
        role: 'tab',
        'data-state': isActive ? 'active' : 'inactive',
        'aria-selected': isActive,
        onClick: () => context?.onValueChange(value),
        ...props,
      },
      children
    );
  };

  const TabsContent = ({ value, children, ...props }: any) => {
    const context = React.useContext(TabsContext);
    const isActive = context?.value === value;

    if (!isActive) return null;

    return React.createElement('div', { role: 'tabpanel', ...props }, children);
  };

  return {
    Root: Tabs,
    List: TabsList,
    Trigger: TabsTrigger,
    Content: TabsContent,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
  };
});
