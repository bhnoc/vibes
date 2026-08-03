import { create } from 'zustand';

/**
 * The drawing surface's size in CSS pixels.
 *
 * This used to hold the viewport minus a hard-coded status bar height, because
 * the map owned the whole window. It now holds the measured size of the canvas
 * stage, which a ResizeObserver feeds directly, so the shell can grow a sidebar
 * or a dock without the renderer drawing off the edge of its cell.
 */
interface SizeState {
  width: number;
  height: number;
  setSize: (width: number, height: number) => void;
}

export const useSizeStore = create<SizeState>((set) => ({
  width: 0,
  height: 0,
  setSize: (width, height) =>
    set((s) => (s.width === width && s.height === height ? s : { width, height })),
}));
