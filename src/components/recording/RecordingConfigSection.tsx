/**
 * Recording Configuration Section (Story 4.2)
 *
 * Collapsible configuration panel for recording quality settings.
 * Includes frame rate, resolution, and file size estimation.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRecordingStore } from '@/stores/recordingStore';
import { estimateFileSize, formatFileSizeEstimate } from '@/lib/recording/fileSizeEstimator';
import type { FrameRate, Resolution } from '@/types/recording';

export function RecordingConfigSection() {
  const [isExpanded, setIsExpanded] = useState(false);
  const frameRate = useRecordingStore((state) => state.frameRate);
  const resolution = useRecordingStore((state) => state.resolution);
  const setFrameRate = useRecordingStore((state) => state.setFrameRate);
  const setResolution = useRecordingStore((state) => state.setResolution);

  // Calculate file size estimate
  const estimatedSize = estimateFileSize(resolution, frameRate);
  const formattedEstimate = formatFileSizeEstimate(estimatedSize);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
      {/* Header - Collapsible Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          <span className="text-sm font-medium">Recording Quality Settings</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        )}
      </button>

      {/* Configuration Content */}
      {isExpanded && (
        <div className="p-4 space-y-4 bg-white dark:bg-gray-900">
          {/* Frame Rate Selector */}
          <div className="space-y-2">
            <Label htmlFor="frame-rate-select" className="text-sm">
              Frame Rate
            </Label>
            <Select
              value={frameRate.toString()}
              onValueChange={(value: string) => setFrameRate(parseInt(value) as FrameRate)}
            >
              <SelectTrigger id="frame-rate-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 FPS (Standard)</SelectItem>
                <SelectItem value="60">60 FPS (High Quality)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {frameRate === 30
                ? 'Good for tutorials and screencasts'
                : 'Best for fast motion and gameplay'}
            </p>
          </div>

          {/* Resolution Selector */}
          <div className="space-y-2">
            <Label htmlFor="resolution-select" className="text-sm">
              Resolution
            </Label>
            <Select
              value={resolution}
              onValueChange={(value: string) => setResolution(value as Resolution)}
            >
              <SelectTrigger id="resolution-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="source">Source (Native Display Resolution)</SelectItem>
                <SelectItem value="1080p">1080p (1920×1080)</SelectItem>
                <SelectItem value="720p">720p (1280×720)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {resolution === 'source'
                ? 'Capture at your display\'s native resolution'
                : resolution === '1080p'
                ? 'Most common output format, good balance'
                : 'Smaller file size, faster encoding'}
            </p>
          </div>

          {/* File Size Estimate */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
            <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-1">
              Estimated File Size
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {formattedEstimate}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
              Based on H.264 encoding with good quality settings
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
