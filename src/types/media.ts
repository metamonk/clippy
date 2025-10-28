/**
 * Video resolution
 */
export interface Resolution {
  width: number;
  height: number;
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
}
