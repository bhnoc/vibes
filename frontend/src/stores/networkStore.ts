import { create } from 'zustand';
import { throttle } from 'lodash';
import { useSettingsStore } from './settingsStore';
import { usePhysicsStore } from './physicsStore';
import { usePinStore } from './pinStore';
import { logger } from '../utils/logger';

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
  packetColor?: string; // Color based on the packet that created this connection
  ports: Set<number>;
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
  srcPort?: number;
  dstPort?: number;
}

interface NetworkState {
  nodes: Node[];
  connections: Connection[];
  updateNodeActivity: (nodeId: string) => void;
  addOrUpdateNode: (node: Node) => void;
  addOrUpdateConnection: (connection: Connection) => void;
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

// Constants for node expiration - per user requirement: 4 seconds of no packets
const NODE_EXPIRATION_TIME = 4000; // 4 seconds of inactivity before node starts fading
const CONNECTION_EXPIRATION_TIME = 5000; // 5 seconds of inactivity before connection removal as requested

// OPTIMIZED LIMITS: Set to 500 nodes as requested for performance
const MAX_NODES = 1000; // REDUCED: Hard cap on node count to prevent slowdown (was 1000)
const PRUNE_TO_COUNT = 400; // REDUCED: When pruning, reduce to this number of nodes (was 750) 
const CRITICAL_NODE_COUNT = 800; // REDUCED: Critical threshold (was 800)

// Constants to limit memory usage - hard limits that prevent display issues
const HARD_LIMIT_NODES = 5000; // Absolute maximum before emergency trimming
const HARD_LIMIT_CONNECTIONS = 4500; // Absolute maximum before emergency trimming

// Target for keeping newest nodes/connections when pruning
const KEEP_NEWEST_NODES = 1500;      // When pruning, keep this many newest nodes
const KEEP_NEWEST_CONNECTIONS = 2000; // When pruning, keep this many newest connections

// Reuse positions for nodes with same IDs to prevent constant repositioning
const nodePositionCache = new Map<string, {x: number, y: number}>();

// Helper function to generate random positions within the window bounds
const generateRandomPosition = () => {
  const margin = 100; // Keep nodes away from the edges
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
const MEMORY_CHECK_INTERVAL = 3000; // Check memory every 5 seconds
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
      logger.log(`Memory: ${usedMB}MB/${totalMB}MB (${memoryPercentage}%) - ` +
                  `Nodes: ${nodes.length}, Connections: ${connections.length}`);
      
      if (isHighMemory) {
        logger.warn(`High memory usage detected (${memoryPercentage}%) - reducing network size limits`);
      } else if (prevMemoryState && !isHighMemory) {
        logger.log('Memory usage returned to normal levels');
      }
    }
    
    // If memory is critically high (>85%), force emergency cleanup
    if (usedMB > totalMB * 0.85) {
      logger.error(`CRITICAL MEMORY USAGE: ${memoryPercentage}% - emergency cleanup disabled to maintain 500+ nodes`);
      
      // DISABLED: Emergency cleanup was too aggressive for user requirement of 500+ nodes
      // Users should use system memory management instead of aggressive node pruning
      /*
      setTimeout(() => {
        const { nodes, connections } = useNetworkStore.getState();
        if (nodes.length > 1000) {
          useNetworkStore.getState().limitNetworkSize(1000, 2000);
          logger.log('Emergency cleanup completed');
        }
      }, 0);
      */
    }
  }
  
  // Add diagnostics info for counters
  const diagnosticsInterval = 5000; // 5 seconds
  if (now - lastMemoryCheck > diagnosticsInterval) {
    logger.log(`Node processing stats: Total processed=${totalNodesProcessed}, Added=${totalNodesAdded}, Removed=${totalNodesRemoved}`);
    logger.log(`Last node added ${now - lastNodeAddTime}ms ago`);
  }
  
  return isHighMemory;
};

