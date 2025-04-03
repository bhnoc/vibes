import { create } from 'zustand';

// Types
export interface Node {
  id: string;
  label?: string;
  x?: number;
  y?: number;
  size?: number;
  color?: number;
  highlighted?: boolean;
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  protocol: string;
  size: number;
  timestamp: number;
  packetSource?: 'real' | 'simulated' | string // For identifying real vs simulated packets
}

interface NetworkState {
  nodes: Node[];
  connections: Connection[];
  addNode: (id: string, node: Partial<Node>) => void;
  updateNode: (id: string, updates: Partial<Node>) => void;
  addConnection: (connection: Connection) => void;
  removeOldConnections: (maxAge: number) => void;
  limitNetworkSize: (maxNodes: number, maxConnections: number) => void;
  clearNetwork: () => void;
}

// Add these constants at the top
const MAX_NODES = 50;  // Maximum number of nodes to display
const MAX_CONNECTIONS = 100;  // Maximum number of connections to display

// Helper function to get a random position
const getRandomPosition = () => {
  // Ensure we use a good portion of the screen
  const width = Math.max(window.innerWidth, 800);
  const height = Math.max(window.innerHeight, 600);
  
  // Position nodes within 10%-90% of the screen area
  return {
    x: Math.random() * (width * 0.8) + (width * 0.1),
    y: Math.random() * (height * 0.8) + (height * 0.1),
  }
}

// Create store
export const useNetworkStore = create<NetworkState>((set, get) => ({
  nodes: [],
  connections: [],
  
  // Add or update a node
  addNode: (id, nodeData) => set((state) => {
    // Check if the node already exists
    const existingNodeIndex = state.nodes.findIndex(node => node.id === id)
    
    if (existingNodeIndex >= 0) {
      // Update existing node
      const updatedNodes = [...state.nodes]
      updatedNodes[existingNodeIndex] = {
        ...updatedNodes[existingNodeIndex],
        ...nodeData,
      }
      
      console.log(`Updated node ${id} at position (${updatedNodes[existingNodeIndex].x}, ${updatedNodes[existingNodeIndex].y})`)
      return { nodes: updatedNodes }
    } else {
      // Create a new node with random position if not specified
      const { x, y } = nodeData.x !== undefined && nodeData.y !== undefined 
        ? { x: nodeData.x, y: nodeData.y }
        : getRandomPosition();
      
      const newNode: Node = {
        id,
        label: nodeData.label || id,
        x,
        y,
        size: nodeData.size || 15, // Make nodes slightly larger by default
        color: nodeData.color || 0x00ff41,
        highlighted: nodeData.highlighted || false
      };
      
      // Enforce maximum nodes limit - remove oldest if over limit
      const maxNodes = 100; // Maximum number of nodes to keep
      let updatedNodes = [...state.nodes, newNode];
      if (updatedNodes.length > maxNodes) {
        updatedNodes = updatedNodes.slice(-maxNodes);
      }
      
      console.log(`Created new node ${id} at position (${newNode.x}, ${newNode.y})`)
      return { nodes: updatedNodes }
    }
  }),
  
  // Update node position
  updateNode: (id, updates) => set((state) => {
    const nodeIndex = state.nodes.findIndex(node => node.id === id)
    
    if (nodeIndex >= 0) {
      const updatedNodes = [...state.nodes]
      updatedNodes[nodeIndex] = {
        ...updatedNodes[nodeIndex],
        ...updates,
      }
      console.log(`Updated node ${id} position to (${updates.x}, ${updates.y})`)
      return { nodes: updatedNodes }
    }
    
    return state
  }),
  
  // Add a connection between nodes
  addConnection: (connection) => set((state) => {
    // Prevent duplicates with same source, target and timestamp
    const exists = state.connections.some(
      c => c.source === connection.source && 
           c.target === connection.target && 
           Math.abs(c.timestamp - connection.timestamp) < 1 // Within 1 second
    );
    
    if (exists) return state;
    
    // Limit connections to most recent to prevent memory issues
    const maxConnections = 200; // Maximum connections to keep
    const updatedConnections = [...state.connections, connection];
    
    if (updatedConnections.length > maxConnections) {
      return { connections: updatedConnections.slice(-maxConnections) };
    }
    
    console.log(`Added connection from ${connection.source} to ${connection.target} (protocol: ${connection.protocol})`)
    return { connections: updatedConnections };
  }),
  
  // Remove old connections
  removeOldConnections: (maxAge) => set((state) => {
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const updatedConnections = state.connections.filter(c => {
      return now - c.timestamp < maxAge;
    });
    
    return { connections: updatedConnections };
  }),
  
  // Limit network size
  limitNetworkSize: (maxNodes, maxConnections) => set((state) => {
    let updated = false;
    let nodes = state.nodes;
    let connections = state.connections;
    
    // Trim nodes if over limit
    if (nodes.length > maxNodes) {
      nodes = nodes.slice(-maxNodes);
      updated = true;
    }
    
    // Trim connections if over limit
    if (connections.length > maxConnections) {
      connections = connections.slice(-maxConnections);
      updated = true;
    }
    
    if (updated) {
      return { nodes, connections };
    }
    
    return state;
  }),
  
  // Clear all nodes and connections
  clearNetwork: () => {
    console.log("Clearing network data")
    set({ nodes: [], connections: [] })
  },
})) 