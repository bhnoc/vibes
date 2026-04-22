import React, { useEffect, useRef, useCallback, useMemo } from 'react'
import { useNetworkStore } from '../stores/networkStore'
import { usePacketStore } from '../stores/packetStore'
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
  isDriftingAway: boolean // State for drifting behavior
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

  // Canvas dimensions — only store subscription the renderer needs.
  // React re-renders here on resize, which is rare and expected.
  const { height, width } = useSizeStore()

  // All other store values go into refs so store updates never trigger
  // React re-renders (which would recreate callbacks and destabilise the RAF loop).
  const physicsRef = useRef(usePhysicsStore.getState())
  const settingsRef = useRef(useSettingsStore.getState())

  useEffect(() => {
    physicsRef.current = usePhysicsStore.getState()
    const unsubPhysics = usePhysicsStore.subscribe(s => { physicsRef.current = s })
    const unsubSettings = useSettingsStore.subscribe(s => { settingsRef.current = s })
    return () => { unsubPhysics(); unsubSettings() }
  }, [])

  // Convenience destructures for the few callbacks that still need reactive deps
  // (canvas sizing effect). All game-loop callbacks read from physicsRef instead.
  const { nodeSpacing, connectionPullStrength, collisionRepulsion, damping,
          connectionLifetime, driftAwayStrength, centerPullStrength, springRestLength } = physicsRef.current

  const pinnedNodePositions = useRef<Map<string, {x: number, y: number}>>(new Map());
  const PINNED_PULL_SCALING = 0.0005;


  // Object pools
  const nodePool = useMemo(() => new ObjectPool<RenderedNode>(
    () => ({ id: '', x: 0, y: 0, vx: 0, vy: 0, radius: 0, color: '', highlightColor: '', alpha: 0, lastActive: 0, isDriftingAway: false }),
    (node) => { node.id = ''; node.alpha = 0; node.lastActive = 0; node.isDriftingAway = false; node.x = 0; node.y = 0; node.vx = 0; node.vy = 0; }
  ), [])

  const connectionPool = useMemo(() => new ObjectPool<RenderedConnection>(
    () => ({ alpha: 0, color: '', protocol: '', dstPort: 0, lastActive: 0, sourceId: '', targetId: '' }),
    (conn) => { conn.alpha = 0; conn.lastActive = 0; conn.color = ''; conn.protocol = ''; conn.dstPort = 0; conn.sourceId = ''; conn.targetId = '' }
  ), [])

  // Active rendered objects
  const activeNodes = useRef<Map<string, RenderedNode>>(new Map())
  const activeConnections = useRef<RenderedConnection[]>([])
  const nodePositions = useRef<Map<string, {x: number, y: number}>>(new Map())



  // Update viewport size
  useEffect(() => {
    if (canvasRef.current && width && height) {
      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      viewportRef.current.width = width;
      viewportRef.current.height = height;

      const ctx = canvas.getContext('2d');
      // setTransform (not scale) so repeated resizes don't accumulate DPR multiplication
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  // Generate stable spawn positions proportional to the current viewport.
  // Positions are cached so a node doesn't jump on re-render.
  const generatePosition = useCallback((nodeId: string): {x: number, y: number} => {
    if (nodePositions.current.has(nodeId)) {
      return nodePositions.current.get(nodeId)!
    }

    const W = viewportRef.current.width  || 1280;
    const H = viewportRef.current.height || 800;

    // Spawn in the centre third of the viewport so physics can spread things out naturally
    const marginX = W * 0.25;
    const marginY = H * 0.25;
    const rangeX  = W * 0.5;
    const rangeY  = H * 0.5;

    let x: number;
    let y: number;

    if (nodeId.includes('.')) {
      const parts = nodeId.split('.').map(Number)
      if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
        const [a, b, c, d] = parts;
        x = marginX + ((a * 13 + b * 7 + c * 3 + d) % Math.round(rangeX))
        y = marginY + ((a * 11 + b * 5 + c * 17 + d * 3) % Math.round(rangeY))
      } else {
        x = marginX + Math.random() * rangeX
        y = marginY + Math.random() * rangeY
      }
    } else {
      let hash = 0
      for (let i = 0; i < nodeId.length; i++) {
        hash = ((hash << 5) - hash) + nodeId.charCodeAt(i)
        hash = hash & hash
      }
      x = marginX + (Math.abs(hash)      % Math.round(rangeX))
      y = marginY + (Math.abs(hash >> 8) % Math.round(rangeY))
    }

    const position = { x, y }
    nodePositions.current.set(nodeId, position)
    return position
  }, [])

  // Update rendered objects from store data.
  // Reads store state directly so this callback is stable and won't reset the
  // interval on every packet (which would make the interval never fire).
  const updateRenderObjects = useCallback(() => {
    const { nodes: storeNodes, connections } = useNetworkStore.getState();
    const { maxNodes } = useSettingsStore.getState();
    const now = Date.now()
    const activeAge = 30000 // 30 seconds for "active" state

    // Only render nodes that have at least one connection — orphan nodes are impossible.
    const nodesWithConnections = new Set<string>();
    connections.forEach(c => { nodesWithConnections.add(c.source); nodesWithConnections.add(c.target); });

    const limitedNodes = storeNodes
      .filter(n => nodesWithConnections.has(n.id))
      .slice()
      .sort((a, b) => b.lastActive - a.lastActive)
      .slice(0, maxNodes);

    const storeNodesById = new Map(limitedNodes.map(n => [n.id, n]));
    const currentRenderedNodeIds = new Set(activeNodes.current.keys());

    // Remove nodes that are no longer in the store
    for (const nodeId of currentRenderedNodeIds) {
      if (!storeNodesById.has(nodeId)) {
        const nodeToRelease = activeNodes.current.get(nodeId);
        if (nodeToRelease) {
          nodePool.release(nodeToRelease);
        }
        activeNodes.current.delete(nodeId);
      }
    }

    // Add new nodes or update existing ones
    storeNodesById.forEach((node, nodeId) => {
      const existingNode = activeNodes.current.get(nodeId);
      if (existingNode) {
        // Update existing node
        existingNode.lastActive = node.lastActive;
        const isActive = (now - node.lastActive) < activeAge;
        existingNode.radius = isActive ? 10 : 6;
        if (existingNode.isDriftingAway && isActive) {
          existingNode.isDriftingAway = false;
        }

      } else {
        const W = viewportRef.current.width  || 1280;
        const H = viewportRef.current.height || 800;
        const position = {
          x: W * 0.25 + Math.random() * W * 0.5,
          y: H * 0.25 + Math.random() * H * 0.5,
        };
        const renderedNode = nodePool.acquire();
        renderedNode.id = node.id;
        renderedNode.x = position.x;
        renderedNode.y = position.y;
        renderedNode.vx = 0;
        renderedNode.vy = 0;
        renderedNode.isDriftingAway = false;
        renderedNode.lastActive = node.lastActive;
        const age = now - node.lastActive;
        const isActive = age < activeAge;
        
        const latestConnection = connections
          .filter(c => c.source === node.id || c.target === node.id)
          .sort((a, b) => b.lastActive - a.lastActive)[0];

        renderedNode.color = getProtocolColor(latestConnection?.protocol);

        let highlightColor = '#00ff41'; // Default green
        if (node.id.includes('.')) {
          const parts = node.id.split('.').map(Number);
          if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
            const [firstOctet] = parts;
            if (firstOctet === 192) {
              highlightColor = '#0080ff'; // Blue for home networks
            } else if (firstOctet === 10) {
              highlightColor = '#ff00ff'; // Magenta for corporate
            } else if (firstOctet === 172) {
              highlightColor = '#ff4500'; // Orange for other private
            } else if (firstOctet === 8 || firstOctet === 1) {
              highlightColor = '#ffff00'; // Yellow for public DNS
            }
          }
        } else {
          let hash = 0;
          for (let i = 0; i < node.id.length; i++) {
            hash = ((hash << 5) - hash) + node.id.charCodeAt(i);
            hash = hash & hash;
          }
          const hue = Math.abs(hash) % 360;
          highlightColor = hslToHex(hue, 90, 60);
        }
        
        renderedNode.highlightColor = highlightColor;
        renderedNode.alpha = Math.max(0.4, 1 - (age / 600000));
        activeNodes.current.set(nodeId, renderedNode);
      }
    });


    // Process connections — per-node budget prevents hub nodes from drawing
    // hundreds of spokes. Sort newest-first so the budget keeps recent activity.
    const MAX_CONNS_PER_NODE = useSettingsStore.getState().maxConnectionsPerNode;
    const nodeIds = new Set(Array.from(activeNodes.current.keys()));
    const nodeBudget = new Map<string, number>();
    const budgetedConnections = connections
      .filter(conn => nodeIds.has(conn.source) && nodeIds.has(conn.target))
      .sort((a, b) => b.lastActive - a.lastActive)
      .filter(conn => {
        const src = nodeBudget.get(conn.source) ?? 0;
        const dst = nodeBudget.get(conn.target) ?? 0;
        if (src >= MAX_CONNS_PER_NODE || dst >= MAX_CONNS_PER_NODE) return false;
        nodeBudget.set(conn.source, src + 1);
        nodeBudget.set(conn.target, dst + 1);
        return true;
      });

    // Release all old connections
    activeConnections.current.forEach(c => connectionPool.release(c));
    activeConnections.current.length = 0;

    budgetedConnections.forEach(conn => {
      const sourceNode = activeNodes.current.get(conn.source)
      const targetNode = activeNodes.current.get(conn.target)

      if (sourceNode && targetNode) {
        const renderedConn = connectionPool.acquire()
        renderedConn.color = conn.packetColor || getPacketColor(conn.source, conn.target, conn.protocol)
        renderedConn.protocol = conn.protocol
        renderedConn.dstPort = conn.dstPort;
        const connectionAge = now - conn.lastActive;
        renderedConn.alpha = Math.max(0, 1 - (connectionAge / physicsRef.current.connectionLifetime))
        renderedConn.lastActive = conn.lastActive
        renderedConn.sourceId = conn.source
        renderedConn.targetId = conn.target

        activeConnections.current.push(renderedConn)
      }
    })

  }, [generatePosition, nodePool, connectionPool])

  const updatePhysics = useCallback((deltaTime: number) => {
    const vp = viewportRef.current;
    if (!vp.width || !vp.height) return;

    const { nodeSpacing: ns, connectionPullStrength: cps, collisionRepulsion: cr,
            damping: dmp, connectionLifetime: clt, driftAwayStrength: das,
            centerPullStrength: cps2, springRestLength: srl } = physicsRef.current;

    // Normalise to 60 fps so force constants don't need to change with frame rate.
    // dt = 1.0 at 60 fps, 0.5 at 120 fps, 2.0 at 30 fps.
    const dt = Math.min(deltaTime, 50) / 16.67;

    // Correct damping: retain (1-dmp) fraction of velocity each normalised frame.
    // dmp = 0.06 → 94 % retained per frame (smooth, slightly damped).
    const retain = Math.pow(1 - dmp, dt);

    // Max px moved per normalised frame — prevents teleportation on first frame.
    const MAX_V = 15;

    const now = Date.now();
    const centerX = vp.width  / 2;
    const centerY = vp.height / 2;
    const nodesToRemove: string[] = [];
    const { isPined } = usePinStore.getState();

    // Mark which nodes have at least one live connection
    const connectedNodeIds = new Set<string>();
    activeConnections.current.forEach(conn => {
      if (now - conn.lastActive < clt) {
        connectedNodeIds.add(conn.sourceId);
        connectedNodeIds.add(conn.targetId);
      }
    });

    // Pinned nodes — stack along the right edge
    const pinnedList = Array.from(activeNodes.current.values())
      .filter(n => isPined(n.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    pinnedList.forEach((node, i) => {
      const col = Math.floor(i / 18);
      node.x = vp.width - 100 - col * 200;
      node.y = 100 + (i % 18) * 50;
      node.vx = 0; node.vy = 0;
      pinnedNodePositions.current.set(node.id, { x: node.x, y: node.y });
    });

    // Per-node: expiry, fade, drift
    activeNodes.current.forEach(node => {
      if (isPined(node.id)) return;

      const age = now - node.lastActive;
      if (age > clt) { nodesToRemove.push(node.id); return; }

      const offscreen = node.x < -200 || node.x > vp.width + 200 ||
                        node.y < -200 || node.y > vp.height + 200;
      if (offscreen) { nodesToRemove.push(node.id); return; }

      // Alpha
      node.alpha = connectedNodeIds.has(node.id) ? 1 : Math.max(0, 1 - age / clt);

      // Drift: disconnected nodes slowly wander away from centre
      if (!connectedNodeIds.has(node.id)) {
        const driftK = das * 0.000002;
        node.vx += (node.x - centerX) * driftK * dt;
        node.vy += (node.y - centerY) * driftK * dt;
      }
    });

    // Collision repulsion — O(n²) with cheap bbox early-out to avoid sqrt on distant pairs
    const nodeArr = Array.from(activeNodes.current.values());
    for (let i = 0; i < nodeArr.length; i++) {
      for (let j = i + 1; j < nodeArr.length; j++) {
        const a = nodeArr[i], b = nodeArr[j];
        if (isPined(a.id) && isPined(b.id)) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const minDist = a.radius + b.radius + ns;
        // Reject pairs that are clearly too far apart before computing sqrt
        if (Math.abs(dx) > minDist || Math.abs(dy) > minDist) continue;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        if (dist < minDist) {
          const push = cr * 0.3 * (minDist - dist) / dist * dt;
          if (!isPined(a.id)) { a.vx -= dx * push; a.vy -= dy * push; }
          if (!isPined(b.id)) { b.vx += dx * push; b.vy += dy * push; }
        }
      }
    }

    // Spring forces for connected pairs
    activeConnections.current.forEach(conn => {
      if (now - conn.lastActive > clt) return;
      const src = activeNodes.current.get(conn.sourceId);
      const tgt = activeNodes.current.get(conn.targetId);
      if (!src || !tgt) return;

      const srcPinned = isPined(src.id), tgtPinned = isPined(tgt.id);
      const dx = tgt.x - src.x, dy = tgt.y - src.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const displacement = dist - srl;

      // Spring: F = k * displacement, normalised by distance for direction
      const springK = cps * 0.003;
      const sf = springK * displacement * dt;
      if (!srcPinned) { src.vx += (dx / dist) * sf; src.vy += (dy / dist) * sf; }
      if (!tgtPinned) { tgt.vx -= (dx / dist) * sf; tgt.vy -= (dy / dist) * sf; }
    });

    // Centre gravity — applied ONCE per connected node (NOT inside the connections loop,
    // or hub nodes with many connections would receive N× the pull and slam to center)
    const gravK = cps2 * 3;
    activeNodes.current.forEach(node => {
      if (isPined(node.id) || !connectedNodeIds.has(node.id)) return;
      node.vx += (centerX - node.x) * gravK * dt;
      node.vy += (centerY - node.y) * gravK * dt;
    });

    // Integrate: damp → cap → move → soft boundary
    activeNodes.current.forEach(node => {
      if (isPined(node.id)) return;

      node.vx *= retain;
      node.vy *= retain;
      node.vx = Math.max(-MAX_V, Math.min(MAX_V, node.vx));
      node.vy = Math.max(-MAX_V, Math.min(MAX_V, node.vy));

      node.x += node.vx * dt;
      node.y += node.vy * dt;

      // Soft wall: push back from edges
      const edge = 40;
      if (node.x < edge)            node.vx += (edge - node.x)            * 0.2 * dt;
      if (node.x > vp.width - edge) node.vx -= (node.x - (vp.width - edge)) * 0.2 * dt;
      if (node.y < edge)            node.vy += (edge - node.y)            * 0.2 * dt;
      if (node.y > vp.height - edge) node.vy -= (node.y - (vp.height - edge)) * 0.2 * dt;
    });

    if (nodesToRemove.length > 0) {
      const { removeNode } = useNetworkStore.getState();
      nodesToRemove.forEach(id => removeNode(id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // High-performance render loop — stable callback, never recreated.
  const render = useCallback((currentTime: number) => {
    // Cap deltaTime to 50ms to prevent physics explosions when tab is hidden.
    // Do NOT use Math.max here — at 120fps (8ms) that would inflate to 16ms
    // and run physics at 2× speed.
    const rawDelta = currentTime - lastFrameTime.current;
    const deltaTime = rawDelta > 0 ? Math.min(50, rawDelta) : 16;
    lastFrameTime.current = currentTime;

    updatePhysics(deltaTime);

    const canvas = canvasRef.current
    const vp = viewportRef.current
    if (!canvas || !vp.width || !vp.height) {
      animationRef.current = requestAnimationFrame(render)
      return;
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // FPS counter (uses a separate timestamp so it doesn't interfere with deltaTime)
    frameCount.current++
    if (currentTime - lastLogTime.current >= 1000) {
      fpsRef.current = frameCount.current
      frameCount.current = 0
      lastLogTime.current = currentTime
    }

    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, vp.width, vp.height)


    // Save context and apply viewport transform
    ctx.save()
    ctx.translate(-vp.x * vp.zoom, -vp.y * vp.zoom)
    ctx.scale(vp.zoom, vp.zoom)

    // Render connections first (behind nodes) with protocol-based styling
    activeConnections.current.forEach(conn => {
      const source = activeNodes.current.get(conn.sourceId);
      const target = activeNodes.current.get(conn.targetId);

      if (!source || !target) return;

      // Protocol-based colors and styles using stored protocol
      let strokeColor = `rgba(0, 255, 255, ${conn.alpha})` // Default cyan
      let lineWidth = 1
      
      if (conn.protocol) {
        const protocol = conn.protocol.toLowerCase();
        // Debug log to see what protocols we're getting
        if (settingsRef.current.verboseLogging && Math.random() < 0.01) { // Log 1% of connections to avoid spam
          logger.log(`🎨 Connection protocol: ${protocol} for ${conn.sourceId} -> ${conn.targetId}`);
        }
        
        switch (protocol) {
          case 'tcp':
            strokeColor = `rgba(0, 255, 0, ${conn.alpha})`; // Bright green for TCP
            lineWidth = 3; // Thicker line
            break;
          case 'udp':
            strokeColor = `rgba(255, 0, 255, ${conn.alpha})`; // Bright magenta for UDP
            lineWidth = 2; // Medium line
            break;
          case 'icmp':
            strokeColor = `rgba(255, 255, 0, ${conn.alpha})`; // Bright yellow for ICMP
            lineWidth = 2; // Medium line
            break;
          case 'http':
          case 'https':
            strokeColor = `rgba(255, 165, 0, ${conn.alpha})`; // Orange for HTTP/HTTPS
            lineWidth = 2;
            break;
          default:
            strokeColor = `rgba(0, 255, 255, ${conn.alpha})`; // Cyan for others
            lineWidth = 1;
            // Log unknown protocols
            if (settingsRef.current.verboseLogging && Math.random() < 0.05) {
              logger.log(`🔍 Unknown protocol: ${protocol}`);
            }
        }
      } else {
        // Debug: no protocol found
        if (settingsRef.current.verboseLogging && Math.random() < 0.01) {
          logger.log(`⚠️ No protocol found for connection ${conn.sourceId} -> ${conn.targetId}`);
        }
      }
      
      // Make very active connections more prominent regardless of protocol
      if (conn.alpha > 0.8) {
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
          const portText = (conn.dstPort ?? 0) > 0 ? `:${conn.dstPort}` : '';
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
          ctx.fillStyle = `rgba(0, 255, 255, ${conn.alpha})`; // Bright blue for port number
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
    activeConnections.current.forEach(conn => {
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

      if (usePinStore.getState().isPined(node.id)) {
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
      
      // Draw IP address label for nodes
      if (node.id.includes('.')) {
        const fontSize = Math.max(11, 14 * vp.zoom)
        ctx.font = `${fontSize}px monospace`
        ctx.textAlign = 'center'

        const textY = node.y + node.radius + fontSize + 2
        const textWidth = ctx.measureText(node.id).width

        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
        ctx.fillRect(node.x - textWidth/2 - 3, textY - fontSize, textWidth + 6, fontSize + 2)

        ctx.fillStyle = `rgba(${hr}, ${hg}, ${hb}, ${node.alpha})`
        ctx.fillText(node.id, node.x, textY)
      }
    })
    
    ctx.textAlign = 'left' // Reset text alignment

    ctx.restore()

    // No data message
    if (activeNodes.current.size === 0) {
      ctx.fillStyle = '#888'
      ctx.font = '16px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(
        'Waiting for network activity...', 
        vp.width / 2, 
        vp.height / 2
      )
      ctx.textAlign = 'left'
    }

    animationRef.current = requestAnimationFrame(render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      const newZoom = Math.max(0.1, Math.min(5, viewportRef.current.zoom * zoomFactor))
      
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
      if (e.key === 'r' || e.key === 'R') {
        const vp = viewportRef.current;
        vp.x = 0;
        vp.y = 0;
        vp.zoom = 1.0;
        logger.log('🔄 View reset')
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

  // Update render objects periodically - less aggressive updates
  useEffect(() => {
    updateRenderObjects()
    
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
