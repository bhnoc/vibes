import { create } from 'zustand';

export interface Packet {
  id: string;
  type?: string;
  src: string;
  dst: string;
  size: number;
  protocol: string;
  timestamp: number;
  source?: 'real' | 'simulated' | string;
}

export interface PacketState {
  packets: Packet[];
  addPacket: (packet: any) => void;
  addPacketsBatch: (packets: any[]) => void;
  clearPackets: () => void;
  trimPackets: (maxCount: number) => void;
  connectionStatus: 'connected' | 'disconnected';
  setConnectionStatus: (status: 'connected' | 'disconnected') => void;
}

// Constants - REDUCED for minimal mode performance
const MAX_PACKET_HISTORY = 1000; // REDUCED: Maximum number of packets to keep in history
const PACKET_TRIM_THRESHOLD = 1500; // REDUCED: When to aggressively trim the packet history

// Batching system to prevent infinite updates
const packetBatchBuffer: any[] = [];
let batchTimeout: number | null = null;
let batchCallbackRef: ((packets: any[]) => void) | null = null;

const flushPacketBatch = () => {
  if (packetBatchBuffer.length > 0 && batchCallbackRef) {
    const packetsToProcess = [...packetBatchBuffer];
    packetBatchBuffer.length = 0; // Clear buffer
    batchCallbackRef(packetsToProcess);
  }
  batchTimeout = null;
};

export const usePacketStore = create<PacketState>((set, get) => ({
  packets: [],
  connectionStatus: 'disconnected',
  
  addPacket: (packetData: any) => {
    // Add to batch buffer instead of processing immediately
    packetBatchBuffer.push(packetData);
    
    // Set up flush timeout if not already set
    if (!batchTimeout) {
      batchTimeout = setTimeout(flushPacketBatch, 50); // Batch every 50ms
    }
  },
  
  addPacketsBatch: (packetsData: any[]) => set((state) => {
    const newPackets: Packet[] = [];
    
    packetsData.forEach(packetData => {
      // Generate a unique ID if none exists
      const id = packetData.id || `${packetData.src}-${packetData.dst}-${packetData.timestamp}-${Math.random().toString(36).substring(2, 9)}`;
      
      // Create packet with ID - use minimal object creation
      const packet: Packet = {
        id,
        src: packetData.src,
        dst: packetData.dst,
        size: packetData.size || 0,
        protocol: packetData.protocol || 'unknown',
        timestamp: packetData.timestamp || Math.floor(Date.now() / 1000),
        source: packetData.source // Include the source field
      };
      
      newPackets.push(packet);
    });
    
    // Add all packets at once
    let updatedPackets = [...state.packets, ...newPackets];
    
    // Check if we're approaching memory limits
    if (updatedPackets.length > PACKET_TRIM_THRESHOLD) {
      // Aggressive trim - keep only recent packets
      console.warn(`Packet count (${updatedPackets.length}) exceeding threshold, aggressively pruning`);
      updatedPackets = updatedPackets.slice(-Math.floor(MAX_PACKET_HISTORY/2));
    } else if (updatedPackets.length > MAX_PACKET_HISTORY) {
      updatedPackets = updatedPackets.slice(-MAX_PACKET_HISTORY);
    }
    
    return { packets: updatedPackets };
  }),
  
  clearPackets: () => set({ packets: [] }),
  
  trimPackets: (maxCount: number) => set((state) => {
    if (state.packets.length <= maxCount) return state;
    return { packets: state.packets.slice(-maxCount) };
  }),
  
  setConnectionStatus: (status) => set({ connectionStatus: status }),
}));

// Set up the batch callback when store is created
const store = usePacketStore.getState();
batchCallbackRef = (packets: any[]) => {
  store.addPacketsBatch(packets);
}; 