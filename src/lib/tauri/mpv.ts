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
