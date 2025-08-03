import { useEffect, useRef } from 'react';
import { usePacketStore } from '../stores/packetStore';
import { useNetworkStore, Node } from '../stores/networkStore';
import { useSettingsStore } from '../stores/settingsStore';
import { logger } from '../utils/logger';

// SHARED CONSTANTS - Export these to prevent collision detection mismatches between modules
export const MIN_NODE_DISTANCE = 25; // Base minimum distance (will be overridden by settings)
export const NODE_RADIUS = 15; // Effective radius of each node for collision detection

// Generate packet-based color for connections
function getPacketColor(sourceIp: string, targetIp: string, protocol?: string): string {
  // Create a unique identifier from the packet's source and destination
  const packetId = `${sourceIp}-${targetIp}`;
  
  // Generate a hash from the packet identifier
  let hash = 0;
  for (let i = 0; i < packetId.length; i++) {
    hash = ((hash << 5) - hash) + packetId.charCodeAt(i);
    hash = hash & hash;
  }
  
  // Extract RGB components from hash
  const r = Math.abs(hash) % 256;
  const g = Math.abs(hash >> 8) % 256;
  const b = Math.abs(hash >> 16) % 256;
  
  // Ensure colors are bright and vibrant for visibility
  const minBrightness = 100;
  const adjustedR = Math.max(minBrightness, r);
  const adjustedG = Math.max(minBrightness, g);
  const adjustedB = Math.max(minBrightness, b);
  
  // Add protocol-based hue shift for variety
  let hueShift = 0;
  if (protocol) {
    switch (protocol.toLowerCase()) {
      case 'tcp': hueShift = 30; break;
      case 'udp': hueShift = 60; break;
      case 'icmp': hueShift = 90; break;
      case 'http': hueShift = 120; break;
      case 'https': hueShift = 150; break;
      default: hueShift = 0; break;
    }
  }
  
  // Convert to HSL, adjust hue, convert back to RGB
  const max = Math.max(adjustedR, adjustedG, adjustedB);
  const min = Math.min(adjustedR, adjustedG, adjustedB);
  const diff = max - min;
  
  let h = 0;
  if (diff !== 0) {
    if (max === adjustedR) h = ((adjustedG - adjustedB) / diff) % 6;
    else if (max === adjustedG) h = (adjustedB - adjustedR) / diff + 2;
    else h = (adjustedR - adjustedG) / diff + 4;
  }
  h = Math.round(60 * h);
  if (h < 0) h += 360;
  
  // Apply hue shift
  h = (h + hueShift) % 360;
  
  // High saturation and lightness for vibrant colors
  const s = 85; // High saturation
  const l = 60; // Good lightness for visibility
  
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Add source property to packet type
interface PacketWithSource extends Record<string, any> {
  id: string;
  src: string;
  dst: string;
  source?: 'real' | 'simulated' | string;
}

// Dynamic radial positioning that expands as more nodes are added
const generatePosition = (ip: string, existingNodes: Node[] = []): { x: number, y: number } => {
  const parts = ip.split('.');
  
  if (parts.length !== 4) {
    // Fallback for non-IP addresses - use hash for spiral positioning
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      hash = ((hash << 5) - hash) + ip.charCodeAt(i);
      hash = hash & hash;
    }
    
    // Count non-IP nodes to expand their radius
    const nonIpNodes = existingNodes.filter(n => !n.id.includes('.')).length;
    const expansionFactor = Math.floor(nonIpNodes / 10); // Expand every 10 nodes
    
    const angle = (Math.abs(hash) % 360) * (Math.PI / 180);
    const baseRadius = 50 + expansionFactor * 20;
    const radius = baseRadius + (Math.abs(hash >> 8) % 100); // Tighter range
    
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  }
  
  const [a, b, c, d] = parts.map(Number);
  
  // Count nodes in each IP category for dynamic expansion
  const nodeCategories = {
    home: existingNodes.filter(n => n.id.startsWith('192.168.')).length,
    corporate: existingNodes.filter(n => n.id.startsWith('10.')).length,
    enterprise: existingNodes.filter(n => n.id.startsWith('172.')).length,
    dns: existingNodes.filter(n => n.id.startsWith('8.') || n.id.startsWith('1.')).length,
    other: existingNodes.filter(n => n.id.includes('.') && 
      !n.id.startsWith('192.168.') && 
      !n.id.startsWith('10.') && 
      !n.id.startsWith('172.') && 
      !n.id.startsWith('8.') && 
      !n.id.startsWith('1.')).length
  };
  
  // Calculate expansion factors based on node density
  const baseExpansion = Math.floor(existingNodes.length / 50); // Global expansion every 50 nodes
  
  // Determine base ring/layer with dynamic expansion
  let baseRadius = 100; // Default radius from center
  let sectorOffset = 0; // Angular offset for IP type grouping
  let categoryExpansion = 0;
  
  if (a === 192 && b === 168) {
    // 192.168.x.x - Most common, closest to center
    categoryExpansion = Math.floor(nodeCategories.home / 15); // Expand every 15 home nodes
    baseRadius = 30 + baseExpansion * 10 + categoryExpansion * 15;
    sectorOffset = 0; // 0-90 degrees
  } else if (a === 10) {
    // 10.x.x.x - Second ring
    categoryExpansion = Math.floor(nodeCategories.corporate / 12); // Expand every 12 corporate nodes
    baseRadius = 60 + baseExpansion * 10 + categoryExpansion * 20;
    sectorOffset = 90; // 90-180 degrees
  } else if (a === 172 && b >= 16 && b <= 31) {
    // 172.16-31.x.x - Third ring
    categoryExpansion = Math.floor(nodeCategories.enterprise / 10); // Expand every 10 enterprise nodes
    baseRadius = 90 + baseExpansion * 10 + categoryExpansion * 25;
    sectorOffset = 180; // 180-270 degrees
  } else if ([8, 1].includes(a)) {
    // Public DNS (8.8.8.8, 1.1.1.1) - Special close position
    categoryExpansion = Math.floor(nodeCategories.dns / 5); // Expand every 5 DNS nodes
    baseRadius = 20 + baseExpansion * 5 + categoryExpansion * 10;
    sectorOffset = 270; // 270-360 degrees
  } else {
    // Other IPs - Outer ring
    categoryExpansion = Math.floor(nodeCategories.other / 8); // Expand every 8 other nodes
    baseRadius = 120 + baseExpansion * 15 + categoryExpansion * 30;
    sectorOffset = (a % 4) * 90; // Distribute in all sectors
  }
  
  // Add variation within the sector based on IP components
  const sectorAngle = 90; // Each IP type gets 90 degree sector
  const angleWithinSector = ((c * 256 + d) % 1000) / 1000 * sectorAngle;
  const finalAngle = (sectorOffset + angleWithinSector) * (Math.PI / 180);
  
  // Add radius variation based on subnet (smaller now since base expands)
  const radiusVariation = (b % 10) * 2; // Reduced variation
  const finalRadius = baseRadius + radiusVariation;
  
  // Calculate final position
  const x = Math.cos(finalAngle) * finalRadius;
  const y = Math.sin(finalAngle) * finalRadius;
  
  // Create a unique hash from all IP components for consistent jitter
  const ipHash = a * 1000000 + b * 10000 + c * 100 + d;
  
  // Add small random offset to prevent exact overlaps (reduced since we have expansion)
  const jitterX = ((ipHash % 10) - 5); // -5 to +5px jitter
  const jitterY = (((ipHash >> 8) % 10) - 5);
  
  const finalPosition = { 
    x: x + jitterX, 
    y: y + jitterY 
  };
  
  // Debug log position generation occasionally
  if (Math.random() < 0.05) { // Log 5% of position generations
    logger.log(`📍 Dynamic position for ${ip}: (${Math.round(finalPosition.x)}, ${Math.round(finalPosition.y)}) - radius: ${Math.round(finalRadius)} (base: ${baseRadius}, expansion: ${baseExpansion + categoryExpansion}), nodes: ${existingNodes.length}`);
  }
  
  return finalPosition;
};

