import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface PhysicsSettings {
  connectionPullStrength: number;
  collisionRepulsion: number;
  damping: number;
  connectionLifetime: number;
  nodeLifetime: number;
  nodeSpacing: number;
  driftAwayStrength: number;
  centerPullStrength: number;
  springRestLength: number;
  /** Scales connection-degree → node radius (0 = off, 1 = full effect). */
  nodeSizeIntensity: number;
  /** Scales throughput → edge width (0 = off, 1 = full effect). */
  edgeWidthIntensity: number;
  setConnectionPullStrength: (v: number) => void;
  setCollisionRepulsion: (v: number) => void;
  setDamping: (v: number) => void;
  setConnectionLifetime: (v: number) => void;
  setNodeLifetime: (v: number) => void;
  setNodeSpacing: (v: number) => void;
  setDriftAwayStrength: (v: number) => void;
  setCenterPullStrength: (v: number) => void;
  setSpringRestLength: (v: number) => void;
  setNodeSizeIntensity: (v: number) => void;
  setEdgeWidthIntensity: (v: number) => void;
  resetPhysicsDefaults: () => void;
}

const defaultPhysics = {
  connectionPullStrength: 1.45,
  collisionRepulsion: 0.35,
  damping: 0.35,            // strong decay so the layout settles instead of oscillating
  connectionLifetime: 5000,
  nodeLifetime: 15000,
  nodeSpacing: 75,
  driftAwayStrength: 2.4,
  centerPullStrength: 0.002, // weak territorial bias toward each node's subnet home
  springRestLength: 70,
  nodeSizeIntensity: 1,
  edgeWidthIntensity: 1,
}

// Increment when defaults/shape change; migrate merges so user tuning is kept.
const PHYSICS_VERSION = 23;

export const usePhysicsStore = create<PhysicsSettings>()(
  persist(
    (set) => ({
      ...defaultPhysics,
      setConnectionPullStrength: (v) => set({ connectionPullStrength: v }),
      setCollisionRepulsion: (v) => set({ collisionRepulsion: v }),
      setDamping: (v) => set({ damping: v }),
      setConnectionLifetime: (v) => set({ connectionLifetime: v }),
      setNodeLifetime: (v) => set({ nodeLifetime: v }),
      setNodeSpacing: (v) => set({ nodeSpacing: v }),
      setDriftAwayStrength: (v) => set({ driftAwayStrength: v }),
      setCenterPullStrength: (v) => set({ centerPullStrength: v }),
      setSpringRestLength: (v) => set({ springRestLength: v }),
      setNodeSizeIntensity: (v) => set({ nodeSizeIntensity: Math.max(0, Math.min(1, v)) }),
      setEdgeWidthIntensity: (v) => set({ edgeWidthIntensity: Math.max(0, Math.min(1, v)) }),
      resetPhysicsDefaults: () => set({ ...defaultPhysics }),
    }),
    {
      name: 'physics-settings-storage',
      version: PHYSICS_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: any) => {
        const merged = {
          ...defaultPhysics,
          ...(persistedState && typeof persistedState === 'object' ? persistedState : {}),
        };
        merged.nodeSizeIntensity = Math.max(0, Math.min(1, Number(merged.nodeSizeIntensity) || 0));
        merged.edgeWidthIntensity = Math.max(0, Math.min(1, Number(merged.edgeWidthIntensity) || 0));
        return merged;
      },
    }
  )
)
