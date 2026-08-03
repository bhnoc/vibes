import { create } from 'zustand';

export interface WindowState {
  showSettings: boolean;
  showDebug: boolean;
  showLegend: boolean;
  toggleSettings: (force?: boolean) => void;
  toggleDebug: (force?: boolean) => void;
  toggleLegend: (force?: boolean) => void;
}

// All layers start closed: the console boots to a clean map, and every panel
// is one rail click or slash command away.
export const useWindowStore = create<WindowState>((set) => ({
  showSettings: false,
  showDebug: false,
  showLegend: false,
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
