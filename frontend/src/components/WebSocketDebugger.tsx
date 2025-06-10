import React, { useEffect, useState, useRef } from 'react'
import { usePacketStore } from '../stores/packetStore'
import { useNetworkStore } from '../stores/networkStore'

export const WebSocketDebugger: React.FC = () => {
  const { packets } = usePacketStore()
  const { nodes, connections } = useNetworkStore()
  const [wsStats, setWsStats] = useState({
    totalPackets: 0,
    recentPackets: 0,
    packetRate: 0,
    lastPacketTime: 0,
    samplePackets: [] as any[]
  })

  // Track render frequency to detect infinite loops
  const renderCount = useRef(0)
  const lastRenderTime = useRef(Date.now())
  const [renderWarning, setRenderWarning] = useState<string>('')

  useEffect(() => {
    renderCount.current++
    const now = Date.now()
    
    // Check if we're rendering too frequently (potential infinite loop)
    if (now - lastRenderTime.current < 100) {
      // If we've rendered more than 10 times in 100ms, that's suspicious
      if (renderCount.current > 10) {
        setRenderWarning(`⚠️ High render frequency detected! ${renderCount.current} renders in ${now - lastRenderTime.current}ms`)
      }
    } else {
      // Reset counter after 100ms
      renderCount.current = 0
      lastRenderTime.current = now
      setRenderWarning('')
    }
  })

  useEffect(() => {
    const now = Date.now()
    const recentPackets = packets.filter(p => (now - p.timestamp) < 5000)
    const packetRate = recentPackets.length / 5 // packets per second over last 5 seconds
    
    // Keep sample of recent packets for debugging
    const samplePackets = packets.slice(-3).map(p => ({
      src: p.src,
      dst: p.dst,
      protocol: p.protocol,
      timestamp: p.timestamp,
      age: Math.round((now - p.timestamp) / 1000)
    }))

    setWsStats({
      totalPackets: packets.length,
      recentPackets: recentPackets.length,
      packetRate: Math.round(packetRate * 10) / 10,
      lastPacketTime: packets.length > 0 ? packets[packets.length - 1].timestamp : 0,
      samplePackets
    })
  }, [packets])

  const lastPacketAge = wsStats.lastPacketTime > 0 ? 
    Math.round((Date.now() - wsStats.lastPacketTime) / 1000) : 0

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '350px',
      zIndex: 1001,
      background: 'rgba(0, 0, 0, 0.9)',
      border: '1px solid #ff6600',
      borderRadius: '4px',
      padding: '10px',
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ff6600',
      maxWidth: '300px',
      maxHeight: '300px',
      overflow: 'auto'
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ffaa00' }}>
        🔌 WebSocket Data Flow
      </div>
      
      {renderWarning && (
        <div style={{ 
          color: '#ff4444', 
          marginBottom: '8px', 
          border: '1px solid #ff4444', 
          padding: '4px', 
          borderRadius: '2px',
          fontSize: '10px'
        }}>
          {renderWarning}
        </div>
      )}
      
      <div style={{ marginBottom: '4px' }}>
        📦 Total Packets: <span style={{ color: '#fff' }}>{wsStats.totalPackets}</span>
      </div>
      <div style={{ marginBottom: '4px' }}>
        ⚡ Recent (5s): <span style={{ color: '#fff' }}>{wsStats.recentPackets}</span>
      </div>
      <div style={{ marginBottom: '4px' }}>
        📊 Rate: <span style={{ color: '#fff' }}>{wsStats.packetRate}/sec</span>
      </div>
      <div style={{ marginBottom: '4px' }}>
        ⏰ Last packet: <span style={{ color: lastPacketAge > 10 ? '#ff4444' : '#fff' }}>
          {lastPacketAge}s ago
        </span>
      </div>
      
      <div style={{ marginTop: '8px', marginBottom: '4px', color: '#00ff00' }}>
        📡 Store Status:
      </div>
      <div style={{ marginBottom: '4px' }}>
        🔘 Nodes: <span style={{ color: '#fff' }}>{nodes.length}</span>
      </div>
      <div style={{ marginBottom: '4px' }}>
        🔗 Connections: <span style={{ color: '#fff' }}>{connections.length}</span>
      </div>
      
      <div style={{ marginTop: '8px', marginBottom: '4px', color: '#00aaff' }}>
        📋 Recent Packets:
      </div>
      {wsStats.samplePackets.map((packet, idx) => (
        <div key={idx} style={{ fontSize: '9px', marginBottom: '2px', color: '#ccc' }}>
          {packet.src} → {packet.dst} ({packet.protocol}) {packet.age}s ago
        </div>
      ))}
      
      <div style={{ marginTop: '8px', fontSize: '9px', color: '#666' }}>
        🔄 Renders: {renderCount.current}
      </div>
    </div>
  )
} 