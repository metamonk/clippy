import { useDragStore } from '@/stores/dragStore';
import { useMediaLibraryStore } from '@/stores/mediaLibraryStore';
import { Film } from 'lucide-react';

export function DragPreview() {
  const isDragging = useDragStore((state) => state.isDragging);
  const draggedMediaFileId = useDragStore((state) => state.draggedMediaFileId);
  const mousePosition = useDragStore((state) => state.mousePosition);
  const getMediaFile = useMediaLibraryStore((state) => state.getMediaFile);

  if (!isDragging || !draggedMediaFileId || !mousePosition) {
    return null;
  }

  const mediaFile = getMediaFile(draggedMediaFileId);
  if (!mediaFile) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: mousePosition.x + 10,
        top: mousePosition.y + 10,
        pointerEvents: 'none',
        zIndex: 9999,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="bg-white border-2 border-blue-500 rounded-lg shadow-2xl p-3 flex items-center gap-3 opacity-90">
        {mediaFile.thumbnail ? (
          <img
            src={mediaFile.thumbnail}
            alt={mediaFile.filename}
            className="w-16 h-16 object-cover rounded"
          />
        ) : (
          <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center">
            <Film className="w-8 h-8 text-gray-400" />
          </div>
        )}
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
            {mediaFile.filename}
          </span>
          <span className="text-xs text-gray-500">
            {Math.round(mediaFile.duration / 1000)}s
          </span>
        </div>
      </div>
    </div>
  );
}
