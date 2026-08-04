import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const boolOrNumToIntensity = (v: unknown, fallback: number): number => {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' && Number.isFinite(v)) return clamp01(v);
  return fallback;
};

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
  // ── Experimental feature intensities (0 = off / classic, 1 = full) ───────
  /** Ball size from connection count (degree). */
  nodeSizingIntensity: number;
  /** Line width from sustained throughput. */
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
  setNodeSizingIntensity: (v: number) => void;
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
  nodeSizingIntensity: 1,
  edgeWidthIntensity: 1,
}

// Increment to force-reset / migrate localStorage when settings shape changes
const PHYSICS_VERSION = 27;

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
      setNodeSizingIntensity: (v) => set({ nodeSizingIntensity: clamp01(v) }),
      setEdgeWidthIntensity: (v) => set({ edgeWidthIntensity: clamp01(v) }),
      resetPhysicsDefaults: () => set({ ...defaultPhysics }),
    }),
    {
      name: 'physics-settings-storage',
      version: PHYSICS_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: any, version: number) => {
        if (version < PHYSICS_VERSION) {
          const prev = persistedState ?? {};
          const {
            klipperMode: _km,
            klipperIntensity: _ki,
            klipperThroughputSizing,
            klipperEdgeThickness,
            klipperDimQuiet: _kd,
            klipperEnhanceBusy: _keb,
            klipperSizingIntensity,
            klipperEdgeIntensity,
            klipperDimIntensity: _kdi,
            klipperEnhanceIntensity: _kei,
            dimQuietIntensity: _dd,
            enhanceBusyIntensity: _eb,
            nodeSizeIntensity,
            ...rest
          } = prev;
          return {
            ...defaultPhysics,
            ...rest,
            nodeSizingIntensity: boolOrNumToIntensity(
              prev.nodeSizingIntensity ?? nodeSizeIntensity ?? klipperSizingIntensity ?? klipperThroughputSizing,
              1,
            ),
            edgeWidthIntensity: boolOrNumToIntensity(
              prev.edgeWidthIntensity ?? klipperEdgeIntensity ?? klipperEdgeThickness,
              1,
            ),
          };
        }
        return persistedState;
      },
    }
  )
)
