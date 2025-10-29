import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractPeaks, generateWaveform, hasAudio } from './waveformGenerator';

describe('extractPeaks', () => {
  it('should extract correct number of peaks', () => {
    const samples = new Float32Array([0.1, 0.5, 0.3, 0.8, 0.2, 0.6, 0.4, 0.9]);
    const peaks = extractPeaks(samples, 4);

    expect(peaks).toHaveLength(4);
  });

  it('should extract maximum absolute values from each block', () => {
    // Create sample data: [0.1, 0.5, 0.3, 0.8] -> blocks of 2
    // Block 1: [0.1, 0.5] -> max = 0.5
    // Block 2: [0.3, 0.8] -> max = 0.8
    const samples = new Float32Array([0.1, 0.5, 0.3, 0.8]);
    const peaks = extractPeaks(samples, 2);

    expect(peaks[0]).toBeCloseTo(0.5, 5);
    expect(peaks[1]).toBeCloseTo(0.8, 5);
  });

  it('should handle negative values correctly', () => {
    const samples = new Float32Array([-0.5, 0.3, -0.8, 0.2]);
    const peaks = extractPeaks(samples, 2);

    // Should use absolute values
    expect(peaks[0]).toBeCloseTo(0.5, 5);
    expect(peaks[1]).toBeCloseTo(0.8, 5);
  });

  it('should return normalized values (0-1 range)', () => {
    const samples = new Float32Array([0.1, 0.5, 0.3, 0.8, 0.2, 0.6]);
    const peaks = extractPeaks(samples, 3);

    peaks.forEach((peak) => {
      expect(peak).toBeGreaterThanOrEqual(0);
      expect(peak).toBeLessThanOrEqual(1);
    });
  });

  it('should handle edge case: more target samples than actual samples', () => {
    const samples = new Float32Array([0.5, 0.8]);
    const peaks = extractPeaks(samples, 5);

    // Should return one peak per sample, not exceeding actual samples
    expect(peaks.length).toBeLessThanOrEqual(5);
    expect(peaks[0]).toBeCloseTo(0.5, 5);
    expect(peaks[1]).toBeCloseTo(0.8, 5);
  });

  it('should handle edge case: empty audio buffer', () => {
    const samples = new Float32Array([]);
    const peaks = extractPeaks(samples, 100);

    expect(peaks).toEqual([]);
  });

  it('should handle edge case: single sample', () => {
    const samples = new Float32Array([0.7]);
    const peaks = extractPeaks(samples, 1);

    expect(peaks[0]).toBeCloseTo(0.7, 5);
  });

  it('should handle large target samples correctly', () => {
    // 1000 samples, request 500 peaks
    const samples = new Float32Array(1000).fill(0.5);
    const peaks = extractPeaks(samples, 500);

    expect(peaks).toHaveLength(500);
    peaks.forEach((peak) => {
      expect(peak).toBeCloseTo(0.5);
    });
  });
});