// Helper function to prune oldest nodes when approaching limits
const pruneOldestNodes = (nodes: Node[]): Node[] => {
  if (nodes.length <= PRUNE_TO_COUNT) return nodes;
  
  logger.log(`Pruning nodes from ${nodes.length} to ${PRUNE_TO_COUNT}`);
  
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

// Check for collisions between two nodes
function checkCollision(node1: Node, node2: Node, minDistance: number): boolean {
  if (!node1 || !node2 || node1.x === undefined || node1.y === undefined || node2.x === undefined || node2.y === undefined) {
    return false;
  }
  const dx = node1.x - node2.x;
  const dy = node1.y - node2.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < minDistance;
}

// Create store
export const useNetworkStore = create<NetworkState>((set, get) => ({
  nodes: [],
  connections: [],
  
  // DIRECT method to update node activity - bypasses batching
  updateNodeActivity: (nodeId: string, port?: number) => {
    const now = Date.now();
    set((state) => {
      const nodeIndex = state.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex !== -1) {
        const updatedNodes = [...state.nodes];
        const existingNode = updatedNodes[nodeIndex];
        const updatedPorts = new Set(existingNode.ports);
        if (port) {
          updatedPorts.add(port);
        }
        updatedNodes[nodeIndex] = { ...existingNode, lastActive: now, ports: updatedPorts };
        logger.log(`⚡ DIRECT UPDATE: ${nodeId} lastActive updated to ${now}`);
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
        const existingNode = updatedNodes[nodeIndex];
        const mergedPorts = new Set([...(existingNode.ports || []), ...(node.ports || [])]);
        updatedNodes[nodeIndex] = { ...existingNode, ...node, ports: mergedPorts };
        return { ...state, nodes: updatedNodes };
      } else {
        totalNodesAdded++;
        
        // Ensure new nodes have an initialized ports set
        const newNode = { ...node, ports: new Set(node.ports || []) };

        // Check if we're approaching the max node count
        if (state.nodes.length >= MAX_NODES) {
          // Perform pruning to make room for new node
          const prunedNodes = pruneOldestNodes(state.nodes);
          return { ...state, nodes: [...prunedNodes, newNode] };
        }
        
        // Otherwise just add the new node
        return { ...state, nodes: [...state.nodes, newNode] };
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
      ports: new Set(),
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
        const existingConnection = updatedConnections[connectionIndex];
        // Smart merge: preserve port numbers if the new packet doesn't have them
        updatedConnections[connectionIndex] = {
          ...existingConnection,
          ...connection,
          srcPort: connection.srcPort || existingConnection.srcPort,
          dstPort: connection.dstPort || existingConnection.dstPort,
        };
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
      logger.error('Connection missing required fields:', connection);
      return;
    }
    
    // Add the lastActive timestamp
    const fullConnection: Connection = {
      ...connection as Connection,
      lastActive: now,
      srcPort: connection.srcPort,
      dstPort: connection.dstPort
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
        connections: state.connections.filter(c => c.source !== id && c.target !== id),
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
    const { isPined } = usePinStore.getState();

    set((state) => {
      const activeNodes = state.nodes.filter(
        (node) => isPined(node.id) || now - node.lastActive < NODE_EXPIRATION_TIME
      );

      const activeConnections = state.connections.filter(
        (connection) => now - connection.lastActive < CONNECTION_EXPIRATION_TIME
      );

      const nodesRemoved = state.nodes.length - activeNodes.length;
      if (nodesRemoved > 0) {
        totalNodesRemoved += nodesRemoved;
      }

      // Only update if something changed
      if (
        activeNodes.length !== state.nodes.length ||
        activeConnections.length !== state.connections.length
      ) {
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
    const { isPined } = usePinStore.getState();

    set((state) => {
      const needsNodeTrim = state.nodes.length > maxNodes;
      const needsConnectionTrim = state.connections.length > maxConnections;

      if (!needsNodeTrim && !needsConnectionTrim) {
        return state;
      }

      let updatedNodes = state.nodes;
      let updatedConnections = state.connections;

      if (needsNodeTrim) {
        const pinnedNodes = state.nodes.filter(node => isPined(node.id));
        const unpinnedNodes = state.nodes.filter(node => !isPined(node.id));

        const sortedUnpinnedNodes = unpinnedNodes.sort((a, b) => b.lastActive - a.lastActive);
        
        const trimmedUnpinnedNodes = sortedUnpinnedNodes.slice(0, maxNodes - pinnedNodes.length);

        updatedNodes = [...pinnedNodes, ...trimmedUnpinnedNodes];
        totalNodesRemoved += state.nodes.length - updatedNodes.length;
      }

      if (needsConnectionTrim) {
        updatedConnections = [...state.connections]
          .sort((a, b) => b.lastActive - a.lastActive)
          .slice(0, maxConnections);
      }

      return {
        ...state,
        nodes: updatedNodes,
        connections: updatedConnections,
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
    // Use the shared nodeSpacing constant from the physics store
    const { nodeSpacing } = usePhysicsStore.getState();
    const minDistance = nodeSpacing;

    const allNodes = new Map<string, Node>();
    get().nodes.forEach(node => {
      allNodes.set(node.id, node);
    });

    let repositioned = 0;

    allNodes.forEach(node => {
      // Check for collisions with other nodes
      allNodes.forEach(otherNode => {
        if (node.id !== otherNode.id && checkCollision(node, otherNode, minDistance)) {
          // Simple repositioning: move the current node slightly
          const angle = Math.random() * 2 * Math.PI;
          if (node.x !== undefined && node.y !== undefined) {
            node.x += Math.cos(angle) * (minDistance / 2);
            node.y += Math.sin(angle) * (minDistance / 2);
            repositioned++;
          }
        }
      });
    });

    if (repositioned > 0) {
      set({ nodes: Array.from(allNodes.values()) });
      logger.log(`🔧 Repositioned ${repositioned} overlapping nodes (${minDistance}px shared threshold)`);
    }
  }
}));
