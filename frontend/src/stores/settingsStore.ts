import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SettingsState {
  verboseLogging: boolean;
  toggleVerboseLogging: () => void;
  maxNodes: number;
  setMaxNodes: (n: number) => void;
  maxConnectionsPerNode: number;
  setMaxConnectionsPerNode: (n: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      verboseLogging: false,
      toggleVerboseLogging: () => set((state) => ({ verboseLogging: !state.verboseLogging })),
      maxNodes: 75,
      setMaxNodes: (n) => set({ maxNodes: n }),
      maxConnectionsPerNode: 5,
      setMaxConnectionsPerNode: (n) => set({ maxConnectionsPerNode: n }),
    }),
    {
      name: 'display-settings-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
