import { create } from 'zustand';

/**
 * Visibility of the floating operator tools.
 *
 * These live in a store rather than in App's local state because every tool has
 * to be reachable more than one way: the icon rail, the command palette, and the
 * console's slash commands all drive the same switches. A tool that only one of
 * those knows about is a tool that has effectively disappeared.
 */
export interface WindowState {
  showSettings: boolean;
  showDebug: boolean;
  showLegend: boolean;
  showPerfTest: boolean;
  toggleSettings: (force?: boolean) => void;
  toggleDebug: (force?: boolean) => void;
  toggleLegend: (force?: boolean) => void;
  togglePerfTest: (force?: boolean) => void;
  /** Close every floating tool. Backs the `/tools close` command and Escape-all. */
  closeAll: () => void;
}

// All layers start closed: the console boots to a clean map, and every tool is
// one rail click, one palette entry or one slash command away.
export const useWindowStore = create<WindowState>((set) => ({
  showSettings: false,
  showDebug: false,
  showLegend: false,
  showPerfTest: false,
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
  togglePerfTest: (force) =>
    set((state) => ({
      showPerfTest: force !== undefined ? force : !state.showPerfTest,
    })),
  closeAll: () => set({ showSettings: false, showDebug: false, showLegend: false, showPerfTest: false }),
}));
