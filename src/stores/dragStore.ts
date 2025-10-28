import { create } from 'zustand';

interface DragState {
  isDragging: boolean;
  draggedMediaFileId: string | null;
  mousePosition: { x: number; y: number } | null;

  // Actions
  startDrag: (mediaFileId: string, mouseX: number, mouseY: number) => void;
  updateMousePosition: (mouseX: number, mouseY: number) => void;
  endDrag: () => void;
}

export const useDragStore = create<DragState>((set) => ({
  isDragging: false,
  draggedMediaFileId: null,
  mousePosition: null,

  startDrag: (mediaFileId: string, mouseX: number, mouseY: number) => {
    set({
      isDragging: true,
      draggedMediaFileId: mediaFileId,
      mousePosition: { x: mouseX, y: mouseY },
    });
  },

  updateMousePosition: (mouseX: number, mouseY: number) => {
    set({ mousePosition: { x: mouseX, y: mouseY } });
  },

  endDrag: () => {
    set({
      isDragging: false,
      draggedMediaFileId: null,
      mousePosition: null,
    });
  },
}));
