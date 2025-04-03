import { create } from 'zustand'

interface SizeState {
  width: number;
  height: number;
}

export const useSizeStore = create<SizeState>((set) => ({
  width: window.innerWidth,
  height: window.innerHeight,
})) 