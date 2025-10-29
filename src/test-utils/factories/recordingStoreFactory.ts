/**
 * Recording Store Test Data Factory
 *
 * Factory functions for creating test state objects for recordingStore tests.
 * Provides a single source of truth for state structure with sensible defaults.
 *
 * Usage:
 *   - Use createRecordingState.idle() for default idle state
 *   - Use createRecordingState.recording() for active recording state
 *   - Use createRecordingState.withSystemAudio() for audio-enabled states
 *   - Pass overrides to customize any field
 */

import type { RecordingStatus, AudioSourceConfig } from '@/stores/recordingStore';
import type { Camera } from '@/types/recording';
import { createCamera, createCameraList } from './cameraFactory';

/**
 * Recording state data (without action methods)
 */
export interface RecordingStateData {
  status: RecordingStatus;
  recordingId: string | null;
  startTime: number | null;
  elapsedMs: number;
  pausedMs: number;
  pauseTime: number | null;
  error: string | null;
  savedFilePath: string | null;
  audioSources: AudioSourceConfig;
  cameras: Camera[];
  selectedCamera: Camera | null;
}

/**
 * Creates a complete RecordingState object with optional overrides
 */
export function createRecordingState(overrides: Partial<RecordingStateData> = {}): RecordingStateData {
  return {
    status: 'idle',
    recordingId: null,
    startTime: null,
    elapsedMs: 0,
    pausedMs: 0,
    pauseTime: null,
    error: null,
    savedFilePath: null,
    audioSources: {
      systemAudio: false,
      microphone: false,
    },
    cameras: [],
    selectedCamera: null,
    ...overrides,
  };
}

/**
 * Pre-configured state factories for common test scenarios
 */
export const recordingStateFactories = {
  /**
   * Idle state - no active recording
   */
  idle: (overrides: Partial<RecordingStateData> = {}): RecordingStateData => {
    return createRecordingState({
      status: 'idle',
      recordingId: null,
      startTime: null,
      elapsedMs: 0,
      error: null,
      savedFilePath: null,
      ...overrides,
    });
  },

  /**
   * Active recording state
   */
  recording: (overrides: Partial<RecordingStateData> = {}): RecordingStateData => {
    return createRecordingState({
      status: 'recording',
      recordingId: 'test-recording-id',
      startTime: Date.now(),
      elapsedMs: 0,
      error: null,
      savedFilePath: null,
      ...overrides,
    });
  },

  /**
   * Stopping state - recording is being finalized
   */
  stopping: (overrides: Partial<RecordingStateData> = {}): RecordingStateData => {
    return createRecordingState({
      status: 'stopping',
      recordingId: 'test-recording-id',
      startTime: Date.now() - 5000, // Started 5 seconds ago
      elapsedMs: 5000,
      error: null,
      savedFilePath: null,
      ...overrides,
    });
  },

  /**
   * Error state - recording failed
   */
  error: (errorMessage = 'Test error', overrides: Partial<RecordingStateData> = {}): RecordingStateData => {
    return createRecordingState({
      status: 'error',
      recordingId: 'test-recording-id',
      startTime: null,
      elapsedMs: 0,
      error: errorMessage,
      savedFilePath: null,
      ...overrides,
    });
  },

  /**
   * Recording with system audio enabled
   */
  withSystemAudio: (overrides: Partial<RecordingStateData> = {}): RecordingStateData => {
    return createRecordingState({
      status: 'idle',
      audioSources: {
        systemAudio: true,
        microphone: false,
      },
      ...overrides,
    });
  },

  /**
   * Recording with microphone enabled
   */
  withMicrophone: (overrides: Partial<RecordingStateData> = {}): RecordingStateData => {
    return createRecordingState({
      status: 'idle',
      audioSources: {
        systemAudio: false,
        microphone: true,
      },
      ...overrides,
    });
  },

  /**
   * Recording with both system audio and microphone enabled
   */
  withBothAudio: (overrides: Partial<RecordingStateData> = {}): RecordingStateData => {
    return createRecordingState({
      status: 'idle',
      audioSources: {
        systemAudio: true,
        microphone: true,
      },
      ...overrides,
    });
  },

  /**
   * Recording with no audio sources (video only)
   */
  videoOnly: (overrides: Partial<RecordingStateData> = {}): RecordingStateData => {
    return createRecordingState({
      status: 'idle',
      audioSources: {
        systemAudio: false,
        microphone: false,
      },
      ...overrides,
    });
  },

  /**
   * Completed recording with saved file path
   */
  completed: (filePath = '/path/to/recording.mp4', overrides: Partial<RecordingStateData> = {}): RecordingStateData => {
    return createRecordingState({
      status: 'idle',
      recordingId: null,
      startTime: null,
      elapsedMs: 0,
      error: null,
      savedFilePath: filePath,
      ...overrides,
    });
  },

  /**
   * State with cameras available
   */
  withCameras: (count = 2, overrides: Partial<RecordingStateData> = {}): RecordingStateData => {
    return createRecordingState({
      status: 'idle',
      cameras: createCameraList(count),
      ...overrides,
    });
  },

  /**
   * State with selected camera
   */
  withSelectedCamera: (cameraOverrides?: Partial<Camera>, overrides?: Partial<RecordingStateData>): RecordingStateData => {
    const camera = createCamera(cameraOverrides);
    return createRecordingState({
      status: 'idle',
      cameras: [camera],
      selectedCamera: camera,
      ...overrides,
    });
  },

  /**
   * Webcam recording active
   */
  webcamRecording: (overrides: Partial<RecordingStateData> = {}): RecordingStateData => {
    const camera = createCamera({ id: 0 });
    return createRecordingState({
      status: 'recording',
      recordingId: 'test-webcam-recording-id',
      startTime: Date.now(),
      elapsedMs: 0,
      cameras: [camera],
      selectedCamera: camera,
      ...overrides,
    });
  },
};

/**
 * Creates an AudioSourceConfig object with optional overrides
 */
export function createAudioSourceConfig(overrides: Partial<AudioSourceConfig> = {}): AudioSourceConfig {
  return {
    systemAudio: false,
    microphone: false,
    ...overrides,
  };
}

// Default export for convenience
export default recordingStateFactories;
