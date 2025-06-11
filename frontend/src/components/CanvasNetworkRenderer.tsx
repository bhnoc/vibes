import React, { useEffect, useRef, useCallback, useMemo } from 'react'
import { useNetworkStore } from '../stores/networkStore'
import { usePacketStore } from '../stores/packetStore'
import { useSizeStore } from '../stores/sizeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { usePhysicsStore } from '../stores/physicsStore'

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
  alpha: number
  lastActive: number
  isDriftingAway: boolean // State for drifting behavior
}

interface RenderedConnection {
  alpha: number
  color: string
  protocol?: string
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
  
  // Viewport state - start zoomed out to see the whole spread-out network
  const viewportRef = useRef<Viewport>({
    x: -400, // Center on the wider spread
    y: -200, // Center on the taller spread
    zoom: 0.3, // Much more zoomed out to see the expanded layout
    width: 0,
    height: 0
  })

  // Object pools
  const nodePool = useMemo(() => new ObjectPool<RenderedNode>(
    () => ({ id: '', x: 0, y: 0, vx: 0, vy: 0, radius: 0, color: '', alpha: 0, lastActive: 0, isDriftingAway: false }),
    (node) => { node.id = ''; node.alpha = 0; node.lastActive = 0; node.isDriftingAway = false }
  ), [])

  const connectionPool = useMemo(() => new ObjectPool<RenderedConnection>(
    () => ({ alpha: 0, color: '', protocol: '', lastActive: 0, sourceId: '', targetId: '' }),
    (conn) => { conn.alpha = 0; conn.lastActive = 0; conn.color = ''; conn.protocol = ''; conn.sourceId = ''; conn.targetId = '' }
  ), [])

  // Active rendered objects
  const activeNodes = useRef<Map<string, RenderedNode>>(new Map())
  const activeConnections = useRef<RenderedConnection[]>([])
  const nodePositions = useRef<Map<string, {x: number, y: number}>>(new Map())

  // Store hooks
  const { nodes, connections } = useNetworkStore()
  const { packets } = usePacketStore()
  const { width, height } = useSizeStore()
  const { nodeSpacing } = usePhysicsStore()
  const { 
    connectionPullStrength, 
    collisionRepulsion, 
    damping,
    connectionLifetime,
    driftAwayStrength,
  } = usePhysicsStore()

