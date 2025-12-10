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
  updateNodeActivity: (nodeId: string, port?: number) => void;
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

// Note: All expiration times and limits are now dynamic based on slider settings
// - connectionLifetime from usePhysicsStore (Connection Lifetime slider)
// - maxNodes from useSettingsStore (Max Nodes slider)
// No hardcoded timeouts or limits - everything respects user settings

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
// CRITICAL: Never prune nodes that have active connections
const pruneOldestNodes = (nodes: Node[], maxNodes: number, connections: Connection[]): Node[] => {
  const pruneToCount = Math.floor(maxNodes * 0.8); // Prune to 80% of max
  if (nodes.length <= pruneToCount) return nodes;

  logger.log(`Pruning nodes from ${nodes.length} to ${pruneToCount}`);

  // Get connection lifetime from physics store
  const { connectionLifetime } = usePhysicsStore.getState();
  const now = Date.now();

  // Build set of node IDs that have active connections
  const nodesWithActiveConnections = new Set<string>();
  connections.forEach(conn => {
    if (now - conn.lastActive < connectionLifetime) {
      nodesWithActiveConnections.add(conn.source);
      nodesWithActiveConnections.add(conn.target);
    }
  });

  // Separate nodes into two groups: with active connections and without
  const nodesWithConnections = nodes.filter(n => nodesWithActiveConnections.has(n.id));
  const nodesWithoutConnections = nodes.filter(n => !nodesWithActiveConnections.has(n.id));

  // If nodes with connections exceed our target, keep all of them (they're protected)
  if (nodesWithConnections.length >= pruneToCount) {
    logger.log(`⚠️ Cannot prune: ${nodesWithConnections.length} nodes have active connections (target: ${pruneToCount})`);
    return nodes; // Don't prune if all active nodes are connected
  }

  // Sort disconnected nodes by activity (oldest first)
  const sortedDisconnected = nodesWithoutConnections.sort((a, b) => a.lastActive - b.lastActive);

  // Calculate how many disconnected nodes we can keep
  const remainingSlots = pruneToCount - nodesWithConnections.length;
  const keptDisconnected = sortedDisconnected.slice(-remainingSlots); // Keep most recent

  logger.log(`Keeping ${nodesWithConnections.length} connected + ${keptDisconnected.length} disconnected = ${nodesWithConnections.length + keptDisconnected.length} nodes`);

  return [...nodesWithConnections, ...keptDisconnected];
};

