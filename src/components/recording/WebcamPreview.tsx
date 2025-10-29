/**
 * WebcamPreview Component
 *
 * Displays live webcam preview feed from the backend camera service.
 * Listens to "camera-frame" events and renders frames on a canvas.
 */

import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { startCameraPreview, stopCameraPreview } from '@/lib/tauri/recording';

interface WebcamPreviewProps {
  /** Camera index to preview */
  cameraIndex: number;
  /** Whether preview should be active */
  active: boolean;
  /** Callback when error occurs */
  onError?: (error: string) => void;
}

interface CameraFramePayload {
  data: string; // base64-encoded frame data
  width: number;
  height: number;
}

export default function WebcamPreview({ cameraIndex, active, onError }: WebcamPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupPreview = async () => {
      if (!active) {
        // Stop preview if not active
        try {
          await stopCameraPreview(cameraIndex);
        } catch {
          // Ignore errors when stopping (might not be running)
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Listen for camera frames
        unlisten = await listen<CameraFramePayload>('camera-frame', (event) => {
          const { data, width, height } = event.payload;

          const canvas = canvasRef.current;
          if (!canvas) return;

          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          // Set canvas size if changed
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }

          // Decode base64 frame and draw to canvas
          // Note: The backend sends raw RGB data (3 bytes/pixel), we need to convert to RGBA (4 bytes/pixel)
          try {
            const binaryString = atob(data);
            const rgbBytes = new Uint8ClampedArray(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              rgbBytes[i] = binaryString.charCodeAt(i);
            }

            // Validate RGB data size
            const expectedSize = width * height * 3;
            if (rgbBytes.length !== expectedSize) {
              console.warn(`Frame size mismatch: expected ${expectedSize}, got ${rgbBytes.length}`);
            }

            // Convert RGB to RGBA (ImageData requires RGBA format)
            const pixelCount = width * height;
            const rgbaBytes = new Uint8ClampedArray(pixelCount * 4);

            for (let i = 0; i < pixelCount; i++) {
              const rgbIndex = i * 3;
              const rgbaIndex = i * 4;

              rgbaBytes[rgbaIndex] = rgbBytes[rgbIndex];         // R
              rgbaBytes[rgbaIndex + 1] = rgbBytes[rgbIndex + 1]; // G
              rgbaBytes[rgbaIndex + 2] = rgbBytes[rgbIndex + 2]; // B
              rgbaBytes[rgbaIndex + 3] = 255;                    // A (fully opaque)
            }

            const imageData = new ImageData(rgbaBytes, width, height);
            ctx.putImageData(imageData, 0, 0);
          } catch (err) {
            console.error('Failed to decode frame:', err);
            setError(`Frame decode error: ${err instanceof Error ? err.message : String(err)}`);
          }
        });

        // Listen for camera errors
        const errorUnlisten = await listen<string>('camera-error', (event) => {
          const errorMsg = event.payload;
          console.error('Camera error:', errorMsg);
          setError(errorMsg);
          onError?.(errorMsg);
          setIsLoading(false);
        });

        // Start camera preview
        await startCameraPreview(cameraIndex);
        setIsLoading(false);

        // Return cleanup function that also removes error listener
        return () => {
          errorUnlisten();
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Failed to start camera preview:', errorMsg);
        setError(errorMsg);
        onError?.(errorMsg);
        setIsLoading(false);
      }
    };

    setupPreview();

    return () => {
      // Cleanup listeners and stop preview
      if (unlisten) {
        unlisten();
      }

      stopCameraPreview(cameraIndex).catch((err) => {
        console.warn('Failed to stop camera preview:', err);
      });
    };
  }, [active, cameraIndex, onError]);

  if (!active) {
    return null;
  }

  return (
    <div className="webcam-preview relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
          <div className="text-white">Starting camera...</div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900 bg-opacity-50">
          <div className="text-white text-center p-4">
            <div className="font-bold">Camera Error</div>
            <div className="text-sm mt-2">{error}</div>
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="w-full h-auto bg-black rounded-lg"
        style={{ maxHeight: '400px', objectFit: 'contain' }}
      />
    </div>
  );
}