  // Update viewport size
  useEffect(() => {
    if (canvasRef.current && width && height) {
      const canvas = canvasRef.current
      const dpr = window.devicePixelRatio || 1
      
      // Set actual size
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      
      // Update viewport
      viewportRef.current.width = width
      viewportRef.current.height = height
      
      // Scale context for high DPI
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(dpr, dpr)
      }
    }
  }, [width, height])

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
        let regionX = 0
        let regionY = 0
        
        if (firstOctet === 192) {
          regionX = 200 + secondOctet * 4 // 192.168.x -> spread horizontally
          regionY = 150
        } else if (firstOctet === 10) {
          regionX = 500 + secondOctet * 3 // 10.x.x -> different region
          regionY = 300
        } else if (firstOctet === 172) {
          regionX = 800 + (secondOctet - 16) * 5 // 172.16-31.x -> another region
          regionY = 200
        } else {
          // Other ranges spread out more
          regionX = 100 + (firstOctet % 20) * 50
          regionY = 400 + (firstOctet % 10) * 40
        }
        
        // Add variation based on 3rd and 4th octets
        const spreadX = (thirdOctet * 2) + (fourthOctet % 50) - 25 // More spread
        const spreadY = (fourthOctet * 1.5) + (thirdOctet % 40) - 20
        
        // Final position with bounds checking
        const x = Math.max(50, Math.min(1400, regionX + spreadX))
        const y = Math.max(50, Math.min(800, regionY + spreadY))
        
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

    const x = 200 + (Math.abs(hash) % 800)
    const y = 150 + (Math.abs(hash >> 8) % 500)
    
    const position = { x, y }
    nodePositions.current.set(nodeId, position)
    return position
  }, [])

  // Update rendered objects from store data
  const updateRenderObjects = useCallback(() => {
    const now = Date.now()
    const activeAge = 30000 // 30 seconds for "active" state

    const storeNodesById = new Map(nodes.map(n => [n.id, n]));
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
        // Add new node - ALWAYS start it in the middle of the screen
        const position = {
          x: (viewportRef.current.width / 2) + (Math.random() - 0.5) * 5,
          y: (viewportRef.current.height / 2) + (Math.random() - 0.5) * 5,
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
        renderedNode.radius = isActive ? 10 : 6;
        
        let nodeColor = '#00ff41'; // Default green
      if (node.id.includes('.')) {
          const parts = node.id.split('.').map(Number);
        if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
            const [firstOctet, , , fourthOctet] = parts;
          if (firstOctet === 192) {
              nodeColor = '#0080ff'; // Blue for home networks
          } else if (firstOctet === 10) {
              nodeColor = '#ff00ff'; // Magenta for corporate
          } else if (firstOctet === 172) {
              nodeColor = '#ff4500'; // Orange for other private
          } else if (firstOctet === 8 || firstOctet === 1) {
              nodeColor = '#ffff00'; // Yellow for public DNS
            }
          }
        } else {
            let hash = 0;
            for (let i = 0; i < node.id.length; i++) {
              hash = ((hash << 5) - hash) + node.id.charCodeAt(i);
              hash = hash & hash;
            }
            const hue = Math.abs(hash) % 360;
            nodeColor = hslToHex(hue, 90, 60);
        }
        
        renderedNode.color = nodeColor;
        renderedNode.alpha = Math.max(0.4, 1 - (age / 600000));
        activeNodes.current.set(nodeId, renderedNode);
      }
    });


    // Process connections
    const nodeIds = new Set(Array.from(activeNodes.current.keys()))
    const recentConnections = connections
      .filter(conn => nodeIds.has(conn.source) && nodeIds.has(conn.target))
      .slice(0, 5000)

    // Release all old connections
    activeConnections.current.forEach(c => connectionPool.release(c));
    activeConnections.current.length = 0;

    recentConnections.forEach(conn => {
      const sourceNode = activeNodes.current.get(conn.source)
      const targetNode = activeNodes.current.get(conn.target)
      
      if (sourceNode && targetNode) {
        const renderedConn = connectionPool.acquire()
        renderedConn.color = conn.packetColor || getPacketColor(conn.source, conn.target, conn.protocol)
        renderedConn.protocol = conn.protocol
        const connectionAge = now - conn.lastActive;
        renderedConn.alpha = Math.max(0, 1 - (connectionAge / connectionLifetime))
        renderedConn.lastActive = conn.lastActive
        renderedConn.sourceId = conn.source
        renderedConn.targetId = conn.target
        
        activeConnections.current.push(renderedConn)
      }
    })

  }, [nodes, connections, generatePosition, nodePool, connectionPool])

  const updatePhysics = useCallback((deltaTime: number) => {
    if (!width || !height) return;

    // --- Physics Constants ---
    // These factors scale the user-friendly values from the store 
    // into numbers that work well with the physics simulation.
    const PULL_SCALING = 0.00001;
    const REPULSION_SCALING = 0.005;
    const DRIFT_AWAY_SCALING = 0.000001;
    const INACTIVE_REMOVAL_SECONDS = 15;

    const INACTIVE_TIME_SECONDS = 10;
    const CENTER_PULL_STRENGTH = 0.0000002;

    const now = Date.now();
    const centerX = viewportRef.current.width / 2;
    const centerY = viewportRef.current.height / 2;
    const nodesToRemove: string[] = [];
    const offscreenMargin = 200; // Remove nodes this far outside the viewport

    // Apply forces
    activeNodes.current.forEach(node => {
      // Check for removal conditions first
      const isInactiveForRemoval = (now - node.lastActive) > INACTIVE_REMOVAL_SECONDS * 1000;
      const isOffscreen = 
        node.x < -offscreenMargin || 
        node.x > viewportRef.current.width + offscreenMargin ||
        node.y < -offscreenMargin ||
        node.y > viewportRef.current.height + offscreenMargin;

      if (isInactiveForRemoval || isOffscreen) {
        nodesToRemove.push(node.id);
        return; // Skip physics for nodes that are being removed
      }
      
      const isInactive = (now - node.lastActive) > INACTIVE_TIME_SECONDS * 1000;
      
      if (isInactive) {
        node.isDriftingAway = true;
      }

      // Only apply drift away force here. Center pull is handled with connections.
      if (node.isDriftingAway) {
        const dx = node.x - centerX;
        const dy = node.y - centerY;
        const driftForce = driftAwayStrength * DRIFT_AWAY_SCALING;
        node.vx += dx * driftForce * deltaTime;
        node.vy += dy * driftForce * deltaTime;
      }
    });

    // Collision detection and resolution
    const nodes = Array.from(activeNodes.current.values());
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = nodeA.radius + nodeB.radius + nodeSpacing;

        if (distance < minDistance) {
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

    activeConnections.current.forEach(conn => {
      // Expired connections should not apply physics
      if (now - conn.lastActive > connectionLifetime) {
        return;
      }
      const source = activeNodes.current.get(conn.sourceId);
      const target = activeNodes.current.get(conn.targetId);

      if (source && target) {
        // 1. Spring force pulls nodes together
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        
        const pullForce = connectionPullStrength * PULL_SCALING;
        source.vx += dx * pullForce * deltaTime;
        source.vy += dy * pullForce * deltaTime;
        target.vx -= dx * pullForce * deltaTime;
        target.vy -= dy * pullForce * deltaTime;

        // 2. Center pull for connected nodes
        const source_dx_center = centerX - source.x;
        const source_dy_center = centerY - source.y;
        source.vx += source_dx_center * CENTER_PULL_STRENGTH * deltaTime;
        source.vy += source_dy_center * CENTER_PULL_STRENGTH * deltaTime;

        const target_dx_center = centerX - target.x;
        const target_dy_center = centerY - target.y;
        target.vx += target_dx_center * CENTER_PULL_STRENGTH * deltaTime;
        target.vy += target_dy_center * CENTER_PULL_STRENGTH * deltaTime;

        // When a connection is active, stop drifting
        if (source.isDriftingAway) source.isDriftingAway = false;
        if (target.isDriftingAway) target.isDriftingAway = false;
      }
    });

    // Handle removal after physics calculations
    if (nodesToRemove.length > 0) {
      const removeFunc = useNetworkStore.getState().removeNode;
      nodesToRemove.forEach(id => removeFunc(id));
    }

    // Update positions
    activeNodes.current.forEach(node => {
      node.vx *= damping;
      node.vy *= damping;

      node.x += node.vx * deltaTime;
      node.y += node.vy * deltaTime;
    });

  }, [width, height, nodeSpacing, connectionPullStrength, collisionRepulsion, damping, driftAwayStrength]);

  // High-performance render loop
  const render = useCallback((currentTime: number) => {
    const deltaTime = Math.max(16, currentTime - lastFrameTime.current); // Clamp to avoid huge jumps
    lastFrameTime.current = currentTime;

    // Update physics simulation
    updatePhysics(deltaTime);

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Calculate FPS
    frameCount.current++
    if (currentTime - lastFrameTime.current >= 1000) {
      fpsRef.current = frameCount.current
      frameCount.current = 0
      lastFrameTime.current = currentTime
    }

    // Clear canvas
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const vp = viewportRef.current

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
        if (Math.random() < 0.01) { // Log 1% of connections to avoid spam
          console.log(`🎨 Connection protocol: ${protocol} for ${conn.sourceId} -> ${conn.targetId}`);
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
            if (Math.random() < 0.05) {
              console.log(`🔍 Unknown protocol: ${protocol}`);
            }
        }
      } else {
        // Debug: no protocol found
        if (Math.random() < 0.01) {
          console.log(`⚠️ No protocol found for connection ${conn.sourceId} -> ${conn.targetId}`);
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
      
      // Add arrow indicator for direction (if zoom is high enough)
      if (vp.zoom > 0.8) {
        const dx = target.x - source.x
        const dy = target.y - source.y
        const len = Math.sqrt(dx * dx + dy * dy)
        
        if (len > 20) {
          // Calculate arrow position (75% along the line)
          const arrowX = source.x + dx * 0.75
          const arrowY = source.y + dy * 0.75
          
          // Calculate arrow direction
          const angle = Math.atan2(dy, dx)
          const arrowSize = 6
          
          ctx.fillStyle = strokeColor
          ctx.beginPath()
          ctx.moveTo(arrowX, arrowY)
          ctx.lineTo(
            arrowX - arrowSize * Math.cos(angle - Math.PI / 6),
            arrowY - arrowSize * Math.sin(angle - Math.PI / 6)
          )
          ctx.lineTo(
            arrowX - arrowSize * Math.cos(angle + Math.PI / 6),
            arrowY - arrowSize * Math.sin(angle + Math.PI / 6)
          )
          ctx.closePath()
          ctx.fill()
        }
      }
    })

    // Render nodes with enhanced IP address display
    activeNodes.current.forEach(node => {
      // Use the enhanced node color system
      const rgb = hexToRgb(node.color)
      const [r, g, b] = rgb ? [rgb.r, rgb.g, rgb.b] : [0, 255, 65] // fallback to green
      
      // Draw main node circle
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${node.alpha})`
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
      ctx.fill()
      
      // Add border for better visibility
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${node.alpha})`
      ctx.lineWidth = 1
      ctx.stroke()
      
      // Add glow effect for active nodes (larger radius = more active)
      if (node.radius > 7) {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${node.alpha * 0.3})`
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius * 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
      
      // Draw IP address label for nodes (if zoom is high enough)
      if (vp.zoom > 0.5 && node.id.includes('.')) {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${node.alpha * 0.9})`
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
        
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${node.alpha})`
        ctx.fillText(displayText, node.x, textY)
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

    // Only continue animation if there are nodes to render or user is interacting
    if (activeNodes.current.size > 0) {
      animationRef.current = requestAnimationFrame(render)
    } else {
      // No nodes - render once more to show "waiting" message and stop
      setTimeout(() => {
        if (canvasRef.current) { // Check if component is still mounted
        animationRef.current = requestAnimationFrame(render)
        }
      }, 1000) // Render every second when no data
    }
  }, [updatePhysics])

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
        // Reset view to show full network
        viewportRef.current.x = -400
        viewportRef.current.y = -200
        viewportRef.current.zoom = 0.3
        console.log('🔄 View reset to show full network')
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
    
    // Only update every 2 seconds instead of 1 second for better performance
    const interval = setInterval(updateRenderObjects, 2000)
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