// Helper function to prune oldest connections
// IMPORTANT: First removes expired connections (beyond connectionLifetime), then prunes by age
const pruneOldestConnections = (connections: Connection[], maxNodes: number): Connection[] => {
  const pruneToCount = Math.floor(maxNodes * 0.8); // 80% of max nodes
  const targetCount = pruneToCount * 3; // INCREASED: Allow 3x more connections than nodes

  // Get connection lifetime from physics store
  const { connectionLifetime } = usePhysicsStore.getState();
  const now = Date.now();

  // Step 1: Remove expired connections (beyond connectionLifetime)
  const activeConnections = connections.filter(conn => now - conn.lastActive < connectionLifetime);

  // If we're under target after removing expired, we're done
  if (activeConnections.length <= targetCount) {
    if (activeConnections.length < connections.length) {
      logger.log(`Pruned ${connections.length - activeConnections.length} expired connections`);
    }
    return activeConnections;
  }

  // Step 2: Still over target, prune by age (keep most recent)
  const sortedConnections = [...activeConnections].sort((a, b) => b.lastActive - a.lastActive);
  const prunedConnections = sortedConnections.slice(0, targetCount);

  logger.log(`Pruned ${connections.length - prunedConnections.length} connections: ${connections.length - activeConnections.length} expired + ${activeConnections.length - prunedConnections.length} oldest`);

  return prunedConnections;
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
        // DISABLED FOR TESTING - Suspected to be causing issues
        const maxNodes = useSettingsStore.getState().maxNodes;
        if (false && state.nodes.length >= maxNodes) {
          // Perform pruning to make room for new node
          // Only prune nodes WITHOUT active connections
          logger.log(`⚠️ Pruning triggered! Current nodes: ${state.nodes.length}, maxNodes setting: ${maxNodes}`);
          const prunedNodes = pruneOldestNodes(state.nodes, maxNodes, state.connections);

          // Check if pruning actually freed up space
          if (prunedNodes.length < state.nodes.length) {
            // Space was freed, add the new node
            logger.log(`✅ Pruned ${state.nodes.length - prunedNodes.length} disconnected nodes, adding new node`);
            return { ...state, nodes: [...prunedNodes, newNode] };
          } else {
            // All nodes have active connections, cannot add new node
            logger.log(`⚠️ Cannot add new node: all ${state.nodes.length} nodes have active connections`);
            return state; // Don't add the node
          }
        }

        // Otherwise just add the new node
        return { ...state, nodes: [...state.nodes, newNode] };
      }
    });
  }, 0), // No throttle - process immediately like a game engine
  
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
        // DISABLED FOR TESTING - Suspected to be causing issues
        const maxNodes = useSettingsStore.getState().maxNodes;
        if (false && state.connections.length > maxNodes * 3) {
          // Keep connection count in check relative to node count (increased ratio)
          const prunedConnections = pruneOldestConnections(state.connections, maxNodes);
          return { ...state, connections: [...prunedConnections, connection] };
        }
        return { ...state, connections: [...state.connections, connection] };
      }
    });
  }, 0), // No throttle - process immediately
  
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
    const maxNodes = useSettingsStore.getState().maxNodes;
    // Get connection lifetime from physics store (source of truth)
    const { connectionLifetime } = usePhysicsStore.getState();

    set((state) => {
      // Check if we're approaching critical node count
      const isNearCritical = state.nodes.length >= maxNodes;

      // Use connection lifetime from physics slider - ALWAYS respect the slider value
      // Node lifetime should match connection lifetime so nodes don't disappear while their connections are active
      // NOTE: We used to reduce this by 0.6 when near capacity, but that violates user expectations
      // The user's slider setting is the source of truth
      const nodeExpirationTime = connectionLifetime;
      const connectionExpirationTime = connectionLifetime;
      
      // Build set of nodes with active connections - these MUST be kept
      const nodesWithActiveConnections = new Set<string>();
      state.connections.forEach(conn => {
        if (now - conn.lastActive < connectionExpirationTime) {
          nodesWithActiveConnections.add(conn.source);
          nodesWithActiveConnections.add(conn.target);
        }
      });

      // Separate nodes into categories
      const connectedNodes = state.nodes.filter(n => nodesWithActiveConnections.has(n.id));
      const pinnedNodes = state.nodes.filter(n => !nodesWithActiveConnections.has(n.id) && isPined(n.id));
      const otherNodes = state.nodes.filter(n => !nodesWithActiveConnections.has(n.id) && !isPined(n.id));

      // Sort other nodes by activity (most recent first)
      const sortedOtherNodes = otherNodes.sort((a, b) => b.lastActive - a.lastActive);

      // Always keep most recent other nodes regardless of activity
      // Scale with maxNodes: preserve 30% of maxNodes, minimum 10% or 50 nodes (whichever is larger)
      const minPreserve = Math.max(50, Math.floor(maxNodes * 0.1)); // At least 10% or 50 nodes
      const PRESERVE_NEWEST_COUNT = Math.max(minPreserve, Math.floor(maxNodes * 0.3)); // Prefer 30% if larger
      const preservedOtherNodes = sortedOtherNodes.slice(0, PRESERVE_NEWEST_COUNT);
      const olderOtherNodes = sortedOtherNodes.slice(PRESERVE_NEWEST_COUNT);

      // Filter older nodes by activity (but only if we have way too many)
      // Use maxNodes as the threshold for when to start filtering
      const activeOlderNodes = state.nodes.length > maxNodes ? olderOtherNodes.filter(
        (node) => now - node.lastActive < nodeExpirationTime
      ) : olderOtherNodes; // Keep all older nodes if we're under max

      // Final node list: connected + pinned + preserved + active older nodes
      const activeNodes = [...connectedNodes, ...pinnedNodes, ...preservedOtherNodes, ...activeOlderNodes];

      logger.log(`Node cleanup: ${connectedNodes.length} connected, ${pinnedNodes.length} pinned, ${preservedOtherNodes.length} preserved (${PRESERVE_NEWEST_COUNT} target), ${activeOlderNodes.length} older = ${activeNodes.length} total`);
      
      // Sort connections by activity time (most recent first)
      const sortedConnections = [...state.connections].sort((a, b) => b.lastActive - a.lastActive);
      
      // Keep newest connections regardless of activity, then filter older ones
      const preservedConnections = sortedConnections.slice(0, PRESERVE_NEWEST_COUNT * 2); // More connections than nodes
      const olderConnections = sortedConnections.slice(PRESERVE_NEWEST_COUNT * 2);
      
      // Filter older connections by activity (but only if we have way too many)
      // Allow 3x more connections than max nodes
      const activeOlderConnections = state.connections.length > (maxNodes * 3) ? olderConnections.filter(
        (connection) => now - connection.lastActive < connectionExpirationTime
      ) : olderConnections; // Keep all older connections if we're under limit
      
      // Final connection list is preserved + active older connections
      const activeConnections = [...preservedConnections, ...activeOlderConnections];
      
      const nodesRemoved = state.nodes.length - activeNodes.length;
      if (nodesRemoved > 0) {
        totalNodesRemoved += nodesRemoved;
      }
      
      // Only update if something changed
      if (activeNodes.length !== state.nodes.length || 
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
    const { isPined } = usePinStore.getState();

    // Use the maxNodes value directly from slider - don't override based on memory
    // Users should manage their own max nodes slider if experiencing memory issues
    const effectiveMaxNodes = maxNodes;
    const effectiveMaxConnections = maxConnections;
    
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
        // Get connection lifetime to check for active connections
        const { connectionLifetime } = usePhysicsStore.getState();
        const now = Date.now();

        // Build set of nodes with active connections
        const nodesWithActiveConnections = new Set<string>();
        state.connections.forEach(conn => {
          if (now - conn.lastActive < connectionLifetime) {
            nodesWithActiveConnections.add(conn.source);
            nodesWithActiveConnections.add(conn.target);
          }
        });

        // Separate nodes: connected, pinned, and other
        const connectedNodes = state.nodes.filter(n => nodesWithActiveConnections.has(n.id));
        const pinnedNodes = state.nodes.filter(n => !nodesWithActiveConnections.has(n.id) && isPined(n.id));
        const otherNodes = state.nodes.filter(n => !nodesWithActiveConnections.has(n.id) && !isPined(n.id));

        // Sort other nodes by activity (most recent first)
        const sortedOtherNodes = otherNodes.sort((a, b) => b.lastActive - a.lastActive);

        // Calculate how many other nodes we can keep
        const protectedCount = connectedNodes.length + pinnedNodes.length;
        const remainingSlots = Math.max(0, effectiveMaxNodes - protectedCount);

        // Keep only most recent other nodes within remaining slots
        const keptOtherNodes = sortedOtherNodes.slice(0, remainingSlots);

        updatedNodes = [...connectedNodes, ...pinnedNodes, ...keptOtherNodes];
        totalNodesRemoved += (state.nodes.length - updatedNodes.length);

        logger.log(`Network size limited: ${connectedNodes.length} connected + ${pinnedNodes.length} pinned + ${keptOtherNodes.length} other = ${updatedNodes.length} nodes (from ${state.nodes.length})`);
      }
      
      // Trim connections if needed
      if (needsConnectionTrim) {
        // Sort by activity (most recent first)
        updatedConnections = [...state.connections].sort((a, b) => b.lastActive - a.lastActive);
        
        // Keep only most recent
        updatedConnections = updatedConnections.slice(0, effectiveMaxConnections);
        
        logger.log(`Network size limited: reduced from ${state.connections.length} to ${updatedConnections.length} connections`);
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
