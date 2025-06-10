import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useNetworkStore } from '../stores/networkStore'
import { createContext, useContext } from 'react'

// Create a context for capture mode
interface CaptureContextType {
  captureMode: 'real' | 'simulated' | 'unknown' | 'waiting';
  captureInterface: string;
}

export const CaptureContext = React.createContext<CaptureContextType>({
  captureMode: 'unknown',
  captureInterface: '',
});

export const useCaptureContext = () => useContext(CaptureContext);

// Ultra-optimized HTML-based node visualization
export const HTMLNodeGraph = React.memo(() => {
  const { nodes, connections } = useNetworkStore()
  const captureContextValue = useCaptureContext()
  const [nodePositions, setNodePositions] = useState<Map<string, {x: number, y: number}>>(new Map())
  const lastUpdateRef = useRef<number>(0)
  const animationFrameRef = useRef<number>()
  const containerRef = useRef<HTMLDivElement>(null)
  const [displayNodes, setDisplayNodes] = useState<any[]>([])
  const [displayConnections, setDisplayConnections] = useState<any[]>([])

  // ULTRA AGGRESSIVE: Only update every 2 seconds and limit to very few elements
  const updateDisplay = useCallback(() => {
    const now = Date.now()
    if (now - lastUpdateRef.current < 2000) return // Update only every 2 seconds
    lastUpdateRef.current = now

    // EXTREME LIMITS for performance
    const recentNodes = nodes
      .filter(node => (now - node.lastActive) < 10000) // Shorter time window
      .sort((a, b) => b.lastActive - a.lastActive)
      .slice(0, 15) // MUCH fewer nodes

    const recentConnections = connections
      .filter(conn => (now - conn.lastActive) < 3000) // Much shorter time window
      .sort((a, b) => b.lastActive - a.lastActive)
      .slice(0, 20) // MUCH fewer connections

    // Update positions only for new nodes
    const newPositions = new Map(nodePositions)
    let positionsChanged = false

    recentNodes.forEach(node => {
      if (!newPositions.has(node.id)) {
        // Simple random positioning - no complex algorithm
        newPositions.set(node.id, {
          x: 200 + Math.random() * 800,
          y: 200 + Math.random() * 400
        })
        positionsChanged = true
      }
    })

    if (positionsChanged) {
      setNodePositions(newPositions)
    }

    // Prepare display data
    const displayNodesData = recentNodes.map(node => {
      const position = newPositions.get(node.id)
      if (!position) return null
      
      const age = now - node.lastActive
      const opacity = age > 5000 ? Math.max(0.4, 1 - (age - 5000) / 5000) : 1
      const isVeryRecent = age < 500
      
      return {
        id: node.id,
        label: node.label,
        x: position.x,
        y: position.y,
        opacity,
        isVeryRecent,
        color: isVeryRecent ? '#00ffff' : '#00ff41'
      }
    }).filter(Boolean)

    const displayConnectionsData = recentConnections.map((connection, index) => {
      const sourcePos = newPositions.get(connection.source)
      const targetPos = newPositions.get(connection.target)
      
      if (!sourcePos || !targetPos) return null
      
      const age = now - connection.lastActive
      const opacity = age > 1500 ? Math.max(0.3, 1 - (age - 1500) / 1500) : 0.7
      
      return {
        id: `${connection.source}-${connection.target}-${index}`,
        x1: sourcePos.x,
        y1: sourcePos.y,
        x2: targetPos.x,
        y2: targetPos.y,
        opacity
      }
    }).filter(Boolean)

    setDisplayNodes(displayNodesData)
    setDisplayConnections(displayConnectionsData)
  }, [nodes, connections, nodePositions])

  // Use requestAnimationFrame for smooth updates
  useEffect(() => {
    const animate = () => {
      updateDisplay()
      animationFrameRef.current = requestAnimationFrame(animate)
    }
    
    animationFrameRef.current = requestAnimationFrame(animate)
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [updateDisplay])

  // Memoize the debug info to prevent re-renders
  const debugInfo = useMemo(() => (
    <div style={{
      position: 'absolute',
      top: 10,
      left: 10,
      color: '#00ff41',
      fontFamily: 'monospace',
      fontSize: '12px',
      zIndex: 1000,
      background: 'rgba(0,0,0,0.9)',
      padding: '8px',
      border: '1px solid #00ff41',
      borderRadius: '4px'
    }}>
      <div>Mode: {captureContextValue.captureMode}</div>
      <div>Showing: {displayNodes.length}/{nodes.length} nodes</div>
      <div>Connections: {displayConnections.length}/{connections.length}</div>
      <div>Performance: OPTIMIZED 🚀</div>
    </div>
  ), [captureContextValue.captureMode, displayNodes.length, nodes.length, displayConnections.length, connections.length])

  // Memoize connections to prevent re-renders
  const connectionsElement = useMemo(() => (
    <svg style={{ 
      position: 'absolute', 
      top: 0, 
      left: 0, 
      width: '100%', 
      height: '100%',
      zIndex: 1
    }}>
      {displayConnections.map(connection => (
        <line
          key={connection.id}
          x1={connection.x1}
          y1={connection.y1}
          x2={connection.x2}
          y2={connection.y2}
          stroke="#00ffff"
          strokeWidth="1"
          opacity={connection.opacity}
        />
      ))}
    </svg>
  ), [displayConnections])

  // Memoize nodes to prevent re-renders
  const nodesElement = useMemo(() => 
    displayNodes.map(node => (
      <div
        key={node.id}
        style={{
          position: 'absolute',
          left: node.x - 10,
          top: node.y - 10,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: node.color,
          opacity: node.opacity,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '6px',
          color: 'black',
          fontWeight: 'bold',
          border: node.isVeryRecent ? '1px solid white' : 'none'
        }}
        title={`${node.label} - ${node.isVeryRecent ? 'ACTIVE' : 'recent'}`}
      >
        •
        
        {/* Only show labels for very recent nodes */}
        {node.isVeryRecent && node.label && node.label.includes('.') && (
          <div style={{
            position: 'absolute',
            top: 25,
            left: '50%',
            transform: 'translateX(-50%)',
            color: node.color,
            fontSize: '9px',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            textShadow: '1px 1px 2px black',
            background: 'rgba(0,0,0,0.8)',
            padding: '1px 3px',
            borderRadius: '2px'
          }}>
            {node.label}
          </div>
        )}
      </div>
    )), [displayNodes])

  return (
    <div 
      ref={containerRef}
      style={{ 
        width: '100%', 
        height: '100%', 
        background: 'black', 
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {debugInfo}
      {connectionsElement}
      {nodesElement}

      {/* Show message if no data */}
      {displayNodes.length === 0 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#ff4444',
          fontSize: '18px',
          fontFamily: 'monospace',
          textAlign: 'center'
        }}>
          No active nodes
          <div style={{ fontSize: '14px', marginTop: '10px', color: '#888' }}>
            Total: {nodes.length} nodes, {connections.length} connections
          </div>
          <div style={{ fontSize: '12px', marginTop: '5px', color: '#666' }}>
            Showing only very recent activity...
          </div>
        </div>
      )}
    </div>
  )
}) 