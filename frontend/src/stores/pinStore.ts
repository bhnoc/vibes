import create from 'zustand';
import { persist, StateStorage } from 'zustand/middleware';
import { Address4 } from 'ip-address';

// Helper function to check if a value is a valid CIDR notation.
function isCIDR(value: string): boolean {
  try {
    const address = new Address4(value);
    return address.subnetMask > 0;
  } catch (error) {
    return false;
  }
}

// Helper function to check if a value is an IP range.
function isIPRange(value: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}-\d{1,3}$/.test(value);
}

// Helper function to convert an IP address to a BigInt for comparison.
function ipToBigInt(ip: string): bigint {
    return ip.split('.').reduce((acc, octet) => (acc << 8n) + BigInt(parseInt(octet, 10)), 0n);
}

interface PinState {
  pinningRules: Set<string>;
  addPinningRule: (rule: string) => void;
  removePinningRule: (rule: string) => void;
  clearAllPins: () => void;
  isPined: (ip: string) => boolean;
}

const storage: StateStorage = {
  getItem: (name) => {
    const str = localStorage.getItem(name);
    if (!str) return null;
    const { state } = JSON.parse(str);
    return {
      state: {
        ...state,
        pinningRules: new Set(state.pinningRules),
      },
    };
  },
  setItem: (name, newValue) => {
    const str = JSON.stringify({
      state: {
        ...newValue.state,
        pinningRules: Array.from(newValue.state.pinningRules),
      },
    });
    localStorage.setItem(name, str);
  },
  removeItem: (name) => localStorage.removeItem(name),
};

export const usePinStore = create<PinState>(
  persist(
    (set, get) => ({
      pinningRules: new Set(),
      addPinningRule: (rule) => {
        set((state) => {
          const newRules = new Set(state.pinningRules);
          newRules.add(rule);
          return { pinningRules: newRules };
        });
      },
      removePinningRule: (rule) => {
        set((state) => {
          const newRules = new Set(state.pinningRules);
          newRules.delete(rule);
          return { pinningRules: newRules };
        });
      },
      clearAllPins: () => {
        set({ pinningRules: new Set() });
      },
      isPined: (ip) => {
        const { pinningRules } = get();
        
        for (const rule of pinningRules) {
          if (isCIDR(rule)) {
            try {
              const subnet = new Address4(rule);
              if (new Address4(ip).isInSubnet(subnet)) {
                return true;
              }
            } catch (e) {
              // Invalid IP or CIDR, ignore.
            }
          } else if (isIPRange(rule)) {
            const [startIP, endOctet] = rule.split('-');
            const baseIP = startIP.substring(0, startIP.lastIndexOf('.'));
            const startOctet = parseInt(startIP.substring(startIP.lastIndexOf('.') + 1), 10);
            
            const ipBigInt = ipToBigInt(ip);
            const startRangeBigInt = ipToBigInt(`${baseIP}.${startOctet}`);
            const endRangeBigInt = ipToBigInt(`${baseIP}.${endOctet}`);

            if (ipBigInt >= startRangeBigInt && ipBigInt <= endRangeBigInt) {
              return true;
            }
          } else if (rule === ip) {
            return true;
          }
        }
        return false;
      }
    }),
    {
      name: 'pin-storage',
      storage: storage,
    }
  )
);
