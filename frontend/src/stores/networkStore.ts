import { create } from 'zustand';
import { throttle } from 'lodash';
import { useSettingsStore } from './settingsStore';

// Types
export interface Node {
  id: string;
  label?: string;
  x?: number;
  y?: number;
  size?: number;
  color?: number;
  highlighted?: boolean;
  lastActive: number; // Timestamp of last activity
  type?: string;
  packetSource?: 'real' | 'simulated' | string // For identifying real vs simulated packets
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  protocol?: string;
  size?: number;
  timestamp?: number;
  lastActive: number; // Timestamp of last activity
  packetSource?: 'real' | 'simulated' | string // For identifying real vs simulated packets
  packetColor?: string; // Color based on the packet that created this connection
}

interface NetworkState {
  nodes: Node[];
  connections: Connection[];
  addOrUpdateNode: (node: Node) => void;
  addOrUpdateConnection: (connection: Connection) => void;
  updateNodeActivity: (nodeId: string) => void;
  // Legacy/compatibility API methods
  addNode: (id: string, data?: Partial<Node>) => void;
  addConnection: (connection: Partial<Connection>) => void;
  removeNode: (id: string) => void;
  removeConnection: (id: string) => void;
  clearNetwork: () => void;
  removeInactiveElements: () => void;
  repositionOverlappingNodes: () => void;
  getEfficiencyStats: () => {
    nodeCount: number;
    connectionCount: number;
    pruneCount: number;
    avgAge: number;
  };
  limitNetworkSize: (maxNodes: number, maxConnections: number) => void;
}

// Constants for node expiration - REDUCED: Faster fading for inactive nodes
const NODE_EXPIRATION_TIME = 10000; // REDUCED: 10 seconds (was 30s) - nodes fade faster without packets
const VERY_OLD_NODE_TIME = 20000; // ADDED: 20 seconds - nodes are immediately removed (not just faded)
const CONNECTION_EXPIRATION_TIME = 5000; // 5 seconds of inactivity before connection removal as requested

// OPTIMIZED LIMITS: Set to 500 nodes as requested for performance
const MAX_NODES = 500; // REDUCED: Hard cap on node count to prevent slowdown (was 1000)
const PRUNE_TO_COUNT = 400; // REDUCED: When pruning, reduce to this number of nodes (was 750) 
const CRITICAL_NODE_COUNT = 450; // REDUCED: Critical threshold (was 800)

// Constants to limit memory usage - hard limits that prevent display issues
const HARD_LIMIT_NODES = 3500; // Absolute maximum before emergency trimming
const HARD_LIMIT_CONNECTIONS = 4000; // Absolute maximum before emergency trimming

// Target for keeping newest nodes/connections when pruning
const KEEP_NEWEST_NODES = 1500;      // When pruning, keep this many newest nodes
const KEEP_NEWEST_CONNECTIONS = 2000; // When pruning, keep this many newest connections

// Reuse positions for nodes with same IDs to prevent constant repositioning
const nodePositionCache = new Map<string, {x: number, y: number}>();

// Helper function to generate random positions within the window bounds
const generateRandomPosition = () => {
  const margin = 150; // Keep nodes away from the edges
  const maxWidth = Math.max(window.innerWidth || 1200, 800);
  const maxHeight = Math.max(window.innerHeight || 800, 600);
  
  // Make sure we have valid dimensions
  if (isNaN(maxWidth) || isNaN(maxHeight)) {
    return { x: 400, y: 300 }; // Fallback
  }
  
  // Generate position with margin
  const x = margin + Math.random() * (maxWidth - margin * 2);
  const y = margin + Math.random() * (maxHeight - margin * 2);
  
  return { x, y };
};

// Add a reference to monitor packet processing to diagnose rendering issues
let lastNodeAddTime = Date.now();
let totalNodesProcessed = 0;
let totalNodesAdded = 0;
let totalNodesRemoved = 0;

// Memory usage limits
const MEMORY_CHECK_INTERVAL = 5000; // Check memory every 5 seconds
let lastMemoryCheck = 0;
let isHighMemory = false;

