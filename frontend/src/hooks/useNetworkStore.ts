import { create } from 'zustand'

// Types
export interface Node {
  id: string;
  label?: string;
  x: number;
  y: number;
  size?: number;
  color?: number;
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  protocol: string;
  size: number;
  timestamp: number;
}

interface NetworkState {
  nodes: Node[];
  connections: Connection[];
  addNode: (id: string, node?: Partial<Node>) => void;
  addConnection: (connection: Connection) => void;
  updateNodePosition: (id: string, x: number, y: number) => void;
  clearNetwork: () => void;
}

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
  addNode: (id, nodeProps = {}) => {
    set((state) => {
      // Check if the node already exists
      const existingNodeIndex = state.nodes.findIndex(node => node.id === id)
      
      if (existingNodeIndex >= 0) {
        // Update existing node
        const updatedNodes = [...state.nodes]
        updatedNodes[existingNodeIndex] = {
          ...updatedNodes[existingNodeIndex],
          ...nodeProps,
        }
        
        console.log(`Updated node ${id} at position (${updatedNodes[existingNodeIndex].x}, ${updatedNodes[existingNodeIndex].y})`)
        return { nodes: updatedNodes }
      } else {
        // Create a new node with random position if not specified
        const { x, y } = getRandomPosition()
        const newNode: Node = {
          id,
          x: nodeProps.x !== undefined ? nodeProps.x : x,
          y: nodeProps.y !== undefined ? nodeProps.y : y,
          size: nodeProps.size || 15, // Make nodes slightly larger by default
          ...nodeProps,
        }
        
        console.log(`Created new node ${id} at position (${newNode.x}, ${newNode.y})`)
        return { nodes: [...state.nodes, newNode] }
      }
    })
  },
  
  // Add a connection between nodes
  addConnection: (connection) => {
    set((state) => {
      // Prevent duplicate connections with the same ID
      if (state.connections.some(c => c.id === connection.id)) {
        return { connections: state.connections }
      }
      
      // Get the current set of nodes
      const currentNodes = get().nodes
      
      // Check if source and target nodes exist
      const sourceExists = currentNodes.some(n => n.id === connection.source)
      const targetExists = currentNodes.some(n => n.id === connection.target)
      
      if (!sourceExists || !targetExists) {
        console.warn(`Cannot add connection between ${connection.source} and ${connection.target}, one or both nodes don't exist.`)
      }
      
      // Limit the number of connections (keep latest 100)
      const updatedConnections = [...state.connections, connection]
      if (updatedConnections.length > 100) {
        updatedConnections.shift() // Remove oldest
      }
      
      console.log(`Added connection from ${connection.source} to ${connection.target} (protocol: ${connection.protocol})`)
      return { connections: updatedConnections }
    })
  },
  
  // Update node position
  updateNodePosition: (id, x, y) => {
    set((state) => {
      const nodeIndex = state.nodes.findIndex(node => node.id === id)
      
      if (nodeIndex >= 0) {
        const updatedNodes = [...state.nodes]
        updatedNodes[nodeIndex] = {
          ...updatedNodes[nodeIndex],
          x,
          y,
        }
        console.log(`Updated node ${id} position to (${x}, ${y})`)
        return { nodes: updatedNodes }
      }
      
      return state
    })
  },
  
  // Clear all nodes and connections
  clearNetwork: () => {
    console.log("Clearing network data")
    set({ nodes: [], connections: [] })
  },
})) 