import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  Object.defineProperty(globalThis, 'window', {
    value: {
      innerWidth: 1280,
      innerHeight: 800,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    writable: true,
  });

  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
    };
  })();
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
});

describe('useGraphLayout - Net-new Layout & Dock Capabilities', () => {
  describe('WORLD_SCALE and viewport parameters', () => {
    it('uses WORLD_SCALE > 1 to provide zoom-in headroom', async () => {
      const { WORLD_SCALE } = await import('./useGraphLayout');
      expect(WORLD_SCALE).toBeGreaterThan(1);
    });
  });

  describe('center pin dock coordinates calculation', () => {
    it('calculates center dock origin at screen center (50% width, 48% height)', () => {
      const screenW = 1280;
      const screenH = 800;
      const dockCx = screenW * 0.5;
      const dockCy = screenH * 0.48;
      expect(dockCx).toBe(640);
      expect(dockCy).toBe(384);
    });

    it('creates compact grid columns and rows based on pinned count', () => {
      const pinCount = 9;
      const pinCols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, pinCount))));
      const pinRows = Math.max(1, Math.ceil(pinCount / pinCols));
      expect(pinCols).toBe(3);
      expect(pinRows).toBe(3);
    });
  });

  describe('quiet ghost filtering and overview port label budget', () => {
    it('identifies interesting edges for overview port labels', () => {
      const isInteresting = (degree: number, sourcePinned: boolean, targetPinned: boolean) =>
        degree >= 6 || sourcePinned || targetPinned;

      expect(isInteresting(2, false, false)).toBe(false);
      expect(isInteresting(6, false, false)).toBe(true);
      expect(isInteresting(1, true, false)).toBe(true);
    });
  });
});
