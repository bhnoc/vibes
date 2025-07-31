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
    connectionPullStrength: 5.00,
    collisionRepulsion: 1.25,
    damping: 0.095,
    connectionLifetime: 2000,
    nodeSpacing: 135,
    driftAwayStrength: 3.0,
}

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
      storage: createJSONStorage(() => localStorage), 
    }
  )
) 