// Collision detection and avoidance system

// Check if two nodes would overlap using dynamic spacing
function nodesOverlap(pos1: {x: number, y: number}, pos2: {x: number, y: number}, minDistance: number): boolean {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const overlap = distance < minDistance;
  
  // Debug log for overlaps
  if (overlap && Math.random() < 0.1) { // Log 10% of overlaps to avoid spam
    logger.log(`🔍 Overlap detected: distance ${Math.round(distance)}px < min ${minDistance}px between (${Math.round(pos1.x)}, ${Math.round(pos1.y)}) and (${Math.round(pos2.x)}, ${Math.round(pos2.y)})`);
  }
  
  return overlap;
}

// Find a collision-free position near the desired position
function findCollisionFreePosition(
  desiredPos: {x: number, y: number}, 
  existingNodes: Node[],
  minDistance: number
): {x: number, y: number} {
  // First check if the desired position is already free
  const hasCollision = existingNodes.some(node => 
    node.x !== undefined && node.y !== undefined && 
    nodesOverlap(desiredPos, {x: node.x, y: node.y}, minDistance)
  );
  
  if (!hasCollision) {
    logger.log(`✅ Desired position (${Math.round(desiredPos.x)}, ${Math.round(desiredPos.y)}) is collision-free with ${existingNodes.length} existing nodes`);
    return desiredPos;
  }
  
  logger.log(`⚠️ Collision detected at desired position (${Math.round(desiredPos.x)}, ${Math.round(desiredPos.y)}) with ${existingNodes.length} existing nodes - searching for free space...`);
  
  // Use spiral search to find the nearest free position
  const maxAttempts = 50; // Limit search to prevent infinite loops
  const spiralStep = Math.max(15, minDistance * 0.6); // Scale spiral step with min distance
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const angle = attempt * 0.5; // Spiral angle
    const radius = attempt * spiralStep;
    
    const testPos = {
      x: desiredPos.x + Math.cos(angle) * radius,
      y: desiredPos.y + Math.sin(angle) * radius
    };
    
    // Check if this position is collision-free
    const hasCollisionAtTest = existingNodes.some(node => 
      node.x !== undefined && node.y !== undefined && 
      nodesOverlap(testPos, {x: node.x, y: node.y}, minDistance)
    );
    
    if (!hasCollisionAtTest) {
      logger.log(`🎯 Found collision-free position after ${attempt} attempts: (${Math.round(testPos.x)}, ${Math.round(testPos.y)})`);
      return testPos;
    }
  }
  
  // If no free position found, add scaled random offset
  const fallbackDistance = Math.max(100, minDistance * 2);
  const fallbackPos = {
    x: desiredPos.x + (Math.random() - 0.5) * fallbackDistance,
    y: desiredPos.y + (Math.random() - 0.5) * fallbackDistance
  };
  
  logger.log(`⚠️ Using fallback position after ${maxAttempts} attempts: (${Math.round(fallbackPos.x)}, ${Math.round(fallbackPos.y)})`);
  return fallbackPos;
}

export const usePacketProcessor = () => {
  const { packets } = usePacketStore();
  const { addOrUpdateNode, addConnection, limitNetworkSize, nodes, updateNodeActivity } = useNetworkStore();
  const { nodeSpacing } = useSettingsStore(); // Get dynamic node spacing
  
  // Console log occasional packet source statistics
  const packetSourcesRef = useRef<{real: number, simulated: number, unknown: number}>({
    real: 0,
    simulated: 0,
    unknown: 0
  });
  
  // CRITICAL: Throttle processing to prevent infinite loops
  const lastProcessedCountRef = useRef<number>(0);
  const lastProcessedTimestampRef = useRef<number>(0); // Track by timestamp instead of count
  const processingRef = useRef<boolean>(false);
  const lastAutocleanTimeRef = useRef<number>(Date.now());
  const processedNodesRef = useRef<Set<string>>(new Set());
  
  // SIMPLIFIED: Process packets directly without complex batching
  useEffect(() => {
    if (processingRef.current) {
      logger.log('🚫 Processing already in progress, skipping...');
      return;
    }
    
    // FIXED: Use timestamp-based tracking instead of array length
    // Filter to packets newer than what we've already processed
    const unprocessedPackets = packets.filter(packet => {
      const packetTime = packet.timestamp || 0;
      return packetTime > lastProcessedTimestampRef.current;
    });
    
    if (unprocessedPackets.length === 0) {
      logger.log(`📝 No new packets by timestamp: ${packets.length} total, last processed timestamp: ${lastProcessedTimestampRef.current}`);
      return;
    }
    
    processingRef.current = true;
    logger.log(`🔄 TIMESTAMP-BASED Processing: ${unprocessedPackets.length} new packets (total: ${packets.length})`);
    
    try {
      // Get store state fresh each time (don't rely on stale closure)
      const { nodes: currentNodes, addOrUpdateNode, addConnection, limitNetworkSize, updateNodeActivity } = useNetworkStore.getState();
      
      const now = Date.now();
      let latestTimestamp = lastProcessedTimestampRef.current;
      
      // Track nodes added in this batch for collision detection
      const nodesAddedThisBatch: Node[] = [];
      
      // Process all new packets immediately
      unprocessedPackets.forEach(packet => {
        const sourceNode = packet.src;
        const targetNode = packet.dst;
        
        // Track the latest timestamp we've processed
        const packetTime = packet.timestamp || 0;
        if (packetTime > latestTimestamp) {
          latestTimestamp = packetTime;
        }
        
        // Skip invalid packets
        if (!sourceNode || !targetNode) return;
        
        // Combined list of existing nodes + nodes added in this batch
        const allNodesForCollision = [...currentNodes, ...nodesAddedThisBatch];
        
        // For source node: check if exists, update activity or create
        const existingSourceNode = allNodesForCollision.find(n => n.id === sourceNode);
        if (existingSourceNode) {
          logger.log(`⚡ UPDATING activity for existing source: ${sourceNode} at (${existingSourceNode.x}, ${existingSourceNode.y})`);
          updateNodeActivity(sourceNode);
        } else {
          logger.log(`➕ CREATING new source node: ${sourceNode}`);
          const desiredPosition = generatePosition(sourceNode, currentNodes);
          // Reduced debug logging for better performance
          if (Math.random() < 0.1) { // Only log 10% of creations
            logger.log(`🎯 Desired position for ${sourceNode}: (${desiredPosition.x}, ${desiredPosition.y})`);
            logger.log(`🔍 Checking collision against ${allNodesForCollision.length} nodes`);
          }
          
          const collisionFreePosition = findCollisionFreePosition(desiredPosition, allNodesForCollision, useSettingsStore.getState().nodeSpacing);
          if (Math.random() < 0.1) { // Only log 10% of final positions
            logger.log(`✅ Final position for ${sourceNode}: (${collisionFreePosition.x}, ${collisionFreePosition.y})`);
          }
          
          const newNode: Node = {
            id: sourceNode,
            label: sourceNode,
            x: collisionFreePosition.x,
            y: collisionFreePosition.y,
            size: 10,
            lastActive: now,
            packetSource: (packet as PacketWithSource).source
          };
          addOrUpdateNode(newNode);
          nodesAddedThisBatch.push(newNode); // Track for collision detection
          logger.log(`📝 Added source node to batch: ${sourceNode} at (${newNode.x}, ${newNode.y})`);
          processedNodesRef.current.add(sourceNode);
        }
        
        // Update the collision list again for target node processing
        const updatedNodesForCollision = [...currentNodes, ...nodesAddedThisBatch];
        
        // For target node: check if exists, update activity or create  
        const existingTargetNode = updatedNodesForCollision.find(n => n.id === targetNode);
        if (existingTargetNode) {
          logger.log(`⚡ UPDATING activity for existing target: ${targetNode} at (${existingTargetNode.x}, ${existingTargetNode.y})`);
          updateNodeActivity(targetNode);
        } else {
          logger.log(`➕ CREATING new target node: ${targetNode}`);
          const desiredPosition = generatePosition(targetNode, currentNodes);
          logger.log(`🎯 Desired position for ${targetNode}: (${desiredPosition.x}, ${desiredPosition.y})`);
          logger.log(`🔍 Checking collision against ${updatedNodesForCollision.length} nodes:`, updatedNodesForCollision.map(n => `${n.id}:(${n.x},${n.y})`));
          
          const collisionFreePosition = findCollisionFreePosition(desiredPosition, updatedNodesForCollision, useSettingsStore.getState().nodeSpacing);
          logger.log(`✅ Final position for ${targetNode}: (${collisionFreePosition.x}, ${collisionFreePosition.y})`);
          
          const newNode: Node = {
            id: targetNode,
            label: targetNode,
            x: collisionFreePosition.x,
            y: collisionFreePosition.y,
            size: 10,
            lastActive: now,
            packetSource: (packet as PacketWithSource).source
          };
          addOrUpdateNode(newNode);
          nodesAddedThisBatch.push(newNode); // Track for collision detection
          logger.log(`📝 Added target node to batch: ${targetNode} at (${newNode.x}, ${newNode.y})`);
          processedNodesRef.current.add(targetNode);
        }
        
        // Add connection with packet-based color
        const connectionId = packet.id || 
          `${sourceNode}-${targetNode}-${packet.timestamp}-${Math.random().toString(36).substring(2, 7)}`;
        
        const packetColor = getPacketColor(sourceNode, targetNode, packet.protocol);
        
        addConnection({
          id: connectionId,
          source: sourceNode,
          target: targetNode,
          protocol: packet.protocol,
          size: packet.size || 0,
          timestamp: packet.timestamp,
          packetSource: (packet as PacketWithSource).source,
          packetColor: packetColor,
          lastActive: now
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
      
      // Update our tracking - use timestamp instead of count
      lastProcessedTimestampRef.current = latestTimestamp;
      lastProcessedCountRef.current = packets.length; // Keep for debugging
      processingRef.current = false;
      
      logger.log(`✅ TIMESTAMP-BASED Processing complete: processed ${unprocessedPackets.length} packets, latest timestamp: ${latestTimestamp}`);
      
      // Periodically clean up old network elements
      if (Date.now() - lastAutocleanTimeRef.current > 15000) {
        limitNetworkSize(3000, 5000);
        
        // Periodically reposition overlapping nodes to maintain spacing
        const { repositionOverlappingNodes } = useNetworkStore.getState();
        repositionOverlappingNodes();
        
        lastAutocleanTimeRef.current = Date.now();
        
        // Log source stats every 15 seconds
        const total = packetSourcesRef.current.real + 
                      packetSourcesRef.current.simulated + 
                      packetSourcesRef.current.unknown;
        
        const freshNodes = useNetworkStore.getState().nodes;
        logger.log(`📊 Packet stats: Total: ${total}, Real: ${packetSourcesRef.current.real}, ` +
                   `Simulated: ${packetSourcesRef.current.simulated}, Processed nodes: ${processedNodesRef.current.size}, Rendered nodes: ${freshNodes.length}`);
      }
      
    } catch (error) {
      logger.error('💥 CRITICAL ERROR in packet processing:', error);
      processingRef.current = false;
    }
  }, [packets]); // FIXED: Only depend on packets, get everything else fresh from store
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
