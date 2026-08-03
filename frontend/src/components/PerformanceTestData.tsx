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

  return null;
}

// Add control to toggle test mode (disabled/hidden)
export const PerformanceTestControl: React.FC = () => {
  return null;
}
