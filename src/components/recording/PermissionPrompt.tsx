/**
 * PermissionPrompt Component
 *
 * Handles the screen recording permission flow for macOS.
 * Shows a dialog explaining the permission requirement and provides
 * clear guidance when permission is denied.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertCircle, Shield } from 'lucide-react';

export interface PermissionPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPermissionGranted?: () => void;
  onPermissionDenied?: () => void;
}

export function PermissionPrompt({
  open,
  onOpenChange,
  onPermissionGranted,
  onPermissionDenied,
}: PermissionPromptProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check permission status when component mounts or dialog opens
  useEffect(() => {
    if (open) {
      checkPermission();
    }
  }, [open]);

  const checkPermission = async () => {
    try {
      setIsChecking(true);
      setError(null);

      const granted = await invoke<boolean>('cmd_check_screen_recording_permission');
      setHasPermission(granted);

      if (granted && onPermissionGranted) {
        onPermissionGranted();
        onOpenChange(false);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      toast.error('Permission Check Failed', {
        description: errorMessage,
      });
    } finally {
      setIsChecking(false);
    }
  };

  const requestPermission = async () => {
    try {
      setIsChecking(true);
      setError(null);

      await invoke('cmd_request_screen_recording_permission');

      toast.success('Permission Request Sent', {
        description:
          'Please enable screen recording in System Preferences, then restart the app.',
        duration: 8000,
      });

      // Re-check permission after request
      // Note: On macOS, permission change requires app restart
      setTimeout(checkPermission, 1000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);

      if (onPermissionDenied) {
        onPermissionDenied();
      }

      toast.error('Permission Request Failed', {
        description: errorMessage,
        duration: 10000,
      });
    } finally {
      setIsChecking(false);
    }
  };

  const openSystemPreferences = () => {
    // Guide user to open System Preferences
    toast.info('Opening System Preferences', {
      description:
        'Navigate to: Privacy & Security → Screen Recording → Enable this app',
      duration: 15000,
    });

    // On macOS, we can open System Preferences via shell command
    // This is handled by user manually for security
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            {hasPermission === false ? (
              <AlertCircle className="h-6 w-6 text-red-500" />
            ) : (
              <Shield className="h-6 w-6 text-blue-500" />
            )}
            <AlertDialogTitle className="text-xl">
              {hasPermission === false
                ? 'Screen Recording Permission Denied'
                : 'Screen Recording Permission Required'}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-3 text-base">
            {hasPermission === false ? (
              <>
                <p>
                  This app needs permission to record your screen. Permission was
                  denied or not yet granted.
                </p>
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md text-sm">
                  <p className="font-semibold mb-2">To enable:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Open System Preferences</li>
                    <li>Go to Privacy & Security → Screen Recording</li>
                    <li>Enable this app in the list</li>
                    <li>Restart the app for changes to take effect</li>
                  </ol>
                </div>
                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-md text-sm text-red-700 dark:text-red-400">
                    <p className="font-semibold">Error:</p>
                    <p>{error}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <p>
                  To record your screen, this app needs your permission to access screen
                  content.
                </p>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md text-sm">
                  <p className="font-semibold mb-1">What happens next:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>macOS will show a permission dialog</li>
                    <li>You'll need to enable screen recording in System Preferences</li>
                    <li>App restart will be required</li>
                  </ul>
                </div>
                {error && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md text-sm text-yellow-700 dark:text-yellow-400">
                    <p>{error}</p>
                  </div>
                )}
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {hasPermission === false ? (
            <>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={openSystemPreferences}>
                Open System Preferences
              </AlertDialogAction>
            </>
          ) : (
            <>
              <AlertDialogCancel disabled={isChecking}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={requestPermission} disabled={isChecking}>
                {isChecking ? 'Checking...' : 'Request Permission'}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
