import { create } from 'zustand';
import { useSettingsStore } from './settingsStore';
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
  packetSource?: 'real' | 'simulated' | string;
  packetColor?: string;
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
  packetSource?: 'real' | 'simulated' | string;
  packetColor?: string;
  srcPort?: number;
  dstPort?: number;
}

interface NetworkState {
  nodes: Node[];
  connections: Connection[];
  addOrUpdateNode: (node: Node) => void;
  addOrUpdateConnection: (connection: Connection) => void;
  updateNodeActivity: (nodeId: string, port?: number) => void;
  removeNode: (id: string) => void;
  removeConnection: (id: string) => void;
  clearNetwork: () => void;
  // Legacy API
  addNode: (id: string, data?: Partial<Node>) => void;
  addConnection: (connection: Partial<Connection>) => void;
}

// Create store with simple, direct updates
export const useNetworkStore = create<NetworkState>((set, get) => ({
  nodes: [],
  connections: [],

  // Add or update a node - NO THROTTLING to prevent dropped updates
  addOrUpdateNode: (node: Node) => {
    set((state) => {
      const existingIndex = state.nodes.findIndex(n => n.id === node.id);

      if (existingIndex !== -1) {
        // Update existing node
        const updatedNodes = [...state.nodes];
        const existing = updatedNodes[existingIndex];
        const mergedPorts = new Set([...(existing.ports || []), ...(node.ports || [])]);
        updatedNodes[existingIndex] = { ...existing, ...node, ports: mergedPorts };
        return { nodes: updatedNodes };
      } else {
        // Add new node, prune if over limit
        const maxNodes = useSettingsStore.getState().maxNodes;
        let newNodes = [...state.nodes, { ...node, ports: new Set(node.ports || []) }];

        if (newNodes.length > maxNodes) {
          // Sort by lastActive, keep newest
          newNodes.sort((a, b) => b.lastActive - a.lastActive);
          newNodes = newNodes.slice(0, maxNodes);
        }

        return { nodes: newNodes };
      }
    });
  },

  // Add or update a connection - NO THROTTLING
  addOrUpdateConnection: (connection: Connection) => {
    set((state) => {
      const existingIndex = state.connections.findIndex(c => c.id === connection.id);

      if (existingIndex !== -1) {
        // Update existing connection
        const updatedConnections = [...state.connections];
        const existing = updatedConnections[existingIndex];
        updatedConnections[existingIndex] = {
          ...existing,
          ...connection,
          srcPort: connection.srcPort || existing.srcPort,
          dstPort: connection.dstPort || existing.dstPort,
        };
        return { connections: updatedConnections };
      } else {
        // Add new connection, prune if over limit
        const maxConnections = useSettingsStore.getState().maxNodes * 3;
        let newConnections = [...state.connections, connection];

        if (newConnections.length > maxConnections) {
          // Sort by lastActive, keep newest
          newConnections.sort((a, b) => b.lastActive - a.lastActive);
          newConnections = newConnections.slice(0, maxConnections);
        }

        return { connections: newConnections };
      }
    });
  },

  // Update node activity timestamp
  updateNodeActivity: (nodeId: string, port?: number) => {
    const now = Date.now();
    set((state) => {
      const nodeIndex = state.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex === -1) return state;

      const updatedNodes = [...state.nodes];
      const node = updatedNodes[nodeIndex];
      const updatedPorts = new Set(node.ports);
      if (port) updatedPorts.add(port);

      updatedNodes[nodeIndex] = { ...node, lastActive: now, ports: updatedPorts };
      return { nodes: updatedNodes };
    });
  },

  // Remove a node and its connections
  removeNode: (id: string) => {
    set((state) => ({
      nodes: state.nodes.filter(n => n.id !== id),
      connections: state.connections.filter(c => c.source !== id && c.target !== id),
    }));
  },

  // Remove a connection
  removeConnection: (id: string) => {
    set((state) => ({
      connections: state.connections.filter(c => c.id !== id),
    }));
  },

  // Clear all
  clearNetwork: () => {
    set({ nodes: [], connections: [] });
  },

  // Legacy API compatibility
  addNode: (id: string, data: Partial<Node> = {}) => {
    const node: Node = {
      id,
      ...data,
      lastActive: Date.now(),
      ports: new Set(),
    };
    get().addOrUpdateNode(node);
  },

  addConnection: (connection: Partial<Connection>) => {
    if (!connection.id || !connection.source || !connection.target) {
      logger.error('Connection missing required fields:', connection);
      return;
    }

    const fullConnection: Connection = {
      ...connection as Connection,
      lastActive: Date.now(),
    };
    get().addOrUpdateConnection(fullConnection);
  },
}));
