import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface PhysicsSettings {
  connectionPullStrength: number;
  collisionRepulsion: number;
  damping: number;
  connectionLifetime: number;
  nodeSpacing: number;
  driftAwayStrength: number;
  centerPullStrength: number;
  springRestLength: number;
  setConnectionPullStrength: (v: number) => void;
  setCollisionRepulsion: (v: number) => void;
  setDamping: (v: number) => void;
  setConnectionLifetime: (v: number) => void;
  setNodeSpacing: (v: number) => void;
  setDriftAwayStrength: (v: number) => void;
  setCenterPullStrength: (v: number) => void;
  setSpringRestLength: (v: number) => void;
  resetPhysicsDefaults: () => void;
}

const defaultPhysics = {
  connectionPullStrength: 1.30,
  collisionRepulsion: 1.25,
  damping: 0.20,             // overdamped — nodes settle without oscillating (critical ≈ 0.17 for our spring)
  connectionLifetime: 30000, // 30 seconds — stable enough to see the network
  nodeSpacing: 120,
  driftAwayStrength: 3.0,
  centerPullStrength: 0.0008, // gentle pull toward screen center
  springRestLength: 180,      // desired px distance between connected nodes (must exceed nodeSpacing + 2*nodeRadius = 140px)
}

// Increment to force-reset localStorage when defaults change
const PHYSICS_VERSION = 5;

export const usePhysicsStore = create<PhysicsSettings>()(
  persist(
    (set) => ({
      ...defaultPhysics,
      setConnectionPullStrength: (v) => set({ connectionPullStrength: v }),
      setCollisionRepulsion: (v) => set({ collisionRepulsion: v }),
      setDamping: (v) => set({ damping: v }),
      setConnectionLifetime: (v) => set({ connectionLifetime: v }),
      setNodeSpacing: (v) => set({ nodeSpacing: v }),
      setDriftAwayStrength: (v) => set({ driftAwayStrength: v }),
      setCenterPullStrength: (v) => set({ centerPullStrength: v }),
      setSpringRestLength: (v) => set({ springRestLength: v }),
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
