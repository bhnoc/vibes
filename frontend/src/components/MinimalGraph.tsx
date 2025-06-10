import React, { useEffect, useRef, useState } from 'react'
import { useNetworkStore } from '../stores/networkStore'
import { usePacketStore } from '../stores/packetStore'
import { createContext, useContext } from 'react'

interface CaptureContextType {
  captureMode: 'real' | 'simulated' | 'unknown' | 'waiting';
  captureInterface: string;
}

export const CaptureContext = React.createContext<CaptureContextType>({
  captureMode: 'unknown',
  captureInterface: '',
});

export const useCaptureContext = () => useContext(CaptureContext);

// ULTRA MINIMAL - Focus only on performance
export const MinimalGraph = React.memo(() => {
  const { nodes, connections } = useNetworkStore()
  const { packets } = usePacketStore()
  const captureContextValue = useCaptureContext()
  const lastUpdateRef = useRef<number>(0)
  const [displayState, setDisplayState] = useState<{
    nodes: Array<{id: string, x: number, y: number, active: boolean}>,
    connections: Array<{x1: number, y1: number, x2: number, y2: number}>
  }>({ nodes: [], connections: [] })
  const positionsRef = useRef<Map<string, {x: number, y: number}>>(new Map())
  const lastProcessedTimestampRef = useRef<number>(0)

  // BALANCED UPDATE - Every 1 second, max 15 nodes, max 20 connections
  useEffect(() => {
    const update = () => {
      const now = Date.now()
      console.log(`🔄 Update cycle running at ${new Date().toLocaleTimeString()}`)
      
      // Get current data from stores (will be fresh each time)
      const currentNodes = useNetworkStore.getState().nodes
      const currentConnections = useNetworkStore.getState().connections
      const currentPackets = usePacketStore.getState().packets

      // Debug: Check packet flow and node data
      console.log(`📦 Packets in store: ${currentPackets.length}`)
      console.log(`🔍 Total nodes in store: ${currentNodes.length}`)
      if (currentNodes.length > 0) {
        const sampleNode = currentNodes[0]
        const nodeAge = now - sampleNode.lastActive
        console.log(`🔍 Sample node age: ${nodeAge}ms (${Math.round(nodeAge/1000)}s)`)
      }

      // Filter nodes with reasonable time window
      const recentNodes = currentNodes
        .filter(n => (now - n.lastActive) < 60000) // 60 seconds - much more generous
        .sort((a, b) => b.lastActive - a.lastActive)
        .slice(0, 15)

      console.log(`🔍 After 60s time filter: ${recentNodes.length} nodes remain`)

      // Generate positions for new nodes only
      recentNodes.forEach(node => {
        if (!positionsRef.current.has(node.id)) {
          positionsRef.current.set(node.id, {
            x: 300 + Math.random() * 600,
            y: 200 + Math.random() * 300
          })
        }
      })

      // Prepare minimal display data
      const displayNodes = recentNodes.map(node => {
        const pos = positionsRef.current.get(node.id)!
        return {
          id: node.id,
          x: pos.x,
          y: pos.y,
          active: (now - node.lastActive) < 3000
        }
      })

      // Get only recent connections between displayed nodes
      const nodeIds = new Set(recentNodes.map(n => n.id))
      const displayConnections = currentConnections
        .filter(c => (now - c.lastActive) < 6000)
        .filter(c => nodeIds.has(c.source) && nodeIds.has(c.target))
        .slice(0, 20)
        .map(conn => {
          const sourcePos = positionsRef.current.get(conn.source)
          const targetPos = positionsRef.current.get(conn.target)
          if (!sourcePos || !targetPos) return null
          return {
            x1: sourcePos.x,
            y1: sourcePos.y,
            x2: targetPos.x,
            y2: targetPos.y
          }
        })
        .filter(Boolean) as Array<{x1: number, y1: number, x2: number, y2: number}>

      setDisplayState({ nodes: displayNodes, connections: displayConnections })
      
      // Debug logging
      console.log(`📊 MinimalGraph Update: ${displayNodes.length} nodes displayed, ${displayConnections.length} connections`)
    }

    const interval = setInterval(update, 1000) // Update every 1 second
    update() // Initial update
    
    return () => clearInterval(interval)
  }, []) // EMPTY dependency array to prevent infinite loop

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      background: 'black', 
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Ultra simple debug */}
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        color: '#00ff41',
        fontFamily: 'monospace',
        fontSize: '12px',
        zIndex: 1000,
        background: 'rgba(0,0,0,0.9)',
        padding: '8px'
      }}>
        MINIMAL MODE | {displayState.nodes.length} nodes | {displayState.connections.length} connections
      </div>

      {/* Simple SVG for connections */}
      <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
        {displayState.connections.map((conn, i) => (
          <line
            key={i}
            x1={conn.x1}
            y1={conn.y1}
            x2={conn.x2}
            y2={conn.y2}
            stroke="#00ffff"
            strokeWidth="1"
            opacity="0.6"
          />
        ))}
      </svg>

      {/* Minimal nodes */}
      {displayState.nodes.map(node => (
        <div
          key={node.id}
          style={{
            position: 'absolute',
            left: node.x - 8,
            top: node.y - 8,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: node.active ? '#00ffff' : '#00ff41',
            zIndex: 2,
            border: node.active ? '1px solid white' : 'none'
          }}
          title={node.id}
        />
      ))}

      {/* No data message */}
      {displayState.nodes.length === 0 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#888',
          fontSize: '16px',
          fontFamily: 'monospace'
        }}>
          Waiting for network activity...
        </div>
      )}
    </div>
  )
}) 