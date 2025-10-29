import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { useRecordingStore } from '@/stores/recordingStore';

/**
 * Audio Source Selector Component
 *
 * Allows users to select which audio sources to include in the recording:
 * - System audio (output audio from the computer)
 * - Microphone (input audio from the microphone)
 *
 * Integrates with recordingStore to persist audio source preferences.
 */
export function AudioSourceSelector() {
  const audioSources = useRecordingStore((state) => state.audioSources);
  const setAudioSources = useRecordingStore((state) => state.setAudioSources);
  const recordingStatus = useRecordingStore((state) => state.status);

  // Disable changes while recording
  const isRecording = recordingStatus === 'recording' || recordingStatus === 'stopping';

  const handleSystemAudioChange = (checked: boolean) => {
    setAudioSources({ systemAudio: checked });
  };

  const handleMicrophoneChange = (checked: boolean) => {
    setAudioSources({ microphone: checked });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="mb-3 text-sm font-medium">Audio Sources</h3>
        <div className="space-y-3">
          {/* System Audio Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="system-audio"
              checked={audioSources.systemAudio}
              onCheckedChange={handleSystemAudioChange}
              disabled={isRecording}
              data-testid="system-audio-checkbox"
            />
            <Label
              htmlFor="system-audio"
              className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              System Audio
            </Label>
          </div>

          {/* Microphone Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="microphone"
              checked={audioSources.microphone}
              onCheckedChange={handleMicrophoneChange}
              disabled={isRecording}
              data-testid="microphone-checkbox"
            />
            <Label
              htmlFor="microphone"
              className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Microphone
            </Label>
          </div>
        </div>
      </div>

      {/* Help text */}
      <div className="text-xs text-muted-foreground">
        {!audioSources.systemAudio && !audioSources.microphone && (
          <p>No audio will be recorded (video only)</p>
        )}
        {audioSources.systemAudio && !audioSources.microphone && (
          <p>Recording computer output audio</p>
        )}
        {!audioSources.systemAudio && audioSources.microphone && (
          <p>Recording microphone audio</p>
        )}
        {audioSources.systemAudio && audioSources.microphone && (
          <p>Recording both system and microphone audio</p>
        )}
      </div>
    </div>
  );
}
