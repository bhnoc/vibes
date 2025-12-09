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
    (set, get) => ({
      verboseLogging: false,
      toggleVerboseLogging: () => set((state) => ({ verboseLogging: !state.verboseLogging })),
      maxNodes: 5000,
      setMaxNodes: (maxNodes: number) => {
        console.log(`🎚️ Max nodes slider changed to: ${maxNodes}`);
        set({ maxNodes });
      },
    }),
    {
      name: 'display-settings-storage',
      storage: createJSONStorage(() => localStorage),
      version: 1, // Bump version to force migration
      migrate: (persistedState: any, version: number) => {
        // If old state has a small maxNodes, reset it
        if (persistedState && persistedState.maxNodes < 1000) {
          console.log(`⚠️ Migrating old maxNodes value ${persistedState.maxNodes} to 5000`);
          persistedState.maxNodes = 5000;
        }
        return persistedState;
      },
    }
  )
);

// Log initial value on load
setTimeout(() => {
  const currentMaxNodes = useSettingsStore.getState().maxNodes;
  console.log(`📊 Initial maxNodes setting: ${currentMaxNodes}`);
}, 100); 