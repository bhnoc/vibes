import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SettingsState {
  verboseLogging: boolean;
  toggleVerboseLogging: () => void;
  // This store is reserved for future non-physics display settings,
  // such as theme or layout choices.
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      verboseLogging: false,
      toggleVerboseLogging: () => set((state) => ({ verboseLogging: !state.verboseLogging })),
    }),
    {
      name: 'display-settings-storage', 
      storage: createJSONStorage(() => localStorage), 
    }
  )
); 