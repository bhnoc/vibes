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
  clearPackets: () => void;
  connectionStatus: 'connected' | 'disconnected';
  setConnectionStatus: (status: 'connected' | 'disconnected') => void;
}

export const usePacketStore = create<PacketState>((set) => ({
  packets: [],
  connectionStatus: 'disconnected',
  addPacket: (packetData: any) => set((state) => {
    // Generate a unique ID if none exists
    const id = packetData.id || `${packetData.src}-${packetData.dst}-${packetData.timestamp}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Create packet with ID
    const packet: Packet = {
      id,
      src: packetData.src,
      dst: packetData.dst,
      size: packetData.size,
      protocol: packetData.protocol,
      timestamp: packetData.timestamp,
      source: packetData.source // Include the source field
    };
    
    // Add packet to store, limit to last 1000 packets
    const updatedPackets = [...state.packets, packet];
    if (updatedPackets.length > 1000) {
      return { packets: updatedPackets.slice(-1000) };
    }
    
    return { packets: updatedPackets };
  }),
  clearPackets: () => set({ packets: [] }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
})); 