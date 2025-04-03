import { useEffect, useRef } from 'react';
import { usePacketStore } from '../stores/packetStore';
import { useNetworkStore } from '../stores/networkStore';

// Add source property to packet type
interface PacketWithSource extends Record<string, any> {
  id: string;
  src: string;
  dst: string;
  source?: 'real' | 'simulated' | string;
}

export const usePacketProcessor = () => {
  const { packets } = usePacketStore();
  const { addNode, addConnection, removeOldConnections, limitNetworkSize } = useNetworkStore();
  const processedPacketsRef = useRef<Set<string>>(new Set());
  
  // Console log occasional packet source statistics
  const packetSourcesRef = useRef<{real: number, simulated: number, unknown: number}>({
    real: 0,
    simulated: 0,
    unknown: 0
  });
  
  // Create a ref to throttle updates
  const lastProcessedCountRef = useRef<number>(0);
  
  // Process packets in batches
  useEffect(() => {
    if (packets.length <= lastProcessedCountRef.current) return;
    
    // Get only new packets
    const newPackets = packets.slice(lastProcessedCountRef.current);
    
    // Process only a limited batch to prevent frame drops
    const batchSize = Math.min(10, newPackets.length);
    const processBatch = newPackets.slice(0, batchSize);
    
    // Process batch of new packets
    processBatch.forEach(packet => {
      const sourceNode = packet.src;
      const targetNode = packet.dst;
      
      // Add nodes if they don't exist
      addNode(sourceNode, {
        label: sourceNode
      });
      
      addNode(targetNode, {
        label: targetNode
      });
      
      // Add connection
      addConnection({
        id: `${packet.id}`,
        source: sourceNode,
        target: targetNode,
        protocol: packet.protocol,
        size: packet.size,
        timestamp: packet.timestamp,
        packetSource: (packet as PacketWithSource).source // Pass the source type
      });
      
      // Track packet source for debugging
      const typedPacket = packet as PacketWithSource;
      if (typedPacket.source === 'real') {
        packetSourcesRef.current.real++;
      } else if (typedPacket.source === 'simulated') {
        packetSourcesRef.current.simulated++;
      } else {
        packetSourcesRef.current.unknown++;
      }
    });
    
    // Log source stats every 100 packets
    const totalPackets = packetSourcesRef.current.real + 
                        packetSourcesRef.current.simulated + 
                        packetSourcesRef.current.unknown;
    
    if (totalPackets % 100 === 0) {
      console.log(`📊 Packet sources: Real: ${packetSourcesRef.current.real}, ` +
                 `Simulated: ${packetSourcesRef.current.simulated}, ` +
                 `Unknown: ${packetSourcesRef.current.unknown}`);
    }
    
    // Only update the lastProcessedCount by the number we actually processed
    lastProcessedCountRef.current += batchSize;
  }, [packets, addNode, addConnection]);
  
  // Periodically clean up old connections and limit network size
  useEffect(() => {
    // Run cleanup every 5 seconds
    const cleanupInterval = setInterval(() => {
      // Remove connections older than 60 seconds
      removeOldConnections(60);
      
      // Limit network size to prevent memory issues
      limitNetworkSize(50, 100); // Max 50 nodes, 100 connections
    }, 5000);
    
    return () => clearInterval(cleanupInterval);
  }, [removeOldConnections, limitNetworkSize]);
};

// Helper function to get color based on protocol
const getProtocolColor = (protocol: string): number => {
  switch (protocol?.toLowerCase()) {
    case 'tcp':
      return 0x00ff00; // Green
    case 'udp':
      return 0xff00ff; // Magenta
    case 'icmp':
      return 0x00ffff; // Cyan
    default:
      return 0xffffff; // White
  }
}; 