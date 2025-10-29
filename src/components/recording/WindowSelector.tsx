/**
 * Window Selector Component (Story 4.1)
 *
 * Dropdown selector for choosing which application window to record.
 * Displays window titles with app names, supports search/filter, and refresh.
 */

import { useEffect, useState } from 'react';
import { useRecordingStore } from '@/stores/recordingStore';
import type { WindowInfo } from '@/types/recording';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { RefreshCw, Search } from 'lucide-react';

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

  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load windows on mount
  useEffect(() => {
    handleRefresh();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshWindows();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelect = (value: string) => {
    const windowId = value === 'none' ? null : parseInt(value, 10);
    setSelectedWindow(windowId);
    onWindowSelect?.(windowId);
  };

  // Filter windows by search query
  const filteredWindows = availableWindows.filter((window) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      window.title.toLowerCase().includes(query) ||
      window.ownerName.toLowerCase().includes(query)
    );
  });

  // Group windows by application
  const groupedWindows = filteredWindows.reduce(
    (acc, window) => {
      if (!acc[window.ownerName]) {
        acc[window.ownerName] = [];
      }
      acc[window.ownerName].push(window);
      return acc;
    },
    {} as Record<string, WindowInfo[]>
  );

  // Show search input only if there are more than 10 windows
  const showSearch = availableWindows.length > 10;

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
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {showSearch && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search windows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh window list"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Select
        value={selectedWindowId?.toString() ?? 'none'}
        onValueChange={handleSelect}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a window to record" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Select a window...</SelectItem>
          {Object.entries(groupedWindows).map(([appName, windows]) => (
            <optgroup key={appName} label={appName}>
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
            </optgroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
