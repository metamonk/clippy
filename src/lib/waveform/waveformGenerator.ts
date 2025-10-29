import type { WaveformData } from '../../types/media';

/**
 * Generate waveform data from a video/audio file
 *
 * Uses Web Audio API to extract audio and generate normalized peak values
 * for timeline visualization. Non-blocking async operation.
 *
 * @param filePath - Absolute path to video/audio file
 * @param targetSamples - Number of peak samples to generate (default: 500)
 * @returns Promise resolving to WaveformData with normalized peaks
 * @throws Error if file cannot be read or audio cannot be decoded
 */
export async function generateWaveform(
  filePath: string,
  targetSamples: number = 500
): Promise<WaveformData> {
  try {
    // Load file as ArrayBuffer
    const arrayBuffer = await loadFileAsArrayBuffer(filePath);

    // Decode audio using Web Audio API
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Extract raw audio samples from first channel
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const duration = (audioBuffer.length / sampleRate) * 1000; // Convert to milliseconds

    // Generate peak values
    const peaks = extractPeaks(channelData, targetSamples);

    // Close audio context to free resources
    await audioContext.close();

    return {
      peaks,
      sampleRate: targetSamples / (duration / 1000), // Effective sample rate for peaks
      duration,
      channels: audioBuffer.numberOfChannels,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(
      `Failed to generate waveform for ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract peak values from audio samples
 *
 * Divides audio samples into buckets and finds the maximum absolute value
 * in each bucket. Returns normalized values (0-1 range).
 *
 * @param channelData - Float32Array of audio samples from AudioBuffer
 * @param targetSamples - Number of peak values to extract
 * @returns Array of normalized peak values (0-1)
 */
export function extractPeaks(
  channelData: Float32Array,
  targetSamples: number
): number[] {
  const peaks: number[] = [];
  const blockSize = Math.floor(channelData.length / targetSamples);

  // Edge case: if audio is shorter than target samples
  if (blockSize === 0) {
    // Return one peak per sample, up to targetSamples
    for (let i = 0; i < Math.min(targetSamples, channelData.length); i++) {
      peaks.push(Math.abs(channelData[i]));
    }
    return peaks;
  }

  // Extract peak from each block
  for (let i = 0; i < targetSamples; i++) {
    const start = i * blockSize;
    const end = start + blockSize;
    let max = 0;

    // Find max absolute value in block
    for (let j = start; j < end && j < channelData.length; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) {
        max = abs;
      }
    }

    peaks.push(max); // Already normalized (0-1)
  }

  return peaks;
}

/**
 * Load file as ArrayBuffer for Web Audio API processing
 *
 * Uses native File API to read the file. In a Tauri environment,
 * we can read files directly from the filesystem using convertFileSrc.
 *
 * @param filePath - Absolute path to file
 * @returns Promise resolving to ArrayBuffer
 */
async function loadFileAsArrayBuffer(filePath: string): Promise<ArrayBuffer> {
  try {
    // In Tauri, we can use fetch with the file path converted to a safe URL
    // The convertFileSrc function converts file paths to a format the frontend can access
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    const fileUrl = convertFileSrc(filePath);

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.arrayBuffer();
  } catch (error) {
    throw new Error(
      `Failed to load file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if a media file has audio
 *
 * Attempts to decode audio from the file. Returns false if no audio track exists.
 *
 * @param filePath - Absolute path to media file
 * @returns Promise resolving to true if audio exists, false otherwise
 */
export async function hasAudio(filePath: string): Promise<boolean> {
  let audioContext: AudioContext | null = null;
  try {
    const arrayBuffer = await loadFileAsArrayBuffer(filePath);
    audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    return audioBuffer.numberOfChannels > 0 && audioBuffer.length > 0;
  } catch {
    // Decode failed - likely no audio track
    return false;
  } finally {
    // Always close AudioContext to prevent resource leaks
    if (audioContext) {
      await audioContext.close();
    }
  }
}
