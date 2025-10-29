import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Camera } from '../types/recording';

export type RecordingStatus = 'idle' | 'recording' | 'stopping' | 'error';

/** Audio source configuration for recording */
export interface AudioSourceConfig {
  /** Enable system audio (output audio) capture */
  systemAudio: boolean;

  /** Enable microphone (input audio) capture */
  microphone: boolean;
}

interface RecordingState {
  /** Current recording status */
  status: RecordingStatus;

  /** Current recording ID (UUID from backend) */
  recordingId: string | null;

  /** Recording start time (for duration display) */
  startTime: number | null;

  /** Elapsed recording duration in milliseconds */
  elapsedMs: number;

  /** Last error message */
  error: string | null;

  /** File path of saved recording */
  savedFilePath: string | null;

  /** Audio source configuration */
  audioSources: AudioSourceConfig;

  /** Available cameras list */
  cameras: Camera[];

  /** Selected camera for webcam recording */
  selectedCamera: Camera | null;

  /** Start a new recording */
  startRecording: (recordingId: string) => void;

  /** Stop the current recording */
  stopRecording: (filePath: string) => void;

  /** Update elapsed time during recording */
  updateElapsedTime: (elapsedMs: number) => void;

  /** Set error state */
  setError: (error: string) => void;

  /** Reset to idle state */
  reset: () => void;

  /** Set stopping state (during stop process) */
  setStopping: () => void;

  /** Update audio source configuration */
  setAudioSources: (config: Partial<AudioSourceConfig>) => void;

  /** Set available cameras */
  setCameras: (cameras: Camera[]) => void;

  /** Set selected camera */
  setSelectedCamera: (camera: Camera | null) => void;
}

/**
 * Recording Store
 *
 * This Zustand store manages the state of screen recording operations.
 * It tracks recording status, duration, and provides actions for controlling
 * the recording lifecycle.
 *
 * Following ADR-003: Using Zustand with devtools for state management
 * Following ADR-005: All timestamps in MILLISECONDS
 */
export const useRecordingStore = create<RecordingState>()(
  devtools(
    (set) => ({
      // Initial state
      status: 'idle',
      recordingId: null,
      startTime: null,
      elapsedMs: 0,
      error: null,
      savedFilePath: null,
      audioSources: {
        systemAudio: false,
        microphone: false,
      },
      cameras: [],
      selectedCamera: null,

      startRecording: (recordingId: string) =>
        set(
          {
            status: 'recording',
            recordingId,
            startTime: Date.now(),
            elapsedMs: 0,
            error: null,
            savedFilePath: null,
          },
          false,
          'startRecording'
        ),

      stopRecording: (filePath: string) =>
        set(
          {
            status: 'idle',
            recordingId: null,
            startTime: null,
            elapsedMs: 0,
            savedFilePath: filePath,
          },
          false,
          'stopRecording'
        ),

      updateElapsedTime: (elapsedMs: number) =>
        set(
          {
            elapsedMs,
          },
          false,
          'updateElapsedTime'
        ),

      setError: (error: string) =>
        set(
          {
            status: 'error',
            error,
            recordingId: null,
            startTime: null,
          },
          false,
          'setError'
        ),

      setStopping: () =>
        set(
          {
            status: 'stopping',
          },
          false,
          'setStopping'
        ),

      reset: () =>
        set(
          {
            status: 'idle',
            recordingId: null,
            startTime: null,
            elapsedMs: 0,
            error: null,
            savedFilePath: null,
            audioSources: {
              systemAudio: false,
              microphone: false,
            },
            cameras: [],
            selectedCamera: null,
          },
          false,
          'reset'
        ),

      setAudioSources: (config) =>
        set(
          (state) => ({
            audioSources: {
              ...state.audioSources,
              ...config,
            },
          }),
          false,
          'setAudioSources'
        ),

      setCameras: (cameras) =>
        set(
          {
            cameras,
          },
          false,
          'setCameras'
        ),

      setSelectedCamera: (camera) =>
        set(
          {
            selectedCamera: camera,
          },
          false,
          'setSelectedCamera'
        ),
    }),
    {
      name: 'recording-store',
    }
  )
);
