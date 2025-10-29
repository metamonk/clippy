/**
 * Custom render function for React Testing Library
 *
 * Provides necessary wrappers and context providers for testing components
 * that use Zustand stores, shadcn/ui components, and other app-level dependencies.
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';

/**
 * All Providers wrapper for tests
 *
 * Currently minimal - shadcn/ui components work without explicit providers
 * Zustand stores are global singletons and don't need providers
 */
function AllTheProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * Custom render function that wraps components in necessary providers
 *
 * Usage:
 *   import { renderWithProviders } from '@/test-utils/render';
 *   renderWithProviders(<MyComponent />);
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

// Re-export everything from React Testing Library
export * from '@testing-library/react';

// Override render with our custom version
export { renderWithProviders as render };
