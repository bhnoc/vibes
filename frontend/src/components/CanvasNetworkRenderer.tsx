import React, { useEffect, useRef, useCallback, useMemo } from 'react'
import { useNetworkStore } from '../stores/networkStore'
import { useSizeStore } from '../stores/sizeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { usePhysicsStore } from '../stores/physicsStore'
import { usePinStore } from '../stores/pinStore'
import { logger } from '../utils/logger'

// Color utility functions for enhanced node coloring
function hexToRgb(hex: string): {r: number, g: number, b: number} | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360;
  s /= 100;
  l /= 100;
  
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  
  if (0 <= h && h < 1/6) {
    r = c; g = x; b = 0;
  } else if (1/6 <= h && h < 2/6) {
    r = x; g = c; b = 0;
  } else if (2/6 <= h && h < 3/6) {
    r = 0; g = c; b = x;
  } else if (3/6 <= h && h < 4/6) {
    r = 0; g = x; b = c;
  } else if (4/6 <= h && h < 5/6) {
    r = x; g = 0; b = c;
  } else if (5/6 <= h && h < 1) {
    r = c; g = 0; b = x;
  }
  
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  
  return rgbToHex(r, g, b);
}

function getProtocolColor(protocol?: string): string {
  if (!protocol) return '#CCCCCC'; // Default color for unknown protocols

  switch (protocol.toLowerCase()) {
    case 'tcp':
      return '#00FF00'; // Green
    case 'udp':
      return '#FF00FF'; // Magenta
    case 'icmp':
      return '#00FFFF'; // Cyan
    case 'http':
    case 'https':
      return '#FFA500'; // Orange
    default:
      return '#FFFFFF'; // White for other protocols
  }
}

function lerp(start: number, end: number, amt: number): number {
  return (1 - amt) * start + amt * end
}


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
  
  return hslToHex(h, s, l);
}

// Types for our renderer
interface RenderedNode {
  id: string
  x: number
  y: number
  vx: number // Velocity X
  vy: number // Velocity Y
  radius: number
  color: string
  highlightColor: string
  alpha: number
  lastActive: number
}

interface RenderedConnection {
  alpha: number
  color: string
  protocol?: string
  dstPort?: number
  lastActive: number
  sourceId: string
  targetId: string
}

interface Viewport {
  x: number
  y: number
  zoom: number
  width: number
  height: number
}

// Object pool for performance
class ObjectPool<T> {
  private pool: T[] = []
  private createFn: () => T
  private resetFn: (obj: T) => void

  constructor(createFn: () => T, resetFn: (obj: T) => void, initialSize = 100) {
    this.createFn = createFn
    this.resetFn = resetFn
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(createFn())
    }
  }

  acquire(): T {
    return this.pool.pop() || this.createFn()
  }

  release(obj: T): void {
    this.resetFn(obj)
    this.pool.push(obj)
  }
}

// High-performance Canvas Network Renderer
export const CanvasNetworkRenderer: React.FC = React.memo(() => {

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const lastFrameTime = useRef<number>(0)
  const fpsRef = useRef<number>(0)
  const frameCount = useRef<number>(0)
  const lastLogTime = useRef<number>(0)
  
  // Viewport state
  const viewportRef = useRef<Viewport>({
    x: 0,
    y: 0,
    zoom: 1.0, 
    width: 0,
    height: 0
  })

  // Store hooks
  const { height, width } = useSizeStore()
  const { verboseLogging } = useSettingsStore()
  const { isPined } = usePinStore()
  const { nodeSpacing } = usePhysicsStore()
  const {
    connectionPullStrength,
    collisionRepulsion,
    damping,
    connectionLifetime,
    driftAwayStrength,
  } = usePhysicsStore()

  const pinnedNodePositions = useRef<Map<string, {x: number, y: number}>>(new Map());
  const PINNED_PULL_SCALING = 0.0005;

  // Stable refs — keep latest values without making render/physics deps churn
  const connectionLifetimeRef = useRef(connectionLifetime)
  const isPinedRef = useRef(isPined)
  const updatePhysicsRef = useRef<(dt: number) => void>(() => {})
  useEffect(() => { connectionLifetimeRef.current = connectionLifetime }, [connectionLifetime])
  useEffect(() => { isPinedRef.current = isPined }, [isPined])


  // Object pools
  const nodePool = useMemo(() => new ObjectPool<RenderedNode>(
    () => ({ id: '', x: 0, y: 0, vx: 0, vy: 0, radius: 0, color: '', highlightColor: '', alpha: 0, lastActive: 0 }),
    (node) => { node.id = ''; node.alpha = 0; node.lastActive = 0; }
  ), [])

  const connectionPool = useMemo(() => new ObjectPool<RenderedConnection>(
    () => ({ alpha: 0, color: '', protocol: '', dstPort: 0, lastActive: 0, sourceId: '', targetId: '' }),
    (conn) => { conn.alpha = 0; conn.lastActive = 0; conn.color = ''; conn.protocol = ''; conn.dstPort = 0; conn.sourceId = ''; conn.targetId = '' }
  ), [])

  // Active rendered objects
  const activeNodes = useRef<Map<string, RenderedNode>>(new Map())
  const activeConnections = useRef<RenderedConnection[]>([])
  const nodePositions = useRef<Map<string, {x: number, y: number}>>(new Map())



  // Update viewport size and center it
  useEffect(() => {
    if (canvasRef.current && width && height) {
      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;

      // Set actual size
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // Update viewport dimensions - 4x screen size for massive buffer space when zooming out
      const oldWidth = viewportRef.current.width;
      const oldHeight = viewportRef.current.height;
      viewportRef.current.width = width * 4;
      viewportRef.current.height = height * 4;

      // Clear position cache if viewport dimensions changed (forces regeneration with new dimensions)
      if (oldWidth !== viewportRef.current.width || oldHeight !== viewportRef.current.height) {
        nodePositions.current.clear();
        logger.log(`🔄 Cleared position cache due to viewport resize: ${oldWidth}x${oldHeight} -> ${viewportRef.current.width}x${viewportRef.current.height}`);
      }

      // Center the viewport only on the initial load
      // Position viewport so visible screen shows the center of the viewport
      if (viewportRef.current.x === 0 && viewportRef.current.y === 0) {
        const vpCenterX = viewportRef.current.width / 2;
        const vpCenterY = viewportRef.current.height / 2;
        // Account for zoom when centering (viewport.x defines world coords at screen's top-left)
        viewportRef.current.x = vpCenterX - (width / 2) / viewportRef.current.zoom;
        viewportRef.current.y = vpCenterY - (height / 2) / viewportRef.current.zoom;
        logger.log(`🎯 Initial viewport centered at (${Math.round(vpCenterX)}, ${Math.round(vpCenterY)})`);
      }
      
      // Scale context for high DPI
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    }
  }, [width, height]);

  // Viewport culling - only render visible objects
  const isInViewport = useCallback((x: number, y: number, radius = 10): boolean => {
    const vp = viewportRef.current
    const margin = radius * 2
    
    return (
      x >= vp.x - margin && 
      x <= vp.x + vp.width / vp.zoom + margin &&
      y >= vp.y - margin && 
      y <= vp.y + vp.height / vp.zoom + margin
    )
  }, [])

  // Generate stable positions for nodes based on IP address
  const generatePosition = useCallback((nodeId: string): {x: number, y: number} => {
    if (nodePositions.current.has(nodeId)) {
      return nodePositions.current.get(nodeId)!
    }

    // Get viewport dimensions for dynamic positioning
    const vpWidth = viewportRef.current.width
    const vpHeight = viewportRef.current.height
    const centerX = vpWidth / 2
    const centerY = vpHeight / 2

    // IP-based positioning for network topology visualization
    if (nodeId.includes('.')) {
      // Parse IP address for intelligent positioning
      const parts = nodeId.split('.').map(Number)
      if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
        // Much more spread out positioning based on IP structure
        const firstOctet = parts[0]
        const secondOctet = parts[1]
        const thirdOctet = parts[2]
        const fourthOctet = parts[3]

        // Create major regions based on first octet (10.x, 172.x, 192.x, etc.)
        // Position as percentage of viewport dimensions (0.0 = left/top edge, 1.0 = right/bottom edge)
        let baseX = 0.5  // Start at center
        let baseY = 0.5  // Start at center

        if (firstOctet === 192) {
          // 192.168.x -> center-left quadrant
          baseX = 0.35 + (secondOctet / 256) * 0.2  // 35-55% horizontally
          baseY = 0.40 + (secondOctet % 32) / 32 * 0.3  // 40-70% vertically
        } else if (firstOctet === 10) {
          // 10.x.x -> center-right quadrant
          baseX = 0.60 + (secondOctet % 128) / 128 * 0.25  // 60-85% horizontally
          baseY = 0.45 + (secondOctet / 256) * 0.3  // 45-75% vertically
        } else if (firstOctet === 172) {
          // 172.16-31.x -> upper-right area
          baseX = 0.65 + ((secondOctet - 16) / 16) * 0.2  // 65-85% horizontally
          baseY = 0.25 + ((secondOctet - 16) % 16) / 16 * 0.25  // 25-50% vertically
        } else {
          // Other ranges spread across different areas
          baseX = 0.20 + (firstOctet % 20) / 20 * 0.6  // 20-80% horizontally
          baseY = 0.20 + (firstOctet % 16) / 16 * 0.6  // 20-80% vertically
        }

        // Convert percentage to actual coordinates
        let regionX = vpWidth * baseX
        let regionY = vpHeight * baseY

        // Add variation based on 3rd and 4th octets (smaller jitter)
        const spreadX = ((thirdOctet - 128) * (vpWidth * 0.001)) + ((fourthOctet - 128) * (vpWidth * 0.0005))
        const spreadY = ((fourthOctet - 128) * (vpHeight * 0.001)) + ((thirdOctet - 128) * (vpHeight * 0.0005))

        // Final position with bounds checking - keep within 90% of viewport
        const margin = vpWidth * 0.05
        const x = Math.max(margin, Math.min(vpWidth - margin, regionX + spreadX))
        const y = Math.max(margin, Math.min(vpHeight - margin, regionY + spreadY))

        // Debug: Log positioning details for first few nodes
        if (Math.random() < 0.05) {  // 5% sampling
          logger.log(`📍 IP ${nodeId}: base=(${(baseX*100).toFixed(1)}%, ${(baseY*100).toFixed(1)}%), final=(${x.toFixed(0)}, ${y.toFixed(0)}) in viewport ${vpWidth.toFixed(0)}x${vpHeight.toFixed(0)}`)
        }

        const position = { x, y }
        nodePositions.current.set(nodeId, position)
        return position
      }
    }

    // Fallback to hash-based positioning for non-IP nodes
    let hash = 0
    for (let i = 0; i < nodeId.length; i++) {
      const char = nodeId.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }

    // Position using hash, spread across viewport (10-90% range for both X and Y)
    const baseX = 0.1 + (Math.abs(hash) % 1000) / 1000 * 0.8  // 10-90% horizontally
    const baseY = 0.1 + (Math.abs(hash >> 10) % 1000) / 1000 * 0.8  // 10-90% vertically
    const x = vpWidth * baseX
    const y = vpHeight * baseY

    const position = { x, y }
    nodePositions.current.set(nodeId, position)
    return position
  }, [])

  // Update rendered objects from store data — reads store directly to avoid
  // being recreated on every packet (which would reset the 100ms interval).
  const updateRenderObjects = useCallback(() => {
    const { nodes: storeNodes, connections: storeConnections } = useNetworkStore.getState();
    const now = Date.now()
    const activeAge = 30000

    const storeNodesById = new Map(storeNodes.map(n => [n.id, n]));
    const currentRenderedNodeIds = new Set(activeNodes.current.keys());

    // Remove nodes that are no longer in the store
    for (const nodeId of currentRenderedNodeIds) {
      if (!storeNodesById.has(nodeId)) {
        const nodeToRelease = activeNodes.current.get(nodeId);
        if (nodeToRelease) nodePool.release(nodeToRelease);
        activeNodes.current.delete(nodeId);
      }
    }

    // Add new nodes or update existing ones
    storeNodesById.forEach((node, nodeId) => {
      const existingNode = activeNodes.current.get(nodeId);
      if (existingNode) {
        existingNode.lastActive = node.lastActive;
        existingNode.radius = (now - node.lastActive) < activeAge ? 10 : 6;
        // Re-place if stuck at origin — can happen if viewport wasn't ready on first sync
        if (existingNode.x === 0 && existingNode.y === 0 && node.x) {
          existingNode.x = node.x
          existingNode.y = node.y ?? 0
        }
      } else {
        // Prefer store coords (set by packet processor using window dimensions).
        // Fall back to generatePosition only if store coords are absent or zero.
        const hasStorePos = node.x !== undefined && node.y !== undefined && (node.x !== 0 || node.y !== 0)
        const position = hasStorePos ? { x: node.x!, y: node.y! } : generatePosition(node.id)
        const renderedNode = nodePool.acquire();
        renderedNode.id = node.id;
        renderedNode.x = position.x;
        renderedNode.y = position.y;
        renderedNode.vx = 0;
        renderedNode.vy = 0;
        renderedNode.lastActive = node.lastActive;
        const age = now - node.lastActive;

        const latestConnection = storeConnections
          .filter(c => c.source === node.id || c.target === node.id)
          .sort((a, b) => b.lastActive - a.lastActive)[0];
        renderedNode.color = getProtocolColor(latestConnection?.protocol);

        let highlightColor = '#00ff41';
        if (node.id.includes('.')) {
          const parts = node.id.split('.').map(Number);
          if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
            const [firstOctet] = parts;
            if (firstOctet === 192)      highlightColor = '#0080ff';
            else if (firstOctet === 10)  highlightColor = '#ff00ff';
            else if (firstOctet === 172) highlightColor = '#ff4500';
            else if (firstOctet === 8 || firstOctet === 1) highlightColor = '#ffff00';
          }
        } else {
          let hash = 0;
          for (let i = 0; i < node.id.length; i++) {
            hash = ((hash << 5) - hash) + node.id.charCodeAt(i);
            hash = hash & hash;
          }
          highlightColor = hslToHex(Math.abs(hash) % 360, 90, 60);
        }

        renderedNode.highlightColor = highlightColor;
        renderedNode.alpha = Math.max(0.4, 1 - (age / 600000));
        activeNodes.current.set(nodeId, renderedNode);
      }
    });

    // Process connections — only active ones where both nodes exist in renderer
    const nodeIds = new Set(activeNodes.current.keys())
    const recentConnections = storeConnections
      .filter(conn => {
        const isActive = now - conn.lastActive < connectionLifetime;
        const bothNodesExist = nodeIds.has(conn.source) && nodeIds.has(conn.target);
        return isActive && bothNodesExist;
      })
      .slice(0, 5000)

    activeConnections.current.forEach(c => connectionPool.release(c));
    activeConnections.current.length = 0;

    recentConnections.forEach(conn => {
      const sourceNode = activeNodes.current.get(conn.source)
      const targetNode = activeNodes.current.get(conn.target)
      if (sourceNode && targetNode) {
        const renderedConn = connectionPool.acquire()
        renderedConn.color = conn.packetColor || getPacketColor(conn.source, conn.target, conn.protocol)
        renderedConn.protocol = conn.protocol
        renderedConn.dstPort = conn.dstPort;
        renderedConn.alpha = Math.max(0, 1 - ((now - conn.lastActive) / connectionLifetime))
        renderedConn.lastActive = conn.lastActive
        renderedConn.sourceId = conn.source
        renderedConn.targetId = conn.target
        activeConnections.current.push(renderedConn)
      }
    })

  }, [generatePosition, nodePool, connectionPool, connectionLifetime])

  const updatePhysics = useCallback((deltaTime: number) => {
    if (!width || !height) return;

    // --- Physics Constants ---
    const PULL_SCALING = 0.001;
    const REPULSION_SCALING = 0.03;
    const CENTER_PULL_STRENGTH = 0.0001; // Increased 500x to actually pull nodes toward center!

    // Node lifetime should match connection lifetime from physics slider
    // A node should remain visible as long as its connections are active
    const NODE_INACTIVITY_REMOVAL_MS = connectionLifetime; // Use same as connection lifetime
    const NODE_INACTIVITY_FADE_START_MS = connectionLifetime * 0.5; // Start fading halfway through

    // Debug log to verify connection lifetime is being used (log every 5 seconds)
    if (Date.now() - lastLogTime.current > 5000) {
      logger.log(`🕐 Node/Connection lifetime set to ${connectionLifetime}ms from physics slider`)
      lastLogTime.current = Date.now()
    }

    const now = Date.now();
    const centerX = viewportRef.current.width / 2;
    const centerY = viewportRef.current.height / 2;
    const nodesToRemove: string[] = [];
    // Dynamic margin based on viewport size (10% buffer)
    const offscreenMargin = Math.max(viewportRef.current.width, viewportRef.current.height) * 0.1;

    // Read connections fresh from store — avoids this callback being in the dep array
    // and thus avoids cancelling the animation loop on every incoming packet.
    const storeConns = useNetworkStore.getState().connections;
    const connectedNodeIds = new Set<string>();
    let activeConns = 0;
    let expiredConns = 0;
    storeConns.forEach(conn => {
      if (now - conn.lastActive < connectionLifetime) {
        connectedNodeIds.add(conn.source);
        connectedNodeIds.add(conn.target);
        activeConns++;
      } else {
        expiredConns++;
      }
    });

    // Debug logging every 2 seconds
    if (now - lastLogTime.current > 2000) {
      logger.log(`🔗 Connections: ${storeConns.length} total, ${activeConns} active (<${connectionLifetime}ms), ${expiredConns} expired, ${connectedNodeIds.size} connected nodes`);
    }

    // --- Pinned Node Positioning (Bottom of Screen) ---
    const renderedNodes = Array.from(activeNodes.current.values());
    const pinnedNodes = renderedNodes.filter(node => isPined(node.id));
    const sortedPinnedNodes = pinnedNodes.sort((a, b) => a.id.localeCompare(b.id));
    
    const NODES_PER_ROW = 20; // Max nodes per row at the bottom
    const ROW_SPACING_Y = 60;
    const NODE_SPACING_X = 100;
    const bottomMargin = 60;

    sortedPinnedNodes.forEach((node, index) => {
      const row = Math.floor(index / NODES_PER_ROW);
      const colIndex = index % NODES_PER_ROW;
      
      const x = 100 + (colIndex * NODE_SPACING_X);
      const y = viewportRef.current.height - bottomMargin - (row * ROW_SPACING_Y);

      pinnedNodePositions.current.set(node.id, { x, y });
    });


    // --- Apply Forces ---
    activeNodes.current.forEach(node => {
      if (isPined(node.id)) {
        const pos = pinnedNodePositions.current.get(node.id);
        if (pos) {
          node.x = pos.x;
          node.y = pos.y;
          node.vx = 0;
          node.vy = 0;
        }
        return; // Skip other physics for pinned nodes
      }

      const timeSinceActive = now - node.lastActive;

      // 1. Handle inactive nodes (fading, drifting, removal)
      // DISABLED FOR TESTING - Suspected to be causing issues
      if (false && timeSinceActive > NODE_INACTIVITY_REMOVAL_MS) {
        nodesToRemove.push(node.id);
        return;
      }

      // DISABLED FOR TESTING - Suspected to be causing issues
      const isOffscreen = false && (
        node.x < -offscreenMargin ||
        node.x > viewportRef.current.width + offscreenMargin ||
        node.y < -offscreenMargin ||
        node.y > viewportRef.current.height + offscreenMargin);

      if (isOffscreen) {
        nodesToRemove.push(node.id);
        return;
      }

      const isConnected = connectedNodeIds.has(node.id);
      const isInactive = timeSinceActive > NODE_INACTIVITY_FADE_START_MS;

      // Apply forces based on connection status
      if (isConnected) {
        // Connected nodes: pull toward center to keep them grouped
        const dx_center = centerX - node.x;
        const dy_center = centerY - node.y;
        node.vx += dx_center * CENTER_PULL_STRENGTH * deltaTime;
        node.vy += dy_center * CENTER_PULL_STRENGTH * deltaTime;
      } else {
        // Unconnected nodes: drift away from center
        const driftForce = driftAwayStrength * 0.00008; // Increased force
        const dx = node.x - centerX;
        const dy = node.y - centerY;
        node.vx += dx * driftForce * deltaTime;
        node.vy += dy * driftForce * deltaTime;
      }

      // Handle fading for inactive (and unconnected) nodes
      if (isInactive) {
        const fadeDuration = NODE_INACTIVITY_REMOVAL_MS - NODE_INACTIVITY_FADE_START_MS;
        const timeIntoFade = timeSinceActive - NODE_INACTIVITY_FADE_START_MS;
        const fadeProgress = Math.min(1, timeIntoFade / fadeDuration);
        node.alpha = 1 - fadeProgress;
      } else {
        node.alpha = 1; // Instantly restore alpha if it becomes active again
      }
    });

    // 2. Collision detection and resolution — skip when node count is high
    // O(n²) becomes too expensive above ~150 nodes; center pull + spawn placement
    // keeps things readable without per-frame collision at larger scales.
    const MAX_COLLISION_NODES = 150;
    const nodes = Array.from(activeNodes.current.values());
    if (nodes.length <= MAX_COLLISION_NODES) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeA = nodes[i];
          const nodeB = nodes[j];
          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const minDistance = nodeA.radius + nodeB.radius + nodeSpacing;

          if (distance < minDistance && distance > 0) {
            const overlap = minDistance - distance;
            const ax = dx / distance;
            const ay = dy / distance;

            const repulsionForce = collisionRepulsion * REPULSION_SCALING;
            nodeA.vx -= ax * overlap * repulsionForce;
            nodeA.vy -= ay * overlap * repulsionForce;
            nodeB.vx += ax * overlap * repulsionForce;
            nodeB.vy += ay * overlap * repulsionForce;
          }
        }
      }
    }

    // 3. Connection-based forces
    activeConnections.current.forEach(conn => {
      if (now - conn.lastActive > connectionLifetime) {
        return; // Expired connections don't apply forces
      }
      const source = activeNodes.current.get(conn.sourceId);
      const target = activeNodes.current.get(conn.targetId);

      if (source && target) {
        const isSourcePinned = isPined(source.id);
        const isTargetPinned = isPined(target.id);
        const PULL_IN_SPEED = 0.08; // A slightly stronger pull

        if (isSourcePinned && !isTargetPinned) {
          // Pull target towards source
          target.x = lerp(target.x, source.x, PULL_IN_SPEED);
          target.y = lerp(target.y, source.y, PULL_IN_SPEED);
        } else if (!isSourcePinned && isTargetPinned) {
          // Pull source towards target
          source.x = lerp(source.x, target.x, PULL_IN_SPEED);
          source.y = lerp(source.y, target.y, PULL_IN_SPEED);
        } else if (isSourcePinned && isTargetPinned) {
            // Both are pinned, do nothing
        } else {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const restLength = 40;

          const displacement = distance - restLength;
          const pullForce = connectionPullStrength * PULL_SCALING;
          
          const forceMagnitude = displacement * pullForce * 0.1;
          
          const fx = (dx / distance) * forceMagnitude;
          const fy = (dy / distance) * forceMagnitude;

          source.vx += fx * deltaTime;
          source.vy += fy * deltaTime;
          target.vx -= fx * deltaTime;
          target.vy -= fy * deltaTime;
        }

        // Note: Center pull is now applied in the main node loop (line ~603)
        // to ensure ALL connected nodes get it, not just those in this frame's connection list
      }
    });

    // 4. Apply damping and update positions
    activeNodes.current.forEach(node => {
      node.vx *= damping;
      node.vy *= damping;

      node.x += node.vx * deltaTime;
      node.y += node.vy * deltaTime;
    });

    // Check for off-screen nodes and add to removal list
    // DISABLED FOR TESTING - Suspected to be causing issues
    if (false) {
      activeNodes.current.forEach(node => {
        if (isPined(node.id)) return; // Skip pinned nodes

        const isOffScreen =
          node.x < -offscreenMargin ||
          node.x > viewportRef.current.width + offscreenMargin ||
          node.y < -offscreenMargin ||
          node.y > viewportRef.current.height + offscreenMargin;

        if (isOffScreen) {
          nodesToRemove.push(node.id);
        }
      });
    }

    // Remove all nodes that need to be removed (inactive + off-screen)
    if (nodesToRemove.length > 0) {
      nodesToRemove.forEach(id => {
        const node = activeNodes.current.get(id);
        if (node) {
          nodePool.release(node);
          activeNodes.current.delete(id);
        }
      });
      // Also remove from store
      const removeFunc = useNetworkStore.getState().removeNode;
      nodesToRemove.forEach(id => removeFunc(id));
    }

  }, [width, height, nodeSpacing, connectionPullStrength, collisionRepulsion, damping, driftAwayStrength, isPined, connectionLifetime, nodePool]);

  // Keep ref fresh so render doesn't need updatePhysics as a dep
  useEffect(() => { updatePhysicsRef.current = updatePhysics }, [updatePhysics])

  // High-performance render loop — deps are only width/height (resize events).
  // connectionLifetime and isPined are read via stable refs so the rAF loop
  // is never cancelled due to incoming packets or store updates.
  const render = useCallback((currentTime: number) => {
    const connectionLifetime = connectionLifetimeRef.current

    // FPS counter — must happen BEFORE updating lastFrameTime
    frameCount.current++
    if (currentTime - lastFrameTime.current >= 1000) {
      fpsRef.current = frameCount.current
      frameCount.current = 0
      lastFrameTime.current = currentTime
    }

    const deltaTime = Math.max(16, currentTime - lastFrameTime.current)
    lastFrameTime.current = currentTime

    // Update physics via ref — avoids dep on updatePhysics callback
    updatePhysicsRef.current(deltaTime);

    const canvas = canvasRef.current
    if (!canvas || !width || !height) return;

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Log dimensions every 2 seconds to avoid spamming the console
    if (currentTime - lastLogTime.current > 2000) {
      logger.log(`[Debug] Canvas dimensions received by renderer: width=${width} height=${height}`);
      lastLogTime.current = currentTime;
    }

    // Calculate FPS
    frameCount.current++
    if (currentTime - lastFrameTime.current >= 1000) {
      fpsRef.current = frameCount.current
      frameCount.current = 0
      lastFrameTime.current = currentTime
    }

    // Clear canvas using logical dimensions, as context is already scaled by DPR
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, width, height)
    
    // DEBUG: Draw a border to check canvas boundaries
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 1; // 1 logical pixel will be scaled by DPR
    ctx.strokeRect(0, 0, width, height);


    const vp = viewportRef.current

    // Save context and apply viewport transform
    ctx.save()
    ctx.translate(-vp.x * vp.zoom, -vp.y * vp.zoom)
    ctx.scale(vp.zoom, vp.zoom)

    // Render connections first (behind nodes) with protocol-based styling
    // Filter out connections where either node no longer exists
    // IMPORTANT: Don't mutate activeConnections.current - physics needs the full list!
    const connectionsToRender = activeConnections.current.filter(conn => {
      return activeNodes.current.has(conn.sourceId) && activeNodes.current.has(conn.targetId);
    });

    connectionsToRender.forEach(conn => {
      const source = activeNodes.current.get(conn.sourceId);
      const target = activeNodes.current.get(conn.targetId);

      if (!source || !target) return; // Extra safety check

      // Recalculate alpha in real-time based on current time for smooth fading
      const connectionAge = currentTime - conn.lastActive;
      const alpha = Math.max(0, Math.min(1, 1 - (connectionAge / connectionLifetime)));

      // Protocol-based colors and styles using stored protocol
      let strokeColor = `rgba(0, 255, 255, ${alpha})` // Default cyan
      let lineWidth = 1
      
      if (conn.protocol) {
        const protocol = conn.protocol.toLowerCase();
        // Debug log to see what protocols we're getting
        if (verboseLogging && Math.random() < 0.01) { // Log 1% of connections to avoid spam
          logger.log(`🎨 Connection protocol: ${protocol} for ${conn.sourceId} -> ${conn.targetId}`);
        }
        
        switch (protocol) {
          case 'tcp':
            strokeColor = `rgba(0, 255, 0, ${alpha})`; // Bright green for TCP
            lineWidth = 3; // Thicker line
            break;
          case 'udp':
            strokeColor = `rgba(255, 0, 255, ${alpha})`; // Bright magenta for UDP
            lineWidth = 2; // Medium line
            break;
          case 'icmp':
            strokeColor = `rgba(255, 255, 0, ${alpha})`; // Bright yellow for ICMP
            lineWidth = 2; // Medium line
            break;
          case 'http':
          case 'https':
            strokeColor = `rgba(255, 165, 0, ${alpha})`; // Orange for HTTP/HTTPS
            lineWidth = 2;
            break;
          default:
            strokeColor = `rgba(0, 255, 255, ${alpha})`; // Cyan for others
            lineWidth = 1;
            // Log unknown protocols
            if (verboseLogging && Math.random() < 0.05) {
              logger.log(`🔍 Unknown protocol: ${protocol}`);
            }
        }
      } else {
        // Debug: no protocol found
        if (verboseLogging && Math.random() < 0.01) {
          logger.log(`⚠️ No protocol found for connection ${conn.sourceId} -> ${conn.targetId}`);
        }
      }
      
      // Make very active connections more prominent regardless of protocol
      if (alpha > 0.8) {
        lineWidth += 1;
      }
      
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      ctx.moveTo(source.x, source.y)
      ctx.lineTo(target.x, target.y)
      ctx.stroke()
      
      // Add arrow indicator for direction and port/protocol info (if zoom is high enough)
      if (vp.zoom > 0.8) {
        const dx = target.x - source.x
        const dy = target.y - source.y
        const len = Math.sqrt(dx * dx + dy * dy)
        
        if (len > 20) {
          // Calculate midpoint for text
          const midX = source.x + dx * 0.5
          const midY = source.y + dy * 0.5
          
          // --- Draw Port and Protocol Text ---
          const protocolText = (conn.protocol?.toUpperCase() || '???');
          const portText = (conn.dstPort && conn.dstPort > 0) ? `:${conn.dstPort}` : '';
          const fullText = `${protocolText}${portText}`;
          
          ctx.font = `${Math.max(9, 11 * vp.zoom)}px monospace`;
          const textWidth = ctx.measureText(fullText).width;

          // Rotate context to draw text along the line
          ctx.save();
          ctx.translate(midX, midY);
          ctx.rotate(Math.atan2(dy, dx));
          
          // Add background for readability
          ctx.fillStyle = `rgba(0, 0, 0, 0.7)`;
          ctx.fillRect(-textWidth / 2 - 2, -6, textWidth + 4, 12);

          // Draw the text
          ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`; // Bright blue for port number
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(fullText, 0, 0);
          
          ctx.restore();
        }
      }
    })

    // Determine which nodes have active connections to render them on top
    const now = currentTime
    const nodesWithActiveConnections = new Set<string>()
    connectionsToRender.forEach(conn => {
      // An active connection is one that is still visible
      if (now - conn.lastActive < connectionLifetime) {
        nodesWithActiveConnections.add(conn.sourceId)
        nodesWithActiveConnections.add(conn.targetId)
      }
    })

    // Get nodes and sort them so active ones are drawn last (on top)
    const nodesToRender = Array.from(activeNodes.current.values())
    nodesToRender.sort((a, b) => {
      const aHasActiveConnection = nodesWithActiveConnections.has(a.id)
      const bHasActiveConnection = nodesWithActiveConnections.has(b.id)

      if (aHasActiveConnection && !bHasActiveConnection) return 1
      if (!aHasActiveConnection && bHasActiveConnection) return -1
      
      // If both have similar connection status, sort by recent activity
      return a.lastActive - b.lastActive
    })

    // Render nodes with enhanced IP address display
    nodesToRender.forEach(node => {
      // Use the enhanced node color system
      const protocolRgb = hexToRgb(node.color)
      const highlightRgb = hexToRgb(node.highlightColor)
      
      const [pr, pg, pb] = protocolRgb ? [protocolRgb.r, protocolRgb.g, protocolRgb.b] : [204, 204, 204] // fallback to gray
      const [hr, hg, hb] = highlightRgb ? [highlightRgb.r, highlightRgb.g, highlightRgb.b] : [0, 255, 65] // fallback to green

      // Draw main node circle with protocol color
      ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${node.alpha})`
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
      ctx.fill()

      if (isPinedRef.current(node.id)) {
        ctx.strokeStyle = '#FFFF00'; // Yellow highlight for pinned nodes
        ctx.lineWidth = 3;
        ctx.stroke();

        // Draw pin emoji in the center
        ctx.font = `${node.radius * 1.5}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📌', node.x, node.y);
      }
      
      // Add border for better visibility
      ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${node.alpha})`
      ctx.lineWidth = 1
      ctx.stroke()
      
      // Add glow effect for active nodes (larger radius = more active)
      if (node.radius > 7) {
        ctx.fillStyle = `rgba(${hr}, ${hg}, ${hb}, ${node.alpha * 0.3})`
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius * 1.5, 0, Math.PI * 2)
        ctx.fill()
      }
      
      // Draw IP address label for nodes (if zoom is high enough)
      if (vp.zoom > 0.75 && node.id.includes('.')) {
        ctx.fillStyle = `rgba(${hr}, ${hg}, ${hb}, ${node.alpha * 0.9})`
        ctx.font = `${Math.max(8, 10 * vp.zoom)}px monospace`
        ctx.textAlign = 'center'
        
        // Position text below the node
        const textY = node.y + node.radius + 15
        
        // For IP addresses, show short form if zoom is low
        let displayText = node.id
        if (vp.zoom < 1) {
          // Show only last two octets when zoomed out
          const parts = node.id.split('.')
          if (parts.length === 4) {
            displayText = `...${parts[2]}.${parts[3]}`
          }
        }
        
        // Draw text with background for better readability
        const textWidth = ctx.measureText(displayText).width
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.fillRect(node.x - textWidth/2 - 2, textY - 10, textWidth + 4, 12)
        
        ctx.fillStyle = `rgba(${hr}, ${hg}, ${hb}, ${node.alpha})`
        ctx.fillText(displayText, node.x, textY)
      }
    })
    
    ctx.textAlign = 'left' // Reset text alignment

    ctx.restore()

    // "Waiting" message — drawn after ctx.restore() so we're in screen space (DPR-scaled).
    // Use width/2, height/2 directly; world coords would be way off-screen here.
    if (activeNodes.current.size === 0) {
      ctx.fillStyle = '#888'
      ctx.font = '16px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Waiting for network activity...', width / 2, height / 2)
      ctx.textAlign = 'left'
    }

    // Always schedule the next frame — never halt the loop.
    // Stopping at 1fps when idle caused up to 1s of black screen when nodes arrive.
    animationRef.current = requestAnimationFrame(render)
  }, [width, height])

  // Mouse interaction for panning and zooming
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let isDragging = false
    let lastMouseX = 0
    let lastMouseY = 0

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true
      lastMouseX = e.clientX
      lastMouseY = e.clientY
      canvas.style.cursor = 'grabbing'
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return

      const deltaX = (e.clientX - lastMouseX) / viewportRef.current.zoom
      const deltaY = (e.clientY - lastMouseY) / viewportRef.current.zoom

      viewportRef.current.x -= deltaX
      viewportRef.current.y -= deltaY

      lastMouseX = e.clientX
      lastMouseY = e.clientY
    }

    const handleMouseUp = () => {
      isDragging = false
      canvas.style.cursor = 'grab'
    }

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.05, Math.min(5, viewportRef.current.zoom * zoomFactor))
      
      // Zoom towards mouse position
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      const worldX = (mouseX / viewportRef.current.zoom) + viewportRef.current.x
      const worldY = (mouseY / viewportRef.current.zoom) + viewportRef.current.y
      
      viewportRef.current.zoom = newZoom
      viewportRef.current.x = worldX - (mouseX / newZoom)
      viewportRef.current.y = worldY - (mouseY / newZoom)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Debug: Always log zoom keys to troubleshoot
      if (['+', '=', '-', '_'].includes(e.key) || e.code === 'Equal' || e.code === 'Minus') {
        console.log(`🎹 Zoom key pressed: ${e.key}, code: ${e.code}, shift: ${e.shiftKey}`)
      }

      if (e.key === 'r' || e.key === 'R') {
        // Reset view to show full network - center on viewport center with wide zoom
        const resetZoom = 0.25
        const vpCenterX = viewportRef.current.width / 2
        const vpCenterY = viewportRef.current.height / 2

        // Position viewport so the center of the viewport appears at the center of the screen
        viewportRef.current.x = vpCenterX - (width / 2) / resetZoom
        viewportRef.current.y = vpCenterY - (height / 2) / resetZoom
        viewportRef.current.zoom = resetZoom
        logger.log(`🔄 View reset: centered on (${Math.round(vpCenterX)}, ${Math.round(vpCenterY)}) with zoom ${resetZoom}x`)
      } else if (e.key === 'p' || e.key === 'P') {
        // Clear position cache to regenerate all node positions
        nodePositions.current.clear()
        // Force all RenderedNodes to regenerate positions
        activeNodes.current.forEach(node => {
          const newPos = generatePosition(node.id)
          node.x = newPos.x
          node.y = newPos.y
          node.vx = 0
          node.vy = 0
        })
        logger.log('🔄 Regenerated all node positions')
      } else if (e.key === '+' || e.key === '=' || (e.shiftKey && e.code === 'Equal')) {
        // Zoom in - handle both + and = keys, and Shift+= combo
        e.preventDefault()
        const zoomFactor = 1.1
        const newZoom = Math.max(0.05, Math.min(5, viewportRef.current.zoom * zoomFactor))

        // Zoom towards center of viewport
        const rect = canvas.getBoundingClientRect()
        const centerX = (rect.width / 2) / viewportRef.current.zoom + viewportRef.current.x
        const centerY = (rect.height / 2) / viewportRef.current.zoom + viewportRef.current.y

        viewportRef.current.zoom = newZoom
        viewportRef.current.x = centerX - (rect.width / 2) / newZoom
        viewportRef.current.y = centerY - (rect.height / 2) / newZoom
        logger.log(`🔍 Zoom in: ${newZoom.toFixed(2)}x`)
      } else if (e.key === '-' || e.key === '_' || e.code === 'Minus') {
        // Zoom out - handle both - and _ keys
        e.preventDefault()
        const zoomFactor = 0.9
        const newZoom = Math.max(0.05, Math.min(5, viewportRef.current.zoom * zoomFactor))

        // Zoom towards center of viewport
        const rect = canvas.getBoundingClientRect()
        const centerX = (rect.width / 2) / viewportRef.current.zoom + viewportRef.current.x
        const centerY = (rect.height / 2) / viewportRef.current.zoom + viewportRef.current.y

        viewportRef.current.zoom = newZoom
        viewportRef.current.x = centerX - (rect.width / 2) / newZoom
        viewportRef.current.y = centerY - (rect.height / 2) / newZoom
        logger.log(`🔍 Zoom out: ${newZoom.toFixed(2)}x`)
      }
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('mouseleave', handleMouseUp)
    canvas.addEventListener('wheel', handleWheel)
    document.addEventListener('keydown', handleKeyDown)
    canvas.style.cursor = 'grab'
    
    // Make canvas focusable for keyboard events
    canvas.tabIndex = 0
    canvas.focus()

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('mouseleave', handleMouseUp)
      canvas.removeEventListener('wheel', handleWheel)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Update render objects periodically - game loop style
  useEffect(() => {
    updateRenderObjects()

    // Update frequently like a game engine (every 100ms = 10 updates/sec)
    const interval = setInterval(updateRenderObjects, 100)
    return () => clearInterval(interval)
  }, [updateRenderObjects])

  // Start/stop render loop
  useEffect(() => {
    if (canvasRef.current) {
      animationRef.current = requestAnimationFrame(render)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [render])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        background: 'black'
      }}
    />
  )
})

CanvasNetworkRenderer.displayName = 'CanvasNetworkRenderer'
