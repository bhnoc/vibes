import React, { useEffect } from 'react'
import { useNetworkStore } from '../stores/networkStore'
import { usePacketStore } from '../stores/packetStore'
import { logger } from '../utils/logger'

interface TestDataProps {
  nodeCount?: number
  connectionCount?: number
  enabled?: boolean
}

export const PerformanceTestData: React.FC<TestDataProps> = ({ 
  nodeCount = 2000, 
  connectionCount = 3000, 
  enabled = false 
}) => {
  const { addNode, addConnection, clearNetwork } = useNetworkStore()
  const { addPacket } = usePacketStore()

  useEffect(() => {
    if (!enabled) return

    logger.log(`🚀 Generating test data: ${nodeCount} nodes, ${connectionCount} connections`)
    
    // Clear existing data
    clearNetwork()

    // Generate test nodes (simulating realistic IP addresses)
    const nodeIds: string[] = []
    const now = Date.now()

    // Define diverse IP ranges for better spread visualization
    const subnets = [
      '192.168.1', '192.168.0', '192.168.100', '192.168.50', '192.168.200',
      '10.0.0', '10.1.0', '10.2.1', '10.10.10', '10.20.5', '10.100.1',
      '172.16.1', '172.20.0', '172.25.10', '172.30.5',
      '203.0.113', '198.51.100', '8.8.8', '1.1.1'
    ]

    for (let i = 0; i < nodeCount; i++) {
      // Use realistic internal IP ranges
      const subnet = subnets[Math.floor(Math.random() * subnets.length)]
      const host = Math.floor(Math.random() * 254) + 1 // 1-254
      const nodeId = `${subnet}.${host}`
      
      nodeIds.push(nodeId)
      
      // Add node with varying activity times
      const lastActive = now - Math.random() * 20000 // Random activity in last 20 seconds
      addNode(nodeId, {
        label: nodeId,
        lastActive,
        size: Math.floor(Math.random() * 20) + 5,
        color: 0x00ff41
      })
    }

    // Generate test connections
    for (let i = 0; i < connectionCount; i++) {
      const sourceId = nodeIds[Math.floor(Math.random() * nodeIds.length)]
      const targetId = nodeIds[Math.floor(Math.random() * nodeIds.length)]
      
      if (sourceId !== targetId) {
        const lastActive = now - Math.random() * 15000 // Random activity in last 15 seconds
        addConnection({
          id: `${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          protocol: Math.random() > 0.5 ? 'TCP' : 'UDP',
          lastActive
        })
      }
    }

    // Simulate ongoing packet flow
    const packetInterval = setInterval(() => {
      if (!enabled) {
        clearInterval(packetInterval)
        return
      }

      // Add random packets
      for (let i = 0; i < 5; i++) {
        const sourceId = nodeIds[Math.floor(Math.random() * nodeIds.length)]
        const targetId = nodeIds[Math.floor(Math.random() * nodeIds.length)]
        
        if (sourceId !== targetId) {
          addPacket({
            id: `packet-${Date.now()}-${i}`,
            timestamp: Date.now(),
            source: sourceId,
            destination: targetId,
            protocol: Math.random() > 0.5 ? 'TCP' : 'UDP',
            size: Math.floor(Math.random() * 1500),
            port: Math.floor(Math.random() * 65535)
          })

          // Update node activity
          addNode(sourceId, {
            label: sourceId,
            lastActive: Date.now(),
            size: Math.floor(Math.random() * 20) + 5,
            color: 0x00ffff
          })

          addNode(targetId, {
            label: targetId,
            lastActive: Date.now(),
            size: Math.floor(Math.random() * 20) + 5,
            color: 0x00ffff
          })

          // Update connection activity
          addConnection({
            id: `${sourceId}-${targetId}`,
            source: sourceId,
            target: targetId,
            protocol: Math.random() > 0.5 ? 'TCP' : 'UDP',
            lastActive: Date.now()
          })
        }
      }
    }, 100) // Add packets every 100ms

    logger.log(`✅ Test data generated: ${nodeCount} nodes, ${connectionCount} connections`)

    return () => {
      clearInterval(packetInterval)
    }
  }, [enabled, nodeCount, connectionCount, addNode, addConnection, addPacket, clearNetwork])

  if (!enabled) return null

  return (
    <div style={{
      position: 'fixed',
      top: '80px',
      left: '10px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: '#00ff00',
      padding: '10px',
      border: '1px solid #00ff00',
      fontFamily: 'monospace',
      fontSize: '12px',
      zIndex: 1000
    }}>
      <div>🧪 Performance Test Mode</div>
      <div>Nodes: {nodeCount}</div>
      <div>Connections: {connectionCount}</div>
      <div>Simulating Agar.io-scale data</div>
    </div>
  )
}

// Add control to toggle test mode
export const PerformanceTestControl: React.FC = () => {
  const [testEnabled, setTestEnabled] = React.useState(false)
  const [nodeCount, setNodeCount] = React.useState(2000)
  const [connectionCount, setConnectionCount] = React.useState(3000)

  return (
    <>
      <div style={{
        position: 'fixed',
        top: '10px',
        right: '200px',
        background: 'rgba(0, 0, 0, 0.9)',
        color: '#00ff00',
        padding: '10px',
        border: '1px solid #00ff00',
        fontFamily: 'monospace',
        fontSize: '12px',
        zIndex: 1000
      }}>
        <div style={{ marginBottom: '5px' }}>Performance Test</div>
        <label style={{ display: 'block', marginBottom: '5px' }}>
          <input
            type="checkbox"
            checked={testEnabled}
            onChange={(e) => setTestEnabled(e.target.checked)}
            style={{ marginRight: '5px' }}
          />
          Enable Test Mode
        </label>
        <label style={{ display: 'block', marginBottom: '5px' }}>
          Nodes:
          <input
            type="number"
            value={nodeCount}
            onChange={(e) => setNodeCount(parseInt(e.target.value) || 1000)}
            min="100"
            max="10000"
            style={{ 
              width: '60px', 
              marginLeft: '5px',
              background: 'black',
              color: '#00ff00',
              border: '1px solid #00ff00'
            }}
          />
        </label>
        <label style={{ display: 'block' }}>
          Connections:
          <input
            type="number"
            value={connectionCount}
            onChange={(e) => setConnectionCount(parseInt(e.target.value) || 1500)}
            min="100"
            max="15000"
            style={{ 
              width: '60px', 
              marginLeft: '5px',
              background: 'black',
              color: '#00ff00',
              border: '1px solid #00ff00'
            }}
          />
        </label>
      </div>
      
      <PerformanceTestData 
        nodeCount={nodeCount}
        connectionCount={connectionCount}
        enabled={testEnabled}
      />
    </>
  )
}
