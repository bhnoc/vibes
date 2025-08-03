import { useEffect, useRef } from 'react'
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import { useNetworkStore, Node, Connection } from '../stores/networkStore'
import { useSizeStore } from '../stores/sizeStore'
import React, { createContext, useContext } from 'react'
import { logger } from '../utils/logger'

// Create a context for capture mode
interface CaptureContextType {
  captureMode: 'real' | 'simulated' | 'unknown' | 'waiting';
  captureInterface: string;
}

export const CaptureContext = createContext<CaptureContextType>({
  captureMode: 'unknown',
  captureInterface: '',
});

export const useCaptureContext = () => useContext(CaptureContext);

export const SimpleNodeGraph = () => {
  const { width, height } = useSizeStore()
  const { nodes, connections } = useNetworkStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const captureContextValue = useCaptureContext()
  
  // Store rendered elements
  const renderedElementsRef = useRef<{
    nodes: Map<string, Container>,
    connections: Map<string, Graphics>,
    nodePositions: Map<string, {x: number, y: number}>
  }>({
    nodes: new Map(),
    connections: new Map(),
    nodePositions: new Map()
  })
  
  const containersRef = useRef<{
    nodes: Container | null,
    connections: Container | null
  }>({
    nodes: null,
    connections: null
  })

  // Initialize PIXI application
  useEffect(() => {
    if (!containerRef.current) return

    logger.log('🎯 Initializing SIMPLE NodeGraph with width:', width, 'height:', height)

    // Create PIXI application
    const app = new Application()
    
    app.init({
      width: width || 800,
      height: height || 600,
      backgroundColor: 0x000000,
      antialias: true
    }).then(() => {
      if (!containerRef.current) return

      logger.log('✅ PIXI app initialized, adding canvas to DOM')
      
      // Clear any existing content
      containerRef.current.innerHTML = ''
      
      // Add canvas to container
      containerRef.current.appendChild(app.canvas)
      
      // Create containers for nodes and connections
      const connectionsContainer = new Container()
      const nodesContainer = new Container()
      
      app.stage.addChild(connectionsContainer)
      app.stage.addChild(nodesContainer)
      
      // Store references
      containersRef.current = {
        connections: connectionsContainer,
        nodes: nodesContainer
      }
      appRef.current = app
      
      logger.log('✅ Containers created and added to stage')
      
      // Start with immediate render
      renderEverything()
      
      // Start render loop at 30fps
      app.ticker.maxFPS = 30
      app.ticker.add(renderEverything)
      
      logger.log('✅ Simple NodeGraph fully initialized')
    }).catch(err => {
      logger.error('❌ Failed to initialize PIXI app:', err)
    })

    // The render function
    function renderEverything() {
      renderNodes()
      renderConnections()
    }

    function renderNodes() {
      if (!containersRef.current.nodes) return
      
      const now = Date.now()
      const rendered = renderedElementsRef.current
      const container = containersRef.current.nodes
      
      logger.log(`🔄 Rendering ${nodes.length} nodes`)
      
      // Add new nodes
      nodes.forEach(node => {
        if (!rendered.nodes.has(node.id)) {
          logger.log(`➕ Adding node: ${node.id}`)
          
          // Generate random position if not stored
          let position = rendered.nodePositions.get(node.id)
          if (!position) {
            position = {
              x: 100 + Math.random() * (width - 200),
              y: 100 + Math.random() * (height - 200)
            }
            rendered.nodePositions.set(node.id, position)
          }
          
          // Create node container
          const nodeContainer = new Container()
          
          // Create circle
          const circle = new Graphics()
          circle.clear()
          circle.beginFill(0x00ff41) // Green
          circle.drawCircle(0, 0, 12)
          circle.endFill()
          nodeContainer.addChild(circle)
          
          // Add text label if it looks like an IP
          if (node.label && node.label.includes('.')) {
            const text = new Text({
              text: node.label,
              style: new TextStyle({
                fontFamily: 'Arial',
                fontSize: 12,
                fill: 0x00ff41
              })
            })
            text.anchor.set(0.5, -1.5)
            nodeContainer.addChild(text)
          }
          
          // Position and add to stage
          nodeContainer.position.set(position.x, position.y)
          container.addChild(nodeContainer)
          
          // Store reference
          rendered.nodes.set(node.id, nodeContainer)
        }
      })
      
      // Update visibility based on age and remove old nodes
      const nodesToRemove: string[] = []
      rendered.nodes.forEach((nodeContainer, nodeId) => {
        const node = nodes.find(n => n.id === nodeId)
        if (node) {
          const age = now - node.lastActive
          if (age > 45000) {
            // Remove after 45 seconds (15s after fade starts)
            nodesToRemove.push(nodeId)
          } else if (age > 30000) {
            // Fade after 30 seconds of no activity
            const fadeProgress = (age - 30000) / 15000
            nodeContainer.alpha = Math.max(0.1, 1 - fadeProgress)
          } else {
            nodeContainer.alpha = 1
          }
        } else {
          // Node no longer exists in store
          nodesToRemove.push(nodeId)
        }
      })
      
      // Remove old nodes
      nodesToRemove.forEach(nodeId => {
        const nodeContainer = rendered.nodes.get(nodeId)
        if (nodeContainer) {
          container.removeChild(nodeContainer)
          nodeContainer.destroy()
          rendered.nodes.delete(nodeId)
          logger.log(`➖ Removed node: ${nodeId}`)
        }
      })
    }

    function renderConnections() {
      if (!containersRef.current.connections) return
      
      const now = Date.now()
      const rendered = renderedElementsRef.current
      const container = containersRef.current.connections
      
      logger.log(`🔄 Rendering ${connections.length} connections`)
      
      // Add new connections
      connections.forEach(connection => {
        const connectionId = `${connection.source}-${connection.target}`
        
        if (!rendered.connections.has(connectionId)) {
          const sourcePos = rendered.nodePositions.get(connection.source)
          const targetPos = rendered.nodePositions.get(connection.target)
          
          if (sourcePos && targetPos) {
            logger.log(`➕ Adding connection: ${connection.source} -> ${connection.target}`)
            
            const line = new Graphics()
            line.clear()
            line.lineStyle(2, 0x00ffff, 0.7)
            line.moveTo(sourcePos.x, sourcePos.y)
            line.lineTo(targetPos.x, targetPos.y)
            
            container.addChild(line)
            rendered.connections.set(connectionId, line)
          }
        }
      })
      
      // Update connections and remove old ones
      const connectionsToRemove: string[] = []
      rendered.connections.forEach((line, connectionId) => {
        const connection = connections.find(c => 
          `${c.source}-${c.target}` === connectionId || 
          `${c.target}-${c.source}` === connectionId
        )
        
        if (connection) {
          const age = now - connection.lastActive
          if (age > 5000) {
            // Remove after 5 seconds
            connectionsToRemove.push(connectionId)
          } else if (age > 3000) {
            // Fade after 3 seconds
            const fadeProgress = (age - 3000) / 2000
            line.alpha = Math.max(0.1, 1 - fadeProgress)
          } else {
            line.alpha = 1
          }
        } else {
          // Connection no longer exists
          connectionsToRemove.push(connectionId)
        }
      })
      
      // Remove old connections
      connectionsToRemove.forEach(connectionId => {
        const line = rendered.connections.get(connectionId)
        if (line) {
          container.removeChild(line)
          line.destroy()
          rendered.connections.delete(connectionId)
          logger.log(`➖ Removed connection: ${connectionId}`)
        }
      })
    }

    // Cleanup
    return () => {
      logger.log('🧹 Cleaning up SimpleNodeGraph')
      if (appRef.current) {
        appRef.current.destroy(true)
        appRef.current = null
      }
      renderedElementsRef.current.nodes.clear()
      renderedElementsRef.current.connections.clear()
      renderedElementsRef.current.nodePositions.clear()
    }
  }, []) // Remove width/height from deps to prevent recreation

  // Handle resize separately
  useEffect(() => {
    if (appRef.current && width && height) {
      logger.log('📐 Resizing to:', width, 'x', height)
      appRef.current.renderer.resize(width, height)
    }
  }, [width, height])

  // Debug logging
  useEffect(() => {
    logger.log(`📊 SimpleNodeGraph Update: Mode=${captureContextValue.captureMode}, Nodes=${nodes.length}, Connections=${connections.length}`)
    
    // Force a render if we have data but no visuals
    if (nodes.length > 0 && appRef.current) {
      logger.log('🔄 Forcing render due to new data')
    }
  }, [captureContextValue.captureMode, nodes.length, connections.length])

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        position: 'relative',
        background: 'black'
      }} 
    />
  )
}
