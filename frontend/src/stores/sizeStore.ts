import { create } from 'zustand';

interface SizeState {
  width: number;
  height: number;
  setSize: (width: number, height: number) => void;
}

export const useSizeStore = create<SizeState>((set) => ({
  width: window.innerWidth,
  height: window.innerHeight,
  setSize: (width, height) => set({ width, height }),
})); 