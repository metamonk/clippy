/**
 * Recording Mode Toggle Component (Story 4.4)
 *
 * Allows users to switch between recording modes:
 * - Screen: Full screen or window recording
 * - Webcam: Webcam-only recording
 * - Screen + Webcam (PiP): Picture-in-picture recording with both screen and webcam
 */

import { useRecordingStore } from '@/stores/recordingStore';
import type { RecordingMode } from '@/types/recording';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Monitor, Camera, Video } from 'lucide-react';

export function RecordingModeToggle() {
  const recordingMode = useRecordingStore((state) => state.recordingMode);
  const setRecordingMode = useRecordingStore((state) => state.setRecordingMode);

  const handleModeChange = (value: string) => {
    const mode = value as RecordingMode;
    setRecordingMode(mode);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Recording Mode</label>
      <Tabs value={recordingMode} onValueChange={handleModeChange}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="screen" className="flex items-center gap-2">
            <Monitor className="w-4 h-4" />
            Screen
          </TabsTrigger>
          <TabsTrigger value="webcam" className="flex items-center gap-2">
            <Camera className="w-4 h-4" />
            Webcam
          </TabsTrigger>
          <TabsTrigger value="pip" className="flex items-center gap-2">
            <Video className="w-4 h-4" />
            Screen + Webcam
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