// Function to check memory usage and adjust limits
const checkMemoryUsage = (): boolean => {
  const now = Date.now();
  
  // Only check periodically to avoid overhead
  if (now - lastMemoryCheck < MEMORY_CHECK_INTERVAL) {
    return isHighMemory;
  }
  
  lastMemoryCheck = now;
  
  // Check if memory API is available
  if (window.performance && (window.performance as any).memory) {
    const memInfo = (window.performance as any).memory;
    const usedMB = Math.round(memInfo.usedJSHeapSize / 1024 / 1024);
    const totalMB = Math.round(memInfo.jsHeapSizeLimit / 1024 / 1024);
    const memoryPercentage = (usedMB / totalMB * 100).toFixed(1);
    
    // Get total node and connection counts for reporting
    const { nodes, connections } = useNetworkStore.getState();
    
    // Consider high memory if using more than 70% of available memory
    const prevMemoryState = isHighMemory;
    isHighMemory = usedMB > totalMB * 0.7;
    
    // Log memory state changes or periodically log usage
    const shouldLog = prevMemoryState !== isHighMemory || 
                      (nodes.length > 2000) || 
                      (usedMB > totalMB * 0.5);
    
    if (shouldLog) {
      console.log(`Memory: ${usedMB}MB/${totalMB}MB (${memoryPercentage}%) - ` +
                  `Nodes: ${nodes.length}, Connections: ${connections.length}`);
      
      if (isHighMemory) {
        console.warn(`High memory usage detected (${memoryPercentage}%) - reducing network size limits`);
      } else if (prevMemoryState && !isHighMemory) {
        console.log('Memory usage returned to normal levels');
      }
    }
    
    // If memory is critically high (>85%), force emergency cleanup
    if (usedMB > totalMB * 0.85) {
      console.error(`CRITICAL MEMORY USAGE: ${memoryPercentage}% - emergency cleanup disabled to maintain 500+ nodes`);
      
      // DISABLED: Emergency cleanup was too aggressive for user requirement of 500+ nodes
      // Users should use system memory management instead of aggressive node pruning
      /*
      setTimeout(() => {
        const { nodes, connections } = useNetworkStore.getState();
        if (nodes.length > 1000) {
          useNetworkStore.getState().limitNetworkSize(1000, 2000);
          console.log('Emergency cleanup completed');
        }
      }, 0);
      */
    }
  }
  
  // Add diagnostics info for counters
  const diagnosticsInterval = 5000; // 5 seconds
  if (now - lastMemoryCheck > diagnosticsInterval) {
    console.log(`Node processing stats: Total processed=${totalNodesProcessed}, Added=${totalNodesAdded}, Removed=${totalNodesRemoved}`);
    console.log(`Last node added ${now - lastNodeAddTime}ms ago`);
  }
  
  return isHighMemory;
};

// Helper function to prune oldest nodes when approaching limits
const pruneOldestNodes = (nodes: Node[]): Node[] => {
  if (nodes.length <= PRUNE_TO_COUNT) return nodes;
  
  console.log(`Pruning nodes from ${nodes.length} to ${PRUNE_TO_COUNT}`);
  
  // Sort nodes by last active time (oldest first)
  const sortedNodes = [...nodes].sort((a, b) => a.lastActive - b.lastActive);
  
  // Keep only the most recently active nodes
  return sortedNodes.slice(nodes.length - PRUNE_TO_COUNT);
};

// Helper function for aggressive pruning during critical node counts
const forcePruneNodes = (nodes: Node[]): Node[] => {
  // Even more aggressive pruning
  const targetCount = Math.min(PRUNE_TO_COUNT, Math.floor(CRITICAL_NODE_COUNT * 0.75));
  
  // Keep only the most important nodes - prioritize:
  // 1. IP address nodes (containing dots)
  // 2. Most recently active nodes
  
  // First identify IP nodes
  const ipNodes = nodes.filter(node => node.label?.includes('.') || node.id.includes('.'));
  const otherNodes = nodes.filter(node => !(node.label?.includes('.') || node.id.includes('.')));
  
  // Sort both arrays by activity time
  const sortedIpNodes = [...ipNodes].sort((a, b) => b.lastActive - a.lastActive);
  const sortedOtherNodes = [...otherNodes].sort((a, b) => b.lastActive - a.lastActive);
  
  // Take most recent IP nodes, then fill remaining slots with other nodes
  const keptIpNodes = sortedIpNodes.slice(0, Math.min(sortedIpNodes.length, targetCount * 0.6));
  const remainingSlots = targetCount - keptIpNodes.length;
  const keptOtherNodes = sortedOtherNodes.slice(0, Math.min(sortedOtherNodes.length, remainingSlots));
  
  return [...keptIpNodes, ...keptOtherNodes];
};

// Helper function to prune oldest connections
const pruneOldestConnections = (connections: Connection[]): Connection[] => {
  const targetCount = PRUNE_TO_COUNT * 3; // INCREASED: Allow 3x more connections than nodes
  
  if (connections.length <= targetCount) return connections;
  
  // Sort by last active time (oldest first)
  const sortedConnections = [...connections].sort((a, b) => a.lastActive - b.lastActive);
  
  // Keep only the most recently active connections
  return sortedConnections.slice(connections.length - targetCount);
};

// Create store
export const useNetworkStore = create<NetworkState>((set, get) => ({
  nodes: [],
  connections: [],
  
  // DIRECT method to update node activity - bypasses batching
  updateNodeActivity: (nodeId: string) => {
    const now = Date.now();
    set((state) => {
      const nodeIndex = state.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex !== -1) {
        const updatedNodes = [...state.nodes];
        updatedNodes[nodeIndex] = { ...updatedNodes[nodeIndex], lastActive: now };
        console.log(`⚡ DIRECT UPDATE: ${nodeId} lastActive updated to ${now}`);
        return { ...state, nodes: updatedNodes };
      }
      return state;
    });
  },
  
  // Add or update a node (replace if exists)
  addOrUpdateNode: throttle((node: Node) => {
    totalNodesProcessed++;
    lastNodeAddTime = Date.now();
    
    set((state) => {
      // Normal flow - find and update node if it exists
      const nodeIndex = state.nodes.findIndex((n) => n.id === node.id);
      if (nodeIndex !== -1) {
        const updatedNodes = [...state.nodes];
        updatedNodes[nodeIndex] = node;
        return { ...state, nodes: updatedNodes };
      } else {
        totalNodesAdded++;
        
        // Check if we're approaching the max node count
        if (state.nodes.length >= MAX_NODES) {
          // Perform pruning to make room for new node
          const prunedNodes = pruneOldestNodes(state.nodes);
          return { ...state, nodes: [...prunedNodes, node] };
        }
        
        // Otherwise just add the new node
        return { ...state, nodes: [...state.nodes, node] };
      }
    });
  }, 10), // Throttle to 10ms to prevent too many updates
  
  // COMPATIBILITY FUNCTION: Add node with separate id and data params (old API)
  addNode: (id: string, data: Partial<Node> = {}) => {
    const now = Date.now();
    
    // Convert to the new format
    const node: Node = {
      id,
      ...data,
      lastActive: now, // Set current time as lastActive
    };
    
    // Call the new function
    useNetworkStore.getState().addOrUpdateNode(node);
  },
  
  // Add or update a connection (replace if exists)
  addOrUpdateConnection: throttle((connection: Connection) => {
    set((state) => {
      const connectionIndex = state.connections.findIndex(
        (c) => c.id === connection.id
      );
      
      if (connectionIndex !== -1) {
        // Update existing connection
        const updatedConnections = [...state.connections];
        updatedConnections[connectionIndex] = connection;
        return { ...state, connections: updatedConnections };
      } else {
        // Add new connection (with pruning if needed)
        if (state.connections.length > MAX_NODES * 3) {
          // Keep connection count in check relative to node count (increased ratio)
          const prunedConnections = pruneOldestConnections(state.connections);
          return { ...state, connections: [...prunedConnections, connection] };
        }
        return { ...state, connections: [...state.connections, connection] };
      }
    });
  }, 10), // Throttle to 10ms
  
  // COMPATIBILITY FUNCTION: Add connection (old API wrapper for addOrUpdateConnection)
  addConnection: (connection: Partial<Connection>) => {
    const now = Date.now();
    
    // Ensure it has required fields
    if (!connection.id || !connection.source || !connection.target) {
      console.error('Connection missing required fields:', connection);
      return;
    }
    
    // Add the lastActive timestamp
    const fullConnection: Connection = {
      ...connection as Connection,
      lastActive: now
    };
    
    // Call the new function
    useNetworkStore.getState().addOrUpdateConnection(fullConnection);
  },
  
  // Remove a node
  removeNode: (id: string) => {
    set((state) => {
      totalNodesRemoved++;
      return {
        ...state,
        nodes: state.nodes.filter((node) => node.id !== id),
      };
    });
  },
  
  // Remove a connection
  removeConnection: (id: string) => {
    set((state) => ({
      ...state,
      connections: state.connections.filter(
        (connection) => connection.id !== id
      ),
    }));
  },
  
  // Clear all nodes and connections
  clearNetwork: () => {
    // Don't clear position cache on network clear - preserve layout for next session
    // But reset memory status
    isHighMemory = false;
    lastMemoryCheck = 0;
    
    set({ nodes: [], connections: [] });
  },
  
  // Remove inactive elements based on lastActive timestamp
  removeInactiveElements: () => {
    const now = Date.now();
    
    set((state) => {
      // ADDED: First pass - immediately remove very old nodes (over 20 seconds)
      const nodesAfterAggresiveCleanup = state.nodes.filter(node => 
        now - node.lastActive < VERY_OLD_NODE_TIME
      );
      
      const veryOldNodesRemoved = state.nodes.length - nodesAfterAggresiveCleanup.length;
      if (veryOldNodesRemoved > 0) {
        console.log(`🧹 Aggressive cleanup: Removed ${veryOldNodesRemoved} very old nodes (>${VERY_OLD_NODE_TIME/1000}s)`);
      }
      
      // Check if we're approaching critical node count
      const isNearCritical = nodesAfterAggresiveCleanup.length >= MAX_NODES;
      
      // Use shorter expiration times when we have many nodes
      const nodeExpirationTime = isNearCritical 
        ? NODE_EXPIRATION_TIME * 0.6 // More aggressive cleanup when we have many nodes
        : NODE_EXPIRATION_TIME;
        
      const connectionExpirationTime = isNearCritical
        ? CONNECTION_EXPIRATION_TIME * 0.6
        : CONNECTION_EXPIRATION_TIME;
      
      // Always keep most recent connections and nodes regardless of activity
      // This ensures recent activity is always visible
      const PRESERVE_NEWEST_COUNT = 1500; // INCREASED: Always preserve 1500 newest nodes regardless of total count
      
      // Sort nodes by activity time (most recent first)
      const sortedNodes = [...nodesAfterAggresiveCleanup].sort((a, b) => b.lastActive - a.lastActive);
      
      // Keep newest nodes regardless of activity, then filter older ones
      const preservedNodes = sortedNodes.slice(0, PRESERVE_NEWEST_COUNT);
      const olderNodes = sortedNodes.slice(PRESERVE_NEWEST_COUNT);
      
      // Filter older nodes by activity (but only if we have way too many)
      const activeOlderNodes = nodesAfterAggresiveCleanup.length > 2000 ? olderNodes.filter(
        (node) => now - node.lastActive < nodeExpirationTime
      ) : olderNodes; // Keep all older nodes if we're under 2000 total
      
      // Final node list is preserved + active older nodes
      const activeNodes = [...preservedNodes, ...activeOlderNodes];
      
      // Sort connections by activity time (most recent first)
      const sortedConnections = [...state.connections].sort((a, b) => b.lastActive - a.lastActive);
      
      // Keep newest connections regardless of activity, then filter older ones
      const preservedConnections = sortedConnections.slice(0, PRESERVE_NEWEST_COUNT * 2); // More connections than nodes
      const olderConnections = sortedConnections.slice(PRESERVE_NEWEST_COUNT * 2);
      
      // Filter older connections by activity (but only if we have way too many)
      const activeOlderConnections = nodesAfterAggresiveCleanup.length > 3000 ? olderConnections.filter(
        (connection) => now - connection.lastActive < connectionExpirationTime
      ) : olderConnections; // Keep all older connections if we're under 3000 total
      
      // Final connection list is preserved + active older connections
      const activeConnections = [...preservedConnections, ...activeOlderConnections];
      
      const nodesRemoved = nodesAfterAggresiveCleanup.length - activeNodes.length;
      if (nodesRemoved > 0) {
        totalNodesRemoved += nodesRemoved;
      }
      
      // Only update if something changed
      if (activeNodes.length !== nodesAfterAggresiveCleanup.length || 
          activeConnections.length !== state.connections.length) {
        return {
          ...state,
          nodes: activeNodes,
          connections: activeConnections,
        };
      }
      
      // No changes
      return state;
    });
  },
  
  // Limit network size to stay under memory constraints
  limitNetworkSize: (maxNodes: number, maxConnections: number) => {
    // Apply memory-based adjustments
    const highMemory = checkMemoryUsage();
    
    // Use more aggressive limits when memory is high
    const effectiveMaxNodes = highMemory ? Math.floor(maxNodes * 0.5) : maxNodes;
    const effectiveMaxConnections = highMemory ? Math.floor(maxConnections * 0.5) : maxConnections;
    
    set((state) => {
      // Check if we need to update anything
      const needsNodeTrim = state.nodes.length > effectiveMaxNodes;
      const needsConnectionTrim = state.connections.length > effectiveMaxConnections;
      
      if (!needsNodeTrim && !needsConnectionTrim) {
        return state;
      }
      
      let updatedNodes = state.nodes;
      let updatedConnections = state.connections;
      
      // Trim nodes if needed
      if (needsNodeTrim) {
        // Sort by activity (most recent first)
        updatedNodes = [...state.nodes].sort((a, b) => b.lastActive - a.lastActive);
        
        // Keep only most recent
        updatedNodes = updatedNodes.slice(0, effectiveMaxNodes);
        totalNodesRemoved += (state.nodes.length - updatedNodes.length);
        
        console.log(`Network size limited: reduced from ${state.nodes.length} to ${updatedNodes.length} nodes`);
      }
      
      // Trim connections if needed
      if (needsConnectionTrim) {
        // Sort by activity (most recent first)
        updatedConnections = [...state.connections].sort((a, b) => b.lastActive - a.lastActive);
        
        // Keep only most recent
        updatedConnections = updatedConnections.slice(0, effectiveMaxConnections);
        
        console.log(`Network size limited: reduced from ${state.connections.length} to ${updatedConnections.length} connections`);
      }
      
      return { 
        ...state,
        nodes: updatedNodes,
        connections: updatedConnections
      };
    });
  },
  
  // Stats for monitoring efficiency
  getEfficiencyStats: () => {
    const { nodes, connections } = get();
    const now = Date.now();
    
    // Calculate average age
    const totalAge = nodes.reduce((sum, node) => sum + (now - node.lastActive), 0);
    const avgAge = nodes.length > 0 ? totalAge / nodes.length : 0;
    
    return {
      nodeCount: nodes.length,
      connectionCount: connections.length,
      pruneCount: totalNodesRemoved,
      avgAge: avgAge
    };
  },

  // Reposition overlapping nodes to prevent visual collisions
  repositionOverlappingNodes: () => {
    // Use the shared nodeSpacing constant from usePacketProcessor
    set((state) => {
      const updatedNodes = [...state.nodes];
      let repositioned = 0;
      
      // Check each node against all others for overlaps
      for (let i = 0; i < updatedNodes.length; i++) {
        const nodeA = updatedNodes[i];
        if (nodeA.x === undefined || nodeA.y === undefined) continue;
        
        for (let j = i + 1; j < updatedNodes.length; j++) {
          const nodeB = updatedNodes[j];
          if (nodeB.x === undefined || nodeB.y === undefined) continue;
          
          // Calculate distance between nodes
          const dx = nodeA.x - nodeB.x;
          const dy = nodeA.y - nodeB.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // If nodes are too close, move the less recently active node
          if (distance < useSettingsStore.getState().nodeSpacing) {
            const moveNode = nodeA.lastActive < nodeB.lastActive ? nodeA : nodeB;
            const keepNode = moveNode === nodeA ? nodeB : nodeA;
            
            // Type guard: ensure both nodes have valid coordinates
            if (moveNode.x === undefined || moveNode.y === undefined || 
                keepNode.x === undefined || keepNode.y === undefined) {
              continue;
            }
            
            // Calculate direction to move the node away
            const angle = Math.atan2(moveNode.y - keepNode.y, moveNode.x - keepNode.x);
            const moveDistance = useSettingsStore.getState().nodeSpacing + 10; // Add some extra buffer
            
            // Update position of the node to be moved
            const nodeIndex = moveNode === nodeA ? i : j;
            updatedNodes[nodeIndex] = {
              ...moveNode,
              x: keepNode.x + Math.cos(angle) * moveDistance,
              y: keepNode.y + Math.sin(angle) * moveDistance
            };
            
            repositioned++;
          }
        }
      }
      
      if (repositioned > 0) {
        console.log(`🔧 Repositioned ${repositioned} overlapping nodes (${useSettingsStore.getState().nodeSpacing}px shared threshold)`);
        return { ...state, nodes: updatedNodes };
      }
      
      return state;
    });
  }
})); 