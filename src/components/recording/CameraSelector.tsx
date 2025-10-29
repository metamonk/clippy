/**
 * CameraSelector Component
 *
 * Provides a dropdown to select from available cameras.
 * Loads camera list on mount and updates the recording store.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useRecordingStore } from '@/stores/recordingStore';
import { listCameras, checkCameraPermission } from '@/lib/tauri/recording';
import { Camera, Video } from 'lucide-react';

interface CameraSelectorProps {
  /** Callback when a camera is selected */
  onCameraSelected?: (cameraId: number) => void;
}

export function CameraSelector({ onCameraSelected }: CameraSelectorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const cameras = useRecordingStore((state) => state.cameras);
  const selectedCamera = useRecordingStore((state) => state.selectedCamera);
  const setCameras = useRecordingStore((state) => state.setCameras);
  const setSelectedCamera = useRecordingStore((state) => state.setSelectedCamera);

  // Load cameras on mount
  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    setIsLoading(true);

    try {
      // Check camera permission first
      const granted = await checkCameraPermission();
      setHasPermission(granted);

      if (!granted) {
        toast.warning('Camera Permission Required', {
          description: 'Please grant camera permission to see available cameras',
        });
        setIsLoading(false);
        return;
      }

      // List cameras
      const cameraList = await listCameras();
      setCameras(cameraList);

      // Auto-select first camera if available and none selected
      if (cameraList.length > 0 && !selectedCamera) {
        const firstCamera = cameraList[0];
        setSelectedCamera(firstCamera);
        onCameraSelected?.(firstCamera.id);
      }

      if (cameraList.length === 0) {
        toast.info('No Cameras Found', {
          description: 'No cameras detected on your system',
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      toast.error('Failed to Load Cameras', {
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCameraChange = (cameraId: string) => {
    const camera = cameras.find((c) => c.id === parseInt(cameraId));
    if (camera) {
      setSelectedCamera(camera);
      onCameraSelected?.(camera.id);
    }
  };

  if (hasPermission === false) {
    return (
      <div className="camera-selector space-y-2">
        <Label className="flex items-center gap-2">
          <Camera className="w-4 h-4" />
          Camera Selection
        </Label>
        <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md">
          Camera permission not granted. Please enable camera access in System Preferences.
        </div>
      </div>
    );
  }

  return (
    <div className="camera-selector space-y-2">
      <Label htmlFor="camera-select" className="flex items-center gap-2">
        <Video className="w-4 h-4" />
        Select Camera
      </Label>

      <Select
        value={selectedCamera?.id.toString()}
        onValueChange={handleCameraChange}
        disabled={isLoading || cameras.length === 0}
      >
        <SelectTrigger id="camera-select" className="w-full">
          <SelectValue
            placeholder={
              isLoading
                ? 'Loading cameras...'
                : cameras.length === 0
                  ? 'No cameras found'
                  : 'Select a camera'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {cameras.map((camera) => (
            <SelectItem key={camera.id} value={camera.id.toString()}>
              <div className="flex flex-col">
                <span className="font-medium">{camera.name}</span>
                <span className="text-xs text-gray-500">
                  {camera.resolution} @ {camera.fps}fps
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedCamera && (
        <div className="text-xs text-gray-600 dark:text-gray-400">
          {selectedCamera.name} • {selectedCamera.resolution} @ {selectedCamera.fps}fps
        </div>
      )}
    </div>
  );
}