describe('generateWaveform', () => {
  beforeEach(() => {
    // Create a larger mock audio buffer for proper peak extraction
    const mockSamples = new Float32Array(44100); // 1 second of audio at 44.1kHz
    for (let i = 0; i < mockSamples.length; i++) {
      mockSamples[i] = Math.sin(i / 100) * 0.5; // Generate sine wave
    }

    // Mock global AudioContext
    globalThis.AudioContext = vi.fn(() => ({
      decodeAudioData: vi.fn(async () => ({
        getChannelData: vi.fn(() => mockSamples),
        sampleRate: 44100,
        length: 44100, // 1 second at 44.1kHz
        numberOfChannels: 2,
      })),
      close: vi.fn(async () => {}),
    })) as unknown as typeof AudioContext;

    // Mock fetch for file loading
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1024),
    })) as unknown as typeof fetch;
  });

  it('should generate waveform data with correct structure', async () => {
    // Mock Tauri API
    vi.mock('@tauri-apps/api/core', () => ({
      convertFileSrc: vi.fn((path: string) => `asset://${path}`),
    }));

    const waveform = await generateWaveform('/test/file.mp4', 100);

    expect(waveform).toHaveProperty('peaks');
    expect(waveform).toHaveProperty('sampleRate');
    expect(waveform).toHaveProperty('duration');
    expect(waveform).toHaveProperty('channels');
    expect(waveform).toHaveProperty('generatedAt');
  });

  it('should generate correct number of peaks', async () => {
    vi.mock('@tauri-apps/api/core', () => ({
      convertFileSrc: vi.fn((path: string) => `asset://${path}`),
    }));

    const targetSamples = 100;
    const waveform = await generateWaveform('/test/file.mp4', targetSamples);

    expect(waveform.peaks).toHaveLength(targetSamples);
  });

  it('should calculate duration in milliseconds', async () => {
    vi.mock('@tauri-apps/api/core', () => ({
      convertFileSrc: vi.fn((path: string) => `asset://${path}`),
    }));

    const waveform = await generateWaveform('/test/file.mp4');

    // AudioBuffer mock has length=44100, sampleRate=44100 -> 1 second = 1000ms
    expect(waveform.duration).toBe(1000);
  });

  it('should store number of channels', async () => {
    vi.mock('@tauri-apps/api/core', () => ({
      convertFileSrc: vi.fn((path: string) => `asset://${path}`),
    }));

    const waveform = await generateWaveform('/test/file.mp4');

    expect(waveform.channels).toBe(2);
  });

  it('should generate ISO 8601 timestamp', async () => {
    vi.mock('@tauri-apps/api/core', () => ({
      convertFileSrc: vi.fn((path: string) => `asset://${path}`),
    }));

    const waveform = await generateWaveform('/test/file.mp4');

    // Validate ISO 8601 format
    expect(waveform.generatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  it('should throw error on file load failure', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
    })) as unknown as typeof fetch;

    vi.mock('@tauri-apps/api/core', () => ({
      convertFileSrc: vi.fn((path: string) => `asset://${path}`),
    }));

    await expect(generateWaveform('/nonexistent/file.mp4')).rejects.toThrow();
  });

  it('should throw error on audio decode failure', async () => {
    globalThis.AudioContext = vi.fn(() => ({
      decodeAudioData: vi.fn(async () => {
        throw new Error('Invalid audio format');
      }),
      close: vi.fn(async () => {}),
    })) as unknown as typeof AudioContext;

    vi.mock('@tauri-apps/api/core', () => ({
      convertFileSrc: vi.fn((path: string) => `asset://${path}`),
    }));

    await expect(generateWaveform('/test/invalid.mp4')).rejects.toThrow(
      'Failed to generate waveform'
    );
  });
});

describe('hasAudio', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1024),
    })) as unknown as typeof fetch;
  });

  it('should return true for files with audio', async () => {
    globalThis.AudioContext = vi.fn(() => ({
      decodeAudioData: vi.fn(async () => ({
        numberOfChannels: 2,
        length: 44100,
      })),
      close: vi.fn(async () => {}),
    })) as unknown as typeof AudioContext;

    vi.mock('@tauri-apps/api/core', () => ({
      convertFileSrc: vi.fn((path: string) => `asset://${path}`),
    }));

    const result = await hasAudio('/test/file-with-audio.mp4');

    expect(result).toBe(true);
  });

  it('should return false for files without audio', async () => {
    globalThis.AudioContext = vi.fn(() => ({
      decodeAudioData: vi.fn(async () => ({
        numberOfChannels: 0,
        length: 0,
      })),
      close: vi.fn(async () => {}),
    })) as unknown as typeof AudioContext;

    vi.mock('@tauri-apps/api/core', () => ({
      convertFileSrc: vi.fn((path: string) => `asset://${path}`),
    }));

    const result = await hasAudio('/test/file-no-audio.mp4');

    expect(result).toBe(false);
  });

  it('should return false on decode error', async () => {
    globalThis.AudioContext = vi.fn(() => ({
      decodeAudioData: vi.fn(async () => {
        throw new Error('Decode failed');
      }),
      close: vi.fn(async () => {}),
    })) as unknown as typeof AudioContext;

    vi.mock('@tauri-apps/api/core', () => ({
      convertFileSrc: vi.fn((path: string) => `asset://${path}`),
    }));

    const result = await hasAudio('/test/corrupted.mp4');

    expect(result).toBe(false);
  });
});
