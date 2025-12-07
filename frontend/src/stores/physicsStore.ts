import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface PhysicsSettings {
  connectionPullStrength: number;
  collisionRepulsion: number;
  damping: number;
  connectionLifetime: number;
  nodeSpacing: number;
  driftAwayStrength: number;
  setConnectionPullStrength: (strength: number) => void;
  setCollisionRepulsion: (repulsion: number) => void;
  setDamping: (damping: number) => void;
  setConnectionLifetime: (lifetime: number) => void;
  setNodeSpacing: (spacing: number) => void;
  setDriftAwayStrength: (strength: number) => void;
  resetPhysicsDefaults: () => void;
}

const defaultPhysics = {
    connectionPullStrength: 6.60,
    collisionRepulsion: 1.25,
    damping: 0.060,  // Low damping = nodes slow down quickly (this is friction, not retention)
    connectionLifetime: 7500,  // 7.5 seconds - connections stay visible and active
    nodeSpacing: 41,
    driftAwayStrength: 0.22,
}

// Version number for physics settings - increment to force reset when defaults change
const PHYSICS_SETTINGS_VERSION = 3;

export const usePhysicsStore = create<PhysicsSettings>()(
  persist(
    (set) => ({
      ...defaultPhysics,
      setConnectionPullStrength: (strength) => set({ connectionPullStrength: strength }),
      setCollisionRepulsion: (repulsion) => set({ collisionRepulsion: repulsion }),
      setDamping: (damping) => set({ damping: damping }),
      setConnectionLifetime: (lifetime) => set({ connectionLifetime: lifetime }),
      setNodeSpacing: (spacing: number) => set({ nodeSpacing: spacing }),
      setDriftAwayStrength: (strength: number) => set({ driftAwayStrength: strength }),
      resetPhysicsDefaults: () => set({ ...defaultPhysics }),
    }),
    {
      name: 'physics-settings-storage',
      version: PHYSICS_SETTINGS_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Migrate old settings to new defaults when version changes
      migrate: (persistedState: any, version: number) => {
        if (version < PHYSICS_SETTINGS_VERSION) {
          // Reset to new defaults when version changes
          console.log(`Physics settings migrated from v${version} to v${PHYSICS_SETTINGS_VERSION} - applying new defaults`);
          return { ...defaultPhysics };
        }
        return persistedState;
      },
    }
  )
) 