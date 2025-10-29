import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setMpvVolume } from './mpv';
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
});
