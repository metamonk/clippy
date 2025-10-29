import { invoke } from '@tauri-apps/api/core';

/**
 * MPV command response structure
 */
interface MpvResponse {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Set MPV volume based on clip volume and mute state
 *
 * @param volume - Clip volume (0-200 scale)
 * @param muted - Whether the clip is muted
 * @returns Promise resolving to command response
 *
 * @remarks
 * Volume conversion happens in backend:
 * - Clippy uses 0-200% scale
 * - MPV uses 0-100 scale
 * - Conversion: mpv_volume = min(100, clippy_volume / 2)
 * - Muted clips: MPV volume set to 0 regardless of volume value
 */
export async function setMpvVolume(volume: number, muted: boolean): Promise<MpvResponse> {
  try {
    const response = await invoke<MpvResponse>('mpv_set_volume', {
      volume,
      muted,
    });

    return response;
  } catch (error) {
    console.error('[MPV] Failed to set volume:', error);
    return {
      success: false,
      message: `Failed to set volume: ${error}`,
    };
  }
}

/**
 * Apply fade-in and fade-out audio filters to MPV playback
 *
 * @param fadeInMs - Fade-in duration in milliseconds from clip start
 * @param fadeOutMs - Fade-out duration in milliseconds before clip end
 * @param clipDurationMs - Total clip duration in milliseconds
 * @returns Promise resolving to command response
 *
 * @remarks
 * Uses MPV's afade audio filter with dynamic timing:
 * - Fade-in: `afade=t=in:st=0:d={fade_in_sec}`
 * - Fade-out: `afade=t=out:st={start_time}:d={fade_out_sec}`
 * Filters are applied in chain: volume → fade-in → fade-out
 */
export async function applyMpvFadeFilters(
  fadeInMs: number,
  fadeOutMs: number,
  clipDurationMs: number
): Promise<MpvResponse> {
  try {
    const response = await invoke<MpvResponse>('mpv_apply_fade_filters', {
      fadeInMs,
      fadeOutMs,
      clipDurationMs,
    });

    return response;
  } catch (error) {
    console.error('[MPV] Failed to apply fade filters:', error);
    return {
      success: false,
      message: `Failed to apply fade filters: ${error}`,
    };
  }
}

/**
 * Clear all audio filters from MPV playback
 *
 * @returns Promise resolving to command response
 */
export async function clearMpvAudioFilters(): Promise<MpvResponse> {
  try {
    const response = await invoke<MpvResponse>('mpv_clear_audio_filters');

    return response;
  } catch (error) {
    console.error('[MPV] Failed to clear audio filters:', error);
    return {
      success: false,
      message: `Failed to clear audio filters: ${error}`,
    };
  }
}
