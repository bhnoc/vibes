import { create } from 'zustand';

export interface WindowState {
  showSettings: boolean;
  showDebug: boolean;
  showLegend: boolean;
  toggleSettings: (force?: boolean) => void;
  toggleDebug: (force?: boolean) => void;
  toggleLegend: (force?: boolean) => void;
}

export const useWindowStore = create<WindowState>((set) => ({
  showSettings: false,
  showDebug: false,
  showLegend: true,
  toggleSettings: (force) =>
    set((state) => ({
      showSettings: force !== undefined ? force : !state.showSettings,
    })),
  toggleDebug: (force) =>
    set((state) => ({
      showDebug: force !== undefined ? force : !state.showDebug,
    })),
  toggleLegend: (force) =>
    set((state) => ({
      showLegend: force !== undefined ? force : !state.showLegend,
    })),
}));
