/**
 * Video resolution
 */
export interface Resolution {
  width: number;
  height: number;
}

/**
 * Waveform data for audio visualization
 *
 * Contains normalized peak values and metadata for rendering audio waveforms
 * on the timeline. Generated using Web Audio API.
 */
export interface WaveformData {
  /** Normalized peak values (0-1 range) for visualization */
  peaks: number[];

  /** Effective sample rate for the peaks array (samples/second) */
  sampleRate: number;

  /** Audio duration in milliseconds */
  duration: number;

  /** Number of audio channels (1=mono, 2=stereo) */
  channels: number;

  /** ISO 8601 timestamp of when waveform was generated */
  generatedAt: string;
}

/**
 * Media file metadata
 *
 * This interface represents a video file that has been imported into the media library.
 * Field names use camelCase to match the serialization from Rust backend.
 */
export interface MediaFile {
  /** Unique identifier (UUID v4) */
  id: string;

  /** Absolute path to the file on disk */
  filePath: string;

  /** Display name (filename with extension) */
  filename: string;

  /** Duration in milliseconds */
  duration: number;

  /** Video resolution */
  resolution: Resolution;

  /** File size in bytes */
  fileSize: number;

  /** Video codec (e.g., "h264", "hevc") */
  codec: string;

  /** Optional thumbnail (base64 or file path) */
  thumbnail?: string;

  /** ISO 8601 timestamp of when the file was imported */
  importedAt: string;

  /** Optional waveform data for audio visualization (cached after generation) */
  waveformData?: WaveformData;
}
