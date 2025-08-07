import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SettingsState {
  verboseLogging: boolean;
  toggleVerboseLogging: () => void;
  maxNodes: number;
  setMaxNodes: (maxNodes: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      verboseLogging: false,
      toggleVerboseLogging: () => set((state) => ({ verboseLogging: !state.verboseLogging })),
      maxNodes: 5000,
      setMaxNodes: (maxNodes: number) => set({ maxNodes }),
    }),
    {
      name: 'display-settings-storage', 
      storage: createJSONStorage(() => localStorage), 
    }
  )
); 