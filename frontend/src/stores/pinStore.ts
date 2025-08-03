import create from 'zustand';

interface PinState {
  pinnedIPs: Set<string>;
  addPinnedIP: (ip: string) => void;
  removePinnedIP: (ip: string) => void;
  isPined: (ip: string) => boolean;
}

export const usePinStore = create<PinState>((set, get) => ({
  pinnedIPs: new Set(),
  addPinnedIP: (ip) => {
    set((state) => {
      const newPinnedIPs = new Set(state.pinnedIPs);
      newPinnedIPs.add(ip);
      return { pinnedIPs: newPinnedIPs };
    });
  },
  removePinnedIP: (ip) => {
    set((state) => {
      const newPinnedIPs = new Set(state.pinnedIPs);
      newPinnedIPs.delete(ip);
      return { pinnedIPs: newPinnedIPs };
    });
  },
  isPined: (ip) => {
    const { pinnedIPs } = get();
    return pinnedIPs.has(ip);
  }
}));
