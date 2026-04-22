import { create } from 'zustand';

interface SizeState {
  width: number;
  height: number;
  setSize: (width: number, height: number) => void;
}

const STATUS_BAR_HEIGHT = 36;

export const useSizeStore = create<SizeState>((set) => ({
  width: window.innerWidth,
  height: window.innerHeight - STATUS_BAR_HEIGHT,
  setSize: (width, height) => set({ width, height: height - STATUS_BAR_HEIGHT }),
}));