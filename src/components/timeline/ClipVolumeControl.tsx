import { Volume2, VolumeX } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { useTimelineStore } from '@/stores/timelineStore';
import { cn } from '@/lib/utils';
import { useState } from 'react';

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
 * - Per-track audio control for multi-audio clips (Story 4.7)
 *
 * AC #1: Volume slider for selected clip (0-200%, default 100%)
 * AC #4: Visual indicator on clip shows volume level
 * AC #5: Mute button for quick silence (0% volume)
 * AC #6 (Story 4.7): Per-track volume/mute for multi-audio clips
 */
export function ClipVolumeControl({ clipId, className }: ClipVolumeControlProps) {
  const clip = useTimelineStore((state) => state.getClip(clipId));
  const updateClip = useTimelineStore((state) => state.updateClip);
  const toggleClipMute = useTimelineStore((state) => state.toggleClipMute);
  const setAudioTrackVolume = useTimelineStore((state) => state.setAudioTrackVolume);
  const setAudioTrackMuted = useTimelineStore((state) => state.setAudioTrackMuted);
  const getAudioTrackSettings = useTimelineStore((state) => state.getAudioTrackSettings);

  // Story 4.7: Track selected audio track for multi-audio clips
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number>(0);

  if (!clip) {
    return null;
  }

  // Story 4.7: Determine if this is a multi-audio clip
  const isMultiAudio = clip.audioTracks && clip.audioTracks.length > 0;
  const currentTrack = isMultiAudio && clip.audioTracks ? clip.audioTracks[selectedTrackIndex] : undefined;

  // Get current volume and muted state
  let currentVolume: number;
  let currentMuted: boolean;

  if (isMultiAudio && currentTrack) {
    // Multi-audio clip: use per-track settings from store or defaults from clip
    const trackSettings = getAudioTrackSettings(clipId, selectedTrackIndex);
    currentVolume = trackSettings?.volume ?? currentTrack.volume ?? 1.0;
    currentMuted = trackSettings?.muted ?? currentTrack.muted ?? false;
  } else {
    // Single-audio clip: use clip-level volume/muted
    currentVolume = clip.volume ?? 100;
    currentMuted = clip.muted ?? false;
  }

  // Convert volume to percentage (0-200%)
  const volumeValue = isMultiAudio ? currentVolume * 100 : currentVolume;

  const handleVolumeChange = (values: number[]) => {
    if (isMultiAudio) {
      // Multi-audio clip: set per-track volume (0.0 to 2.0)
      setAudioTrackVolume(clipId, selectedTrackIndex, values[0] / 100);
    } else {
      // Single-audio clip: set clip-level volume (0 to 200)
      updateClip(clipId, { volume: values[0] });
    }
  };

  const handleMuteToggle = () => {
    if (isMultiAudio) {
      // Multi-audio clip: toggle per-track muted state
      setAudioTrackMuted(clipId, selectedTrackIndex, !currentMuted);
    } else {
      // Single-audio clip: toggle clip-level muted state
      toggleClipMute(clipId);
    }
  };

  const displayVolume = currentMuted ? 0 : volumeValue;
  const volumePercentage = Math.round(displayVolume);

  // Color coding for visual feedback
  const getVolumeColor = (volume: number) => {
    if (currentMuted) return 'text-gray-400';
    if (volume === 0) return 'text-gray-400';
    if (volume < 50) return 'text-yellow-500';
    if (volume > 150) return 'text-red-500';
    return 'text-blue-500';
  };

  // Story 4.7: Get track color for visual indicator
  const getTrackColor = (label: string): string => {
    const normalizedLabel = label.toLowerCase();
    if (normalizedLabel.includes('system')) return 'bg-blue-500';
    if (normalizedLabel.includes('microphone') || normalizedLabel.includes('mic')) return 'bg-red-500';
    if (normalizedLabel.includes('webcam') || normalizedLabel.includes('camera')) return 'bg-green-500';
    return 'bg-gray-500';
  };

  return (
    <div className={cn('flex flex-col gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg', className)}>
      {/* Story 4.7: Track Selector Dropdown (only for multi-audio clips) */}
      {isMultiAudio && clip.audioTracks && clip.audioTracks.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Track:</span>
          <div className="flex gap-1">
            {clip.audioTracks.map((track, index) => (
              <button
                key={track.trackIndex}
                onClick={() => setSelectedTrackIndex(index)}
                className={cn(
                  'px-2 py-1 text-xs font-medium rounded transition-colors',
                  selectedTrackIndex === index
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                )}
                title={track.label}
              >
                <span className={cn('inline-block w-2 h-2 rounded-full mr-1', getTrackColor(track.label))} />
                {track.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Volume Controls */}
      <div className="flex items-center gap-3">
        {/* Mute/Unmute Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMuteToggle}
          className="shrink-0"
          title={currentMuted ? 'Unmute' : 'Mute'}
        >
          {currentMuted ? (
            <VolumeX className="h-5 w-5 text-red-500" />
          ) : (
            <Volume2 className={cn('h-5 w-5', getVolumeColor(volumeValue))} />
          )}
        </Button>

        {/* Volume Slider */}
        <div className="flex-1">
          <Slider
            value={[volumeValue]}
            onValueChange={handleVolumeChange}
            min={0}
            max={200}
            step={1}
            disabled={currentMuted}
            className="w-full"
            aria-label={isMultiAudio && currentTrack ? `${currentTrack.label} volume` : 'Clip volume'}
          />
        </div>

        {/* Volume Percentage Display */}
        <div className={cn('text-sm font-medium w-12 text-right shrink-0', getVolumeColor(displayVolume))}>
          {volumePercentage}%
        </div>
      </div>
    </div>
  );
}
