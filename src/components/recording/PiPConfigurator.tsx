/**
 * PiPConfigurator Component (Story 4.5)
 *
 * Provides UI for configuring Picture-in-Picture (PiP) overlay position and size.
 * Includes position presets, size slider, and live preview with drag-and-drop.
 */

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useRecordingStore } from '@/stores/recordingStore';
import type { PipPreset } from '@/types/recording';
import {
  calculatePipSize,
  calculatePresetPosition,
  getDefaultScreenDimensions,
  getScreenDimensions,
  constrainPipPosition,
  calculatePercentageFromWidth,
} from '@/lib/recording/pipUtils';
import { CornerUpLeft, CornerUpRight, CornerDownLeft, CornerDownRight } from 'lucide-react';

export interface PiPConfiguratorProps {
  /** Optional screen dimensions override (for testing/preview) */
  screenDimensions?: { width: number; height: number };
}

export function PiPConfigurator({ screenDimensions: customScreenDimensions }: PiPConfiguratorProps) {
  const pipPreset = useRecordingStore((state) => state.pipPreset);
  const pipPosition = useRecordingStore((state) => state.pipPosition);
  const pipSize = useRecordingStore((state) => state.pipSize);
  const setPipPreset = useRecordingStore((state) => state.setPipPreset);
  const setPipPosition = useRecordingStore((state) => state.setPipPosition);
  const setPipSize = useRecordingStore((state) => state.setPipSize);

  // State for actual screen dimensions
  const [actualScreenDimensions, setActualScreenDimensions] = useState<{ width: number; height: number }>(
    getDefaultScreenDimensions()
  );

  // Use provided screen dimensions (for testing) or actual dimensions
  const screenDimensions = customScreenDimensions || actualScreenDimensions;

  // Local state for size percentage slider (10-40%)
  const [sizePercentage, setSizePercentage] = useState<number>(20);

  // Fetch actual screen dimensions on mount
  useEffect(() => {
    if (!customScreenDimensions) {
      getScreenDimensions().then(setActualScreenDimensions);
    }
  }, [customScreenDimensions]);

  // Initialize pipSize if not set
  useEffect(() => {
    if (!pipSize) {
      const initialSize = calculatePipSize(sizePercentage, screenDimensions.width);
      setPipSize(initialSize);
    } else {
      // Sync slider with existing size
      const percentage = calculatePercentageFromWidth(pipSize.width, screenDimensions.width);
      setSizePercentage(percentage);
    }
  }, []);

  // Initialize pipPosition if not set (use preset)
  useEffect(() => {
    if (!pipPosition && pipSize) {
      const position = calculatePresetPosition(pipPreset, pipSize, screenDimensions);
      setPipPosition(position);
    }
  }, [pipSize]);

  /**
   * Handle preset button selection
   */
  const handlePresetSelect = (preset: PipPreset) => {
    setPipPreset(preset);

    if (preset !== 'custom' && pipSize) {
      const position = calculatePresetPosition(preset, pipSize, screenDimensions);
      setPipPosition(position);
    }
  };

  /**
   * Handle size slider change
   */
  const handleSizeChange = (value: number[]) => {
    const percentage = value[0];
    setSizePercentage(percentage);

    // Calculate new size maintaining 16:9 aspect ratio
    const newSize = calculatePipSize(percentage, screenDimensions.width);
    setPipSize(newSize);

    // Recalculate position if using preset (to keep it aligned)
    if (pipPreset !== 'custom' && pipPosition) {
      const newPosition = calculatePresetPosition(pipPreset, newSize, screenDimensions);
      setPipPosition(newPosition);
    } else if (pipPosition) {
      // For custom positions, constrain to stay within bounds after resize
      const constrainedPosition = constrainPipPosition(pipPosition, newSize, screenDimensions);
      setPipPosition(constrainedPosition);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-base">PiP Position & Size</Label>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Configure where the webcam overlay appears and its size
        </p>
      </div>

      {/* Position Presets */}
      <div className="space-y-2">
        <Label className="text-sm">Position Presets</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={pipPreset === 'top-left' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePresetSelect('top-left')}
            className="flex items-center gap-2"
          >
            <CornerUpLeft className="w-4 h-4" />
            Top Left
          </Button>
          <Button
            variant={pipPreset === 'top-right' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePresetSelect('top-right')}
            className="flex items-center gap-2"
          >
            <CornerUpRight className="w-4 h-4" />
            Top Right
          </Button>
          <Button
            variant={pipPreset === 'bottom-left' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePresetSelect('bottom-left')}
            className="flex items-center gap-2"
          >
            <CornerDownLeft className="w-4 h-4" />
            Bottom Left
          </Button>
          <Button
            variant={pipPreset === 'bottom-right' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePresetSelect('bottom-right')}
            className="flex items-center gap-2"
          >
            <CornerDownRight className="w-4 h-4" />
            Bottom Right
          </Button>
        </div>
      </div>

      {/* Size Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="pip-size-slider" className="text-sm">
            Overlay Size
          </Label>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {sizePercentage}% of screen width
          </span>
        </div>
        <Slider
          id="pip-size-slider"
          aria-label="Overlay Size"
          min={10}
          max={40}
          step={1}
          value={[sizePercentage]}
          onValueChange={handleSizeChange}
          className="w-full"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {pipSize ? `${pipSize.width}×${pipSize.height}px` : 'Calculating...'}
        </p>
      </div>

      {/* Position Indicator */}
      {pipPosition && (
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <div>Position: x={pipPosition.x}, y={pipPosition.y}</div>
          {pipPreset === 'custom' && (
            <div className="text-blue-600 dark:text-blue-400">
              Custom position (drag preview to adjust)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
