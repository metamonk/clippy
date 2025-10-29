/**
 * Delete Clip Confirmation Dialog
 * Provides user confirmation before deleting a clip with optional ripple delete
 */

import { useState, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';

interface DeleteClipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (ripple: boolean) => void;
}

const RIPPLE_PREFERENCE_KEY = 'preferRippleDelete';

/**
 * Dialog to confirm clip deletion with optional ripple delete
 *
 * @param open - Whether the dialog is open
 * @param onOpenChange - Callback when dialog open state changes
 * @param onConfirm - Callback when deletion is confirmed, receives ripple boolean
 */
export function DeleteClipDialog({
  open,
  onOpenChange,
  onConfirm,
}: DeleteClipDialogProps) {
  // Initialize ripple preference from localStorage
  const [rippleDelete, setRippleDelete] = useState(() => {
    try {
      const stored = localStorage.getItem(RIPPLE_PREFERENCE_KEY);
      return stored === 'true';
    } catch {
      return false; // Default to false if localStorage unavailable
    }
  });

  // Save preference to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(RIPPLE_PREFERENCE_KEY, rippleDelete.toString());
    } catch {
      // Silently fail if localStorage unavailable
    }
  }, [rippleDelete]);

  const handleConfirm = () => {
    onConfirm(rippleDelete);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete clip?</AlertDialogTitle>
          <AlertDialogDescription>
            This action can be undone with Cmd+Z.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center gap-2 py-2">
          <Checkbox
            id="ripple"
            checked={rippleDelete}
            onCheckedChange={(checked) => setRippleDelete(checked as boolean)}
          />
          <label
            htmlFor="ripple"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Ripple delete (shift subsequent clips)
          </label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
