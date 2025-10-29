/**
 * RecordingControls Component
 *
 * Recording control buttons with status indicators.
 * Displays record/stop/pause/resume/cancel buttons and a pulsing recording indicator.
 */

import { Circle, Square, Pause, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface RecordingControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  isStopping: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onCancelRecording: () => void;
}

export function RecordingControls({
  isRecording,
  isPaused,
  isStopping,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  onCancelRecording,
}: RecordingControlsProps) {
  return (
    <div className="flex items-center gap-4">
      {/* Record Button - Shown when idle */}
      {!isRecording && !isPaused && (
        <Button
          onClick={onStartRecording}
          size="lg"
          className="bg-red-600 hover:bg-red-700 text-white gap-2"
        >
          <Circle className="w-5 h-5 fill-current" />
          Record Screen
        </Button>
      )}

      {/* Recording State - Shown during active recording */}
      {isRecording && !isPaused && (
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

          {/* Pause Button */}
          <Button
            onClick={onPauseRecording}
            disabled={isStopping}
            size="lg"
            variant="outline"
            className="gap-2"
          >
            <Pause className="w-5 h-5" />
            Pause
          </Button>

          {/* Stop Button */}
          <Button
            onClick={onStopRecording}
            disabled={isStopping}
            size="lg"
            variant="destructive"
            className="gap-2"
          >
            <Square className="w-5 h-5 fill-current" />
            {isStopping ? 'Stopping...' : 'Stop'}
          </Button>

          {/* Cancel Button */}
          <Button
            onClick={onCancelRecording}
            disabled={isStopping}
            size="lg"
            variant="ghost"
            className="gap-2"
          >
            <X className="w-5 h-5" />
            Cancel
          </Button>
        </>
      )}

      {/* Paused State - Shown when recording is paused */}
      {isPaused && (
        <>
          {/* Paused Indicator */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              {/* Static yellow dot */}
              <div className="relative w-3 h-3 rounded-full bg-yellow-500" />
            </div>
            <span className="text-sm font-medium text-yellow-600">Paused</span>
          </div>

          {/* Resume Button */}
          <Button
            onClick={onResumeRecording}
            size="lg"
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            <Play className="w-5 h-5 fill-current" />
            Resume
          </Button>

          {/* Stop Button */}
          <Button
            onClick={onStopRecording}
            disabled={isStopping}
            size="lg"
            variant="destructive"
            className="gap-2"
          >
            <Square className="w-5 h-5 fill-current" />
            {isStopping ? 'Stopping...' : 'Stop'}
          </Button>

          {/* Cancel Button */}
          <Button
            onClick={onCancelRecording}
            size="lg"
            variant="ghost"
            className="gap-2"
          >
            <X className="w-5 h-5" />
            Cancel
          </Button>
        </>
      )}
    </div>
  );
}
