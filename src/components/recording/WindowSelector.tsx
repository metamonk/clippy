/**
 * Window Selector Component (Story 4.1)
 *
 * Dropdown selector for choosing which application window to record.
 * Displays window titles with app names and refresh button.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRecordingStore } from '@/stores/recordingStore';
import type { WindowInfo } from '@/types/recording';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';

interface WindowSelectorProps {
  /** Callback when window selection changes */
  onWindowSelect?: (windowId: number | null) => void;
}

export function WindowSelector({ onWindowSelect }: WindowSelectorProps) {
  const {
    availableWindows,
    selectedWindowId,
    setSelectedWindow,
    refreshWindows,
  } = useRecordingStore();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshWindows();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshWindows]);

  // Load windows on mount
  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  const handleSelect = (value: string) => {
    const windowId = value === 'none' ? null : parseInt(value, 10);
    setSelectedWindow(windowId);
    onWindowSelect?.(windowId);
  };

  // Group windows by application
  const groupedWindows = availableWindows.reduce(
    (acc, window) => {
      if (!acc[window.ownerName]) {
        acc[window.ownerName] = [];
      }
      acc[window.ownerName].push(window);
      return acc;
    },
    {} as Record<string, WindowInfo[]>
  );

  if (availableWindows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground">
          No windows available for recording
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Windows
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Select
        value={selectedWindowId?.toString() ?? 'none'}
        onValueChange={handleSelect}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="Select a window to record" />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          <SelectItem value="none">Select a window...</SelectItem>
          {Object.entries(groupedWindows).map(([appName, windows]) => (
            <SelectGroup key={appName}>
              <SelectLabel>{appName}</SelectLabel>
              {windows.map((window) => (
                <SelectItem
                  key={window.windowId}
                  value={window.windowId.toString()}
                  disabled={!window.isOnScreen}
                >
                  <span className="flex items-center gap-2">
                    {window.title}
                    {!window.isOnScreen && (
                      <span className="text-xs text-muted-foreground">(hidden)</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        onClick={handleRefresh}
        disabled={isRefreshing}
        title="Refresh window list"
        className="shrink-0"
      >
        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
}
