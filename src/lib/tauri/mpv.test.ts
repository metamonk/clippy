import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setMpvVolume, applyMpvFadeFilters, clearMpvAudioFilters } from './mpv';
import { invoke } from '@tauri-apps/api/core';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('MPV Volume Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setMpvVolume', () => {
    it('should call mpv_set_volume with correct parameters', async () => {
      const mockResponse = { success: true, message: 'Volume set' };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      const result = await setMpvVolume(100, false);

      expect(invoke).toHaveBeenCalledWith('mpv_set_volume', {
        volume: 100,
        muted: false,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle muted state', async () => {
      const mockResponse = { success: true, message: 'Volume set to 0' };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      const result = await setMpvVolume(100, true);

      expect(invoke).toHaveBeenCalledWith('mpv_set_volume', {
        volume: 100,
        muted: true,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle volume at 0%', async () => {
      const mockResponse = { success: true, message: 'Volume set' };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      await setMpvVolume(0, false);

      expect(invoke).toHaveBeenCalledWith('mpv_set_volume', {
        volume: 0,
        muted: false,
      });
    });

    it('should handle volume at 200%', async () => {
      const mockResponse = { success: true, message: 'Volume set' };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      await setMpvVolume(200, false);

      expect(invoke).toHaveBeenCalledWith('mpv_set_volume', {
        volume: 200,
        muted: false,
      });
    });

    it('should handle errors gracefully', async () => {
      const mockError = new Error('MPV not initialized');
      vi.mocked(invoke).mockRejectedValue(mockError);

      const result = await setMpvVolume(100, false);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to set volume');
    });
  });

  describe('applyMpvFadeFilters', () => {
    it('should call mpv_apply_fade_filters with correct parameters', async () => {
      const mockResponse = { success: true, message: 'Fade filters applied' };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      const result = await applyMpvFadeFilters(1000, 1500, 5000);

      expect(invoke).toHaveBeenCalledWith('mpv_apply_fade_filters', {
        fadeInMs: 1000,
        fadeOutMs: 1500,
        clipDurationMs: 5000,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle fade-in only', async () => {
      const mockResponse = { success: true, message: 'Fade-in applied' };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      await applyMpvFadeFilters(2000, 0, 10000);

      expect(invoke).toHaveBeenCalledWith('mpv_apply_fade_filters', {
        fadeInMs: 2000,
        fadeOutMs: 0,
        clipDurationMs: 10000,
      });
    });

    it('should handle fade-out only', async () => {
      const mockResponse = { success: true, message: 'Fade-out applied' };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      await applyMpvFadeFilters(0, 3000, 10000);

      expect(invoke).toHaveBeenCalledWith('mpv_apply_fade_filters', {
        fadeInMs: 0,
        fadeOutMs: 3000,
        clipDurationMs: 10000,
      });
    });

    it('should handle no fades (zero durations)', async () => {
      const mockResponse = { success: true, message: 'No filters applied' };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      await applyMpvFadeFilters(0, 0, 5000);

      expect(invoke).toHaveBeenCalledWith('mpv_apply_fade_filters', {
        fadeInMs: 0,
        fadeOutMs: 0,
        clipDurationMs: 5000,
      });
    });

    it('should handle errors gracefully', async () => {
      const mockError = new Error('MPV not initialized');
      vi.mocked(invoke).mockRejectedValue(mockError);

      const result = await applyMpvFadeFilters(1000, 1000, 5000);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to apply fade filters');
    });
  });

  describe('clearMpvAudioFilters', () => {
    it('should call mpv_clear_audio_filters', async () => {
      const mockResponse = { success: true, message: 'Audio filters cleared' };
      vi.mocked(invoke).mockResolvedValue(mockResponse);

      const result = await clearMpvAudioFilters();

      expect(invoke).toHaveBeenCalledWith('mpv_clear_audio_filters');
      expect(result).toEqual(mockResponse);
    });

    it('should handle errors gracefully', async () => {
      const mockError = new Error('MPV not initialized');
      vi.mocked(invoke).mockRejectedValue(mockError);

      const result = await clearMpvAudioFilters();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to clear audio filters');
    });
  });
});
