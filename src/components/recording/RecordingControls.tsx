/**
 * RecordingControls Component
 *
 * Recording control buttons with status indicators.
 * Displays record/stop buttons and a pulsing recording indicator.
 */

import { Circle, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface RecordingControlsProps {
  isRecording: boolean;
  isStopping: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export function RecordingControls({
  isRecording,
  isStopping,
  onStartRecording,
  onStopRecording,
}: RecordingControlsProps) {
  return (
    <div className="flex items-center gap-4">
      {/* Record Button */}
      {!isRecording && (
        <Button
          onClick={onStartRecording}
          size="lg"
          className="bg-red-600 hover:bg-red-700 text-white gap-2"
        >
          <Circle className="w-5 h-5 fill-current" />
          Record Screen
        </Button>
      )}

      {/* Stop Button + Recording Indicator */}
      {isRecording && (
        <>
          {/* Pulsing Red Dot Indicator */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              {/* Pulsing outer ring */}
              <div
                className={cn(
                  'absolute w-4 h-4 rounded-full bg-red-500',
                  'animate-ping opacity-75'
                )}
              />
              {/* Solid inner dot */}
              <div className="relative w-3 h-3 rounded-full bg-red-600" />
            </div>
            <span className="text-sm font-medium text-red-600">Recording...</span>
          </div>

          {/* Stop Button */}
          <Button
            onClick={onStopRecording}
            disabled={isStopping}
            size="lg"
            variant="destructive"
            className="gap-2"
          >
            <Square className="w-5 h-5 fill-current" />
            {isStopping ? 'Stopping...' : 'Stop Recording'}
          </Button>
        </>
      )}
    </div>
  );
}
