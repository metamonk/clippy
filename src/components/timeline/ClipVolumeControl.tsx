import { Volume2, VolumeX } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { useTimelineStore } from '@/stores/timelineStore';
import { cn } from '@/lib/utils';

interface ClipVolumeControlProps {
  clipId: string;
  className?: string;
}

/**
 * ClipVolumeControl Component
 *
 * Provides volume control UI for individual timeline clips.
 * Features:
 * - Volume slider (0-200%, default 100%)
 * - Mute/unmute toggle button
 * - Visual percentage display
 * - Keyboard accessibility via Radix UI Slider
 *
 * AC #1: Volume slider for selected clip (0-200%, with 100% as default)
 * AC #4: Visual indicator on clip shows volume level
 * AC #5: Mute button for quick silence (0% volume)
 */
export function ClipVolumeControl({ clipId, className }: ClipVolumeControlProps) {
  const clip = useTimelineStore((state) => state.getClip(clipId));
  const setClipVolume = useTimelineStore((state) => state.setClipVolume);
  const toggleClipMute = useTimelineStore((state) => state.toggleClipMute);

  if (!clip) {
    return null;
  }

  const handleVolumeChange = (values: number[]) => {
    setClipVolume(clipId, values[0]);
  };

  const handleMuteToggle = () => {
    toggleClipMute(clipId);
  };

  const displayVolume = clip.muted ? 0 : clip.volume;
  const volumePercentage = Math.round(displayVolume);

  // Color coding for visual feedback
  const getVolumeColor = (volume: number) => {
    if (clip.muted) return 'text-gray-400';
    if (volume === 0) return 'text-gray-400';
    if (volume < 50) return 'text-yellow-500';
    if (volume > 150) return 'text-red-500';
    return 'text-blue-500';
  };

  return (
    <div className={cn('flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg', className)}>
      {/* Mute/Unmute Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleMuteToggle}
        className="shrink-0"
        title={clip.muted ? 'Unmute' : 'Mute'}
      >
        {clip.muted ? (
          <VolumeX className="h-5 w-5 text-red-500" />
        ) : (
          <Volume2 className={cn('h-5 w-5', getVolumeColor(clip.volume))} />
        )}
      </Button>

      {/* Volume Slider */}
      <div className="flex-1">
        <Slider
          value={[clip.volume]}
          onValueChange={handleVolumeChange}
          min={0}
          max={200}
          step={1}
          disabled={clip.muted}
          className="w-full"
          aria-label="Clip volume"
        />
      </div>

      {/* Volume Percentage Display */}
      <div className={cn('text-sm font-medium w-12 text-right shrink-0', getVolumeColor(displayVolume))}>
        {volumePercentage}%
      </div>
    </div>
  );
}
