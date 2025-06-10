import { create } from 'zustand';

export interface SettingsState {
  // Node spacing configuration
  nodeSpacing: number; // Base distance between nodes (starts at double current value: 50px)
  
  // Actions
  setNodeSpacing: (spacing: number) => void;
  resetSettings: () => void;
}

// Default values
const DEFAULT_NODE_SPACING = 50; // Double the current MIN_NODE_DISTANCE (25px)

export const useSettingsStore = create<SettingsState>((set, get) => ({
  // State
  nodeSpacing: DEFAULT_NODE_SPACING,
  
  // Actions
  setNodeSpacing: (spacing: number) => {
    console.log(`🎛️ Node spacing updated: ${spacing}px`);
    set({ nodeSpacing: spacing });
  },
  
  resetSettings: () => {
    console.log('🔄 Settings reset to defaults');
    set({ nodeSpacing: DEFAULT_NODE_SPACING });
  }
})); 