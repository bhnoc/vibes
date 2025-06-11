import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SettingsState {
  // This store is reserved for future non-physics display settings,
  // such as theme or layout choices.
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Currently no state to manage.
    }),
    {
      name: 'display-settings-storage', 
      storage: createJSONStorage(() => localStorage), 
    }
  )
); 