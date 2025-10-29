import "@testing-library/jest-dom";
import { vi } from "vitest";
import * as React from "react";

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

// Mock global ImageData constructor for WebcamPreview tests
globalThis.ImageData = class ImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace: PredefinedColorSpace;

  constructor(data: Uint8ClampedArray, width: number, height?: number);
  constructor(width: number, height: number);
  constructor(
    dataOrWidth: Uint8ClampedArray | number,
    widthOrHeight: number,
    height?: number
  ) {
    if (dataOrWidth instanceof Uint8ClampedArray) {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = height || dataOrWidth.length / (widthOrHeight * 4);
    } else {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4);
    }
    this.colorSpace = 'srgb';
  }
};

// Mock canvas for WebcamPreview component tests
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextType: string) => {
  if (contextType === '2d') {
    return {
      clearRect: vi.fn(),
      putImageData: vi.fn(),
      createImageData: vi.fn((width: number, height: number) => {
        return new ImageData(width, height);
      }),
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

  // Create context for managing tab state
  const TabsContext = React.createContext<{ value: any; onValueChange: any } | null>(null);

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

// Mock Radix UI Select component for tests
vi.mock('@radix-ui/react-select', () => {

  // Create context for managing select state
  const SelectContext = React.createContext<{ value: any; onValueChange: (newValue: string) => void } | null>(null);

  const Select = ({ value, onValueChange, children, ...props }: any) => {
    const [internalValue, setInternalValue] = React.useState(value);
    const currentValue = value !== undefined ? value : internalValue;

    const handleValueChange = (newValue: string) => {
      setInternalValue(newValue);
      onValueChange?.(newValue);
    };

    return React.createElement(
      SelectContext.Provider,
      { value: { value: currentValue, onValueChange: handleValueChange } },
      React.createElement('div', { 'data-radix-select': true, ...props }, children)
    );
  };

  const SelectTrigger = ({ children, ...props }: any) => {
    return React.createElement('button', { type: 'button', role: 'combobox', ...props }, children);
  };

  const SelectValue = ({ placeholder, ...props }: any) => {
    const context = React.useContext(SelectContext);
    return React.createElement('span', props, context?.value || placeholder);
  };

  const SelectContent = ({ children, ...props }: any) => {
    return React.createElement('div', { role: 'listbox', ...props }, children);
  };

  const SelectGroup = ({ children, ...props }: any) => {
    return React.createElement('div', { role: 'group', ...props }, children);
  };

  const SelectLabel = ({ children, ...props }: any) => {
    return React.createElement('div', { role: 'presentation', ...props }, children);
  };

  const SelectItem = ({ value, children, disabled, ...props }: any) => {
    const context = React.useContext(SelectContext);
    const isSelected = context?.value === value;

    return React.createElement(
      'div',
      {
        role: 'option',
        'data-state': isSelected ? 'checked' : 'unchecked',
        'aria-selected': isSelected,
        'aria-disabled': disabled,
        onClick: disabled ? undefined : () => context?.onValueChange(value),
        ...props,
      },
      children
    );
  };

  const SelectScrollUpButton = ({ children, ...props }: any) => {
    return React.createElement('div', props, children);
  };
  SelectScrollUpButton.displayName = 'SelectScrollUpButton';

  const SelectScrollDownButton = ({ children, ...props }: any) => {
    return React.createElement('div', props, children);
  };
  SelectScrollDownButton.displayName = 'SelectScrollDownButton';

  const SelectSeparator = (props: any) => {
    return React.createElement('div', { role: 'separator', ...props });
  };

  const Portal = ({ children }: any) => children;

  const Icon = ({ children, ...props }: any) => {
    return React.createElement('span', props, children);
  };

  const ItemText = ({ children, ...props }: any) => {
    return React.createElement('span', props, children);
  };

  const ItemIndicator = ({ children, ...props }: any) => {
    return React.createElement('span', props, children);
  };

  const Viewport = ({ children, ...props }: any) => {
    return React.createElement('div', props, children);
  };

  return {
    Root: Select,
    Trigger: SelectTrigger,
    Value: SelectValue,
    Content: SelectContent,
    Group: SelectGroup,
    Label: SelectLabel,
    Item: SelectItem,
    ScrollUpButton: SelectScrollUpButton,
    ScrollDownButton: SelectScrollDownButton,
    Separator: SelectSeparator,
    Portal,
    Icon,
    ItemText,
    ItemIndicator,
    Viewport,
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectGroup,
    SelectLabel,
    SelectItem,
    SelectScrollUpButton,
    SelectScrollDownButton,
    SelectSeparator,
  };
});

// Mock pointer capture methods for Radix UI Slider (jsdom doesn't implement these)
Element.prototype.setPointerCapture = vi.fn();
Element.prototype.releasePointerCapture = vi.fn();
Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);

// Mock react-konva for timeline component tests
vi.mock('react-konva', () => {

  // Create a generic mock component factory
  const createMockComponent = (name: string) => {
    return React.forwardRef((props: any, ref: any) => {
      return React.createElement('div', {
        ...props,
        ref,
        'data-testid': `mock-${name.toLowerCase()}`,
        'data-component': name
      }, props.children);
    });
  };

  return {
    Stage: createMockComponent('Stage'),
    Layer: createMockComponent('Layer'),
    Rect: createMockComponent('Rect'),
    Group: createMockComponent('Group'),
    Text: createMockComponent('Text'),
    Line: createMockComponent('Line'),
    Path: createMockComponent('Path'),
    Circle: createMockComponent('Circle'),
    Image: createMockComponent('Image'),
  };
});
