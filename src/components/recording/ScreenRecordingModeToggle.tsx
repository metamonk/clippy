/**
 * Screen Recording Mode Toggle Component (Story 4.1)
 *
 * Toggle between "Full Screen" and "Window" recording modes.
 */

import { useRecordingStore } from '@/stores/recordingStore';
import type { ScreenRecordingMode } from '@/types/recording';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Monitor, AppWindow } from 'lucide-react';

interface ScreenRecordingModeToggleProps {
  /** Callback when recording mode changes */
  onModeChange?: (mode: ScreenRecordingMode) => void;
}

export function ScreenRecordingModeToggle({ onModeChange }: ScreenRecordingModeToggleProps) {
  const { screenRecordingMode, setScreenRecordingMode } = useRecordingStore();

  const handleModeChange = (value: string) => {
    const mode = value as ScreenRecordingMode;
    setScreenRecordingMode(mode);
    onModeChange?.(mode);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Recording Mode</label>
      <Tabs value={screenRecordingMode} onValueChange={handleModeChange}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="fullscreen" className="flex items-center gap-2">
            <Monitor className="w-4 h-4" />
            Full Screen
          </TabsTrigger>
          <TabsTrigger value="window" className="flex items-center gap-2">
            <AppWindow className="w-4 h-4" />
            Window
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
