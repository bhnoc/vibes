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
  connectionPullStrength: 1.30,
  collisionRepulsion: 1.25,
  damping: 0.06,
  connectionLifetime: 10000, // 10 seconds
  nodeSpacing: 150,
  driftAwayStrength: 3.0,
}

// Increment to force-reset localStorage when defaults change
const PHYSICS_VERSION = 2;

export const usePhysicsStore = create<PhysicsSettings>()(
  persist(
    (set) => ({
      ...defaultPhysics,
      setConnectionPullStrength: (strength) => set({ connectionPullStrength: strength }),
      setCollisionRepulsion: (repulsion) => set({ collisionRepulsion: repulsion }),
      setDamping: (damping) => set({ damping }),
      setConnectionLifetime: (lifetime) => set({ connectionLifetime: lifetime }),
      setNodeSpacing: (spacing) => set({ nodeSpacing: spacing }),
      setDriftAwayStrength: (strength) => set({ driftAwayStrength: strength }),
      resetPhysicsDefaults: () => set({ ...defaultPhysics }),
    }),
    {
      name: 'physics-settings-storage',
      version: PHYSICS_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: any, version: number) => {
        if (version < PHYSICS_VERSION) {
          return { ...defaultPhysics };
        }
        return persistedState;
      },
    }
  )
)
