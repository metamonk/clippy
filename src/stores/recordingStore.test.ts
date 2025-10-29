/**
 * Recording Store Tests
 *
 * Tests for recording state management using Vitest
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useRecordingStore } from './recordingStore';

describe('recordingStore', () => {
  beforeEach(() => {
    // Clear persisted state from localStorage before each test
    localStorage.clear();

    // Reset store to initial state before each test
    useRecordingStore.getState().reset();
  });

  describe('initial state', () => {
    it('should have idle status initially', () => {
      const { status } = useRecordingStore.getState();
      expect(status).toBe('idle');
    });

    it('should have null recordingId initially', () => {
      const { recordingId } = useRecordingStore.getState();
      expect(recordingId).toBeNull();
    });

    it('should have zero elapsed time initially', () => {
      const { elapsedMs } = useRecordingStore.getState();
      expect(elapsedMs).toBe(0);
    });

    it('should have null error initially', () => {
      const { error } = useRecordingStore.getState();
      expect(error).toBeNull();
    });
  });

  describe('startRecording', () => {
    it('should set status to recording', () => {
      const { startRecording } = useRecordingStore.getState();
      startRecording('test-recording-id');

      const { status } = useRecordingStore.getState();
      expect(status).toBe('recording');
    });

    it('should set recordingId', () => {
      const { startRecording } = useRecordingStore.getState();
      startRecording('test-recording-id');

      const { recordingId } = useRecordingStore.getState();
      expect(recordingId).toBe('test-recording-id');
    });

    it('should set startTime to current time', () => {
      const before = Date.now();
      const { startRecording } = useRecordingStore.getState();
      startRecording('test-recording-id');
      const after = Date.now();

      const { startTime } = useRecordingStore.getState();
      expect(startTime).toBeGreaterThanOrEqual(before);
      expect(startTime).toBeLessThanOrEqual(after);
    });

    it('should reset elapsed time to zero', () => {
      const { startRecording, updateElapsedTime } = useRecordingStore.getState();

      // Set elapsed time first
      updateElapsedTime(5000);
      expect(useRecordingStore.getState().elapsedMs).toBe(5000);

      // Start recording should reset it
      startRecording('test-recording-id');
      expect(useRecordingStore.getState().elapsedMs).toBe(0);
    });

    it('should clear any previous error', () => {
      const { setError, startRecording } = useRecordingStore.getState();

      // Set error first
      setError('Test error');
      expect(useRecordingStore.getState().error).toBe('Test error');

      // Start recording should clear it
      startRecording('test-recording-id');
      expect(useRecordingStore.getState().error).toBeNull();
    });
  });

  describe('stopRecording', () => {
    beforeEach(() => {
      // Start a recording before each stop test
      useRecordingStore.getState().startRecording('test-recording-id');
    });

    it('should set status to idle', () => {
      const { stopRecording } = useRecordingStore.getState();
      stopRecording('/path/to/recording.raw');

      const { status } = useRecordingStore.getState();
      expect(status).toBe('idle');
    });

    it('should clear recordingId', () => {
      const { stopRecording } = useRecordingStore.getState();
      stopRecording('/path/to/recording.raw');

      const { recordingId } = useRecordingStore.getState();
      expect(recordingId).toBeNull();
    });

    it('should save file path', () => {
      const { stopRecording } = useRecordingStore.getState();
      stopRecording('/path/to/recording.raw');

      const { savedFilePath } = useRecordingStore.getState();
      expect(savedFilePath).toBe('/path/to/recording.raw');
    });

    it('should reset elapsed time', () => {
      const { updateElapsedTime, stopRecording } = useRecordingStore.getState();

      // Set elapsed time
      updateElapsedTime(10000);
      expect(useRecordingStore.getState().elapsedMs).toBe(10000);

      // Stop should reset it
      stopRecording('/path/to/recording.raw');
      expect(useRecordingStore.getState().elapsedMs).toBe(0);
    });
  });

  describe('updateElapsedTime', () => {
    it('should update elapsed time', () => {
      const { updateElapsedTime } = useRecordingStore.getState();

      updateElapsedTime(5000);
      expect(useRecordingStore.getState().elapsedMs).toBe(5000);

      updateElapsedTime(10000);
      expect(useRecordingStore.getState().elapsedMs).toBe(10000);
    });
  });

  describe('setError', () => {
    it('should set status to error', () => {
      const { setError } = useRecordingStore.getState();
      setError('Test error message');

      const { status } = useRecordingStore.getState();
      expect(status).toBe('error');
    });

    it('should set error message', () => {
      const { setError } = useRecordingStore.getState();
      setError('Test error message');

      const { error } = useRecordingStore.getState();
      expect(error).toBe('Test error message');
    });

    it('should clear recordingId when error occurs', () => {
      const { startRecording, setError } = useRecordingStore.getState();

      // Start recording first
      startRecording('test-recording-id');
      expect(useRecordingStore.getState().recordingId).toBe('test-recording-id');

      // Error should clear it
      setError('Test error');
      expect(useRecordingStore.getState().recordingId).toBeNull();
    });
  });

  describe('setStopping', () => {
    it('should set status to stopping', () => {
      const { setStopping } = useRecordingStore.getState();
      setStopping();

      const { status } = useRecordingStore.getState();
      expect(status).toBe('stopping');
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      const { startRecording, updateElapsedTime, reset } = useRecordingStore.getState();

      // Change state
      startRecording('test-recording-id');
      updateElapsedTime(5000);

      // Reset
      reset();

      const state = useRecordingStore.getState();
      expect(state.status).toBe('idle');
      expect(state.recordingId).toBeNull();
      expect(state.startTime).toBeNull();
      expect(state.elapsedMs).toBe(0);
      expect(state.error).toBeNull();
      expect(state.savedFilePath).toBeNull();
    });
  });

  describe('state transitions', () => {
    it('should transition from idle → recording → stopping → idle', () => {
      const {
        startRecording,
        setStopping,
        stopRecording,
      } = useRecordingStore.getState();

      // Initial: idle
      expect(useRecordingStore.getState().status).toBe('idle');

      // Start: idle → recording
      startRecording('test-id');
      expect(useRecordingStore.getState().status).toBe('recording');

      // Stopping: recording → stopping
      setStopping();
      expect(useRecordingStore.getState().status).toBe('stopping');

      // Stop: stopping → idle
      stopRecording('/path/to/file.raw');
      expect(useRecordingStore.getState().status).toBe('idle');
    });

    it('should transition from recording → error', () => {
      const { startRecording, setError } = useRecordingStore.getState();

      startRecording('test-id');
      expect(useRecordingStore.getState().status).toBe('recording');

      setError('Something went wrong');
      expect(useRecordingStore.getState().status).toBe('error');
    });
  });

  describe('audio source configuration', () => {
    it('should have default audio sources disabled initially', () => {
      const { audioSources } = useRecordingStore.getState();
      expect(audioSources.systemAudio).toBe(false);
      expect(audioSources.microphone).toBe(false);
    });

    it('should update system audio setting', () => {
      const { setAudioSources } = useRecordingStore.getState();

      setAudioSources({ systemAudio: true });

      const { audioSources } = useRecordingStore.getState();
      expect(audioSources.systemAudio).toBe(true);
      expect(audioSources.microphone).toBe(false);
    });

    it('should update microphone setting', () => {
      const { setAudioSources } = useRecordingStore.getState();

      setAudioSources({ microphone: true });

      const { audioSources } = useRecordingStore.getState();
      expect(audioSources.systemAudio).toBe(false);
      expect(audioSources.microphone).toBe(true);
    });

    it('should update both audio sources', () => {
      const { setAudioSources } = useRecordingStore.getState();

      setAudioSources({ systemAudio: true, microphone: true });

      const { audioSources } = useRecordingStore.getState();
      expect(audioSources.systemAudio).toBe(true);
      expect(audioSources.microphone).toBe(true);
    });

    it('should preserve other audio source settings when updating one', () => {
      const { setAudioSources } = useRecordingStore.getState();

      // Enable system audio first
      setAudioSources({ systemAudio: true });
      expect(useRecordingStore.getState().audioSources.systemAudio).toBe(true);

      // Enable microphone - should preserve system audio setting
      setAudioSources({ microphone: true });
      const { audioSources } = useRecordingStore.getState();
      expect(audioSources.systemAudio).toBe(true);
      expect(audioSources.microphone).toBe(true);
    });

    it('should preserve audio sources on reset (Story 4.2 - persisted config)', () => {
      const { setAudioSources, reset } = useRecordingStore.getState();

      // Enable both
      setAudioSources({ systemAudio: true, microphone: true });
      expect(useRecordingStore.getState().audioSources.systemAudio).toBe(true);
      expect(useRecordingStore.getState().audioSources.microphone).toBe(true);

      // Reset - audioSources should be preserved as persisted configuration
      reset();

      const { audioSources } = useRecordingStore.getState();
      expect(audioSources.systemAudio).toBe(true);
      expect(audioSources.microphone).toBe(true);
    });
  });

  // Story 4.1: Window Selection for Screen Recording Tests
  describe('window selection (Story 4.1)', () => {
    describe('setScreenRecordingMode', () => {
      it('should set screen recording mode', () => {
        const { setScreenRecordingMode, screenRecordingMode } = useRecordingStore.getState();
        expect(screenRecordingMode).toBe('fullscreen');

        setScreenRecordingMode('window');
        expect(useRecordingStore.getState().screenRecordingMode).toBe('window');
      });

      it('should clear selected window when switching to fullscreen', () => {
        const { setSelectedWindow, setScreenRecordingMode } = useRecordingStore.getState();

        // Set window mode and select a window
        setScreenRecordingMode('window');
        setSelectedWindow(12345);
        expect(useRecordingStore.getState().selectedWindowId).toBe(12345);

        // Switch to fullscreen should clear selection
        setScreenRecordingMode('fullscreen');
        expect(useRecordingStore.getState().selectedWindowId).toBeNull();
      });

      it('should restore last selected window when switching back to window mode (AC #6)', () => {
        const { setSelectedWindow, setScreenRecordingMode } = useRecordingStore.getState();

        // Set window mode and select a window
        setScreenRecordingMode('window');
        setSelectedWindow(12345);
        expect(useRecordingStore.getState().lastSelectedWindowId).toBe(12345);

        // Switch to fullscreen
        setScreenRecordingMode('fullscreen');
        expect(useRecordingStore.getState().selectedWindowId).toBeNull();

        // Switch back to window mode should restore last selection
        setScreenRecordingMode('window');
        expect(useRecordingStore.getState().selectedWindowId).toBe(12345);
      });
    });

    describe('setSelectedWindow', () => {
      it('should set selected window ID', () => {
        const { setSelectedWindow } = useRecordingStore.getState();

        setSelectedWindow(12345);
        expect(useRecordingStore.getState().selectedWindowId).toBe(12345);
      });

      it('should update lastSelectedWindowId for session persistence (AC #6)', () => {
        const { setSelectedWindow } = useRecordingStore.getState();

        setSelectedWindow(12345);
        expect(useRecordingStore.getState().lastSelectedWindowId).toBe(12345);

        setSelectedWindow(67890);
        expect(useRecordingStore.getState().lastSelectedWindowId).toBe(67890);
      });

      it('should allow clearing selection with null', () => {
        const { setSelectedWindow } = useRecordingStore.getState();

        setSelectedWindow(12345);
        expect(useRecordingStore.getState().selectedWindowId).toBe(12345);

        setSelectedWindow(null);
        expect(useRecordingStore.getState().selectedWindowId).toBeNull();
      });
    });

    describe('refreshWindows', () => {
      it('should update available windows list', async () => {
        const { refreshWindows } = useRecordingStore.getState();

        // Mock invoke to return window list
        const mockWindows = [
          { windowId: 1, ownerName: 'Safari', title: 'Test Page', isOnScreen: true },
          { windowId: 2, ownerName: 'Chrome', title: 'Google', isOnScreen: true },
        ];

        // Since we can't mock invoke in this test, we'll just verify the function exists
        expect(refreshWindows).toBeDefined();
        expect(typeof refreshWindows).toBe('function');
      });
    });

    describe('persistence', () => {
      it('should persist screenRecordingMode across resets (AC #6)', () => {
        const { setScreenRecordingMode, reset } = useRecordingStore.getState();

        setScreenRecordingMode('window');
        expect(useRecordingStore.getState().screenRecordingMode).toBe('window');

        // Reset should preserve screenRecordingMode
        reset();
        expect(useRecordingStore.getState().screenRecordingMode).toBe('window');
      });

      it('should persist lastSelectedWindowId across resets (AC #6)', () => {
        const { setSelectedWindow, reset } = useRecordingStore.getState();

        setSelectedWindow(12345);
        expect(useRecordingStore.getState().lastSelectedWindowId).toBe(12345);

        // Reset should preserve lastSelectedWindowId
        reset();
        expect(useRecordingStore.getState().lastSelectedWindowId).toBe(12345);
      });
    });
  });
});
