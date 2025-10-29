import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type { Camera, FrameRate, Resolution, WindowInfo } from '../types/recording';

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopping' | 'error';

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

  /** Accumulated pause duration in milliseconds */
  pausedMs: number;

  /** Last error message */
  error: string | null;

  /** File path of saved recording */
  savedFilePath: string | null;

  /** Audio source configuration */
  audioSources: AudioSourceConfig;

  /** Frame rate for recording (Story 4.2) */
  frameRate: FrameRate;

  /** Resolution for recording (Story 4.2) */
  resolution: Resolution;

  /** Available cameras list */
  cameras: Camera[];

  /** Selected camera for webcam recording */
  selectedCamera: Camera | null;

  /** Start a new recording */
  startRecording: (recordingId: string) => void;

  /** Stop the current recording */
  stopRecording: (filePath: string) => void;

  /** Pause the current recording */
  pauseRecording: () => void;

  /** Resume the paused recording */
  resumeRecording: () => void;

  /** Cancel the current recording */
  cancelRecording: () => void;

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

  /** Set frame rate (Story 4.2) */
  setFrameRate: (frameRate: FrameRate) => void;

  /** Set resolution (Story 4.2) */
  setResolution: (resolution: Resolution) => void;

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
 * Story 4.2: Persist configuration (frameRate, resolution, audioSources) to localStorage
 */
export const useRecordingStore = create<RecordingState>()(
  devtools(
    persist(
      (set) => ({
      // Initial state
      status: 'idle',
      recordingId: null,
      startTime: null,
      elapsedMs: 0,
      pausedMs: 0,
      error: null,
      savedFilePath: null,
      audioSources: {
        systemAudio: false,
        microphone: false,
      },
      frameRate: 30,
      resolution: '1080p',
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
            pausedMs: 0,
            savedFilePath: filePath,
          },
          false,
          'stopRecording'
        ),

      pauseRecording: () =>
        set(
          (state) => ({
            status: 'paused',
            // Store the elapsed time when paused
            elapsedMs: state.startTime ? Date.now() - state.startTime - state.pausedMs : state.elapsedMs,
          }),
          false,
          'pauseRecording'
        ),

      resumeRecording: () =>
        set(
          (state) => {
            // Validate state before resume
            if (!state.startTime) {
              console.error('Invalid state: startTime is null during resume');
              return {
                status: 'error',
                error: 'Invalid recording state - cannot resume',
              };
            }

            const now = Date.now();
            const pauseStartTime = state.startTime + state.elapsedMs + state.pausedMs;
            const pauseDuration = now - pauseStartTime;

            return {
              status: 'recording',
              pausedMs: state.pausedMs + pauseDuration,
              startTime: state.startTime,
            };
          },
          false,
          'resumeRecording'
        ),

      cancelRecording: () =>
        set(
          {
            status: 'idle',
            recordingId: null,
            startTime: null,
            elapsedMs: 0,
            pausedMs: 0,
            savedFilePath: null,
          },
          false,
          'cancelRecording'
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
          (state) => ({
            status: 'idle',
            recordingId: null,
            startTime: null,
            elapsedMs: 0,
            pausedMs: 0,
            error: null,
            savedFilePath: null,
            // Keep persisted configuration (Story 4.2)
            audioSources: state.audioSources,
            frameRate: state.frameRate,
            resolution: state.resolution,
            cameras: [],
            selectedCamera: null,
          }),
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

      setFrameRate: (frameRate) =>
        set(
          {
            frameRate,
          },
          false,
          'setFrameRate'
        ),

      setResolution: (resolution) =>
        set(
          {
            resolution,
          },
          false,
          'setResolution'
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
        name: 'recording-config-storage',
        partialize: (state) => ({
          frameRate: state.frameRate,
          resolution: state.resolution,
          audioSources: state.audioSources,
        }),
      }
    ),
    {
      name: 'recording-store',
    }
  )
);
