import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Developer Settings State
 *
 * Stores developer-only settings like FPS overlay display.
 * Persisted to localStorage for convenience across sessions.
 */
interface DevSettingsState {
  /** Show FPS overlay in video player (dev mode only) */
  showFpsOverlay: boolean;

  /** Toggle FPS overlay display */
  toggleFpsOverlay: () => void;

  /** Set FPS overlay display state */
  setShowFpsOverlay: (show: boolean) => void;
}

/**
 * Developer Settings Store
 *
 * Manages developer-only settings with localStorage persistence.
 * Used for features like FPS monitoring, performance metrics, debug overlays.
 */
export const useDevSettingsStore = create<DevSettingsState>()(
  persist(
    (set) => ({
      showFpsOverlay: false,

      toggleFpsOverlay: () => set((state) => ({ showFpsOverlay: !state.showFpsOverlay })),

      setShowFpsOverlay: (show: boolean) => set({ showFpsOverlay: show }),
    }),
    {
      name: "dev-settings-storage",
      version: 1,
    }
  )
);
