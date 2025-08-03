import { useCallback, useEffect, useRef, useState } from 'react'
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

// Simple node representation
interface RenderedNode {
  id: string;
  container: Container;
  circle: Graphics;
  text?: Text;
  x: number;
  y: number;
  lastActivity: number;
}

// Simple connection representation
interface RenderedConnection {
  id: string;
  line: Graphics;
  sourceId: string;
  targetId: string;
  lastActivity: number;
}

export const NodeGraph = () => {
  const { width, height } = useSizeStore()
  const { nodes, connections } = useNetworkStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const captureContextValue = useCaptureContext()
  
  // Simple storage for rendered elements
  const renderedNodesRef = useRef<Map<string, RenderedNode>>(new Map())
  const renderedConnectionsRef = useRef<Map<string, RenderedConnection>>(new Map())
  const nodesContainerRef = useRef<Container | null>(null)
  const connectionsContainerRef = useRef<Container | null>(null)

  // Generate random position for new nodes
  const generateRandomPosition = useCallback(() => {
    const margin = 100
    const x = margin + Math.random() * (width - margin * 2)
    const y = margin + Math.random() * (height - margin * 2)
    return { x, y }
  }, [width, height])

  // Create a node visual
  const createNodeVisual = useCallback((node: Node): RenderedNode => {
    const container = new Container()
    const circle = new Graphics()
    
    // Random position if not specified
    const position = node.x !== undefined && node.y !== undefined 
      ? { x: node.x, y: node.y }
      : generateRandomPosition()
    
    // Draw circle
    circle.clear()
    circle.beginFill(0x00ff41) // Green
    circle.drawCircle(0, 0, 12)
    circle.endFill()
    
    container.addChild(circle)
    container.position.set(position.x, position.y)
    
    // Add label if it's an IP address
    let text: Text | undefined
    if (node.label && node.label.includes('.')) {
      text = new Text({
        text: node.label,
        style: new TextStyle({
          fontFamily: 'VT323, monospace',
          fontSize: 14,
          fill: 0x00ff41
        })
      })
      text.anchor.set(0.5, 2)
      container.addChild(text)
    }
    
    const renderedNode: RenderedNode = {
      id: node.id,
      container,
      circle,
      text,
      x: position.x,
      y: position.y,
      lastActivity: node.lastActive
    }
    
    return renderedNode
  }, [generateRandomPosition])

  // Create a connection visual
  const createConnectionVisual = useCallback((connection: Connection, sourceNode: RenderedNode, targetNode: RenderedNode): RenderedConnection => {
    const line = new Graphics()
    
    // Draw line between nodes
    line.clear()
    line.lineStyle(2, 0x00ffff, 0.7) // Cyan with some transparency
    line.moveTo(sourceNode.x, sourceNode.y)
    line.lineTo(targetNode.x, targetNode.y)
    
    const renderedConnection: RenderedConnection = {
      id: connection.id,
      line,
      sourceId: connection.source,
      targetId: connection.target,
      lastActivity: connection.lastActive
    }
    
    return renderedConnection
  }, [])

  // Update nodes
  const updateNodes = useCallback(() => {
    if (!nodesContainerRef.current) return
    
    const now = Date.now()
    const renderedNodes = renderedNodesRef.current
    const container = nodesContainerRef.current
    
    // Add new nodes
    nodes.forEach(node => {
      if (!renderedNodes.has(node.id)) {
        logger.log(`Adding new node: ${node.id}`)
        const renderedNode = createNodeVisual(node)
        renderedNodes.set(node.id, renderedNode)
        container.addChild(renderedNode.container)
      } else {
        // Update existing node activity
        const renderedNode = renderedNodes.get(node.id)!
        renderedNode.lastActivity = node.lastActive
      }
    })
    
    // Remove old nodes (after 15 seconds)
    const nodesToRemove: string[] = []
    renderedNodes.forEach((renderedNode, nodeId) => {
      const age = now - renderedNode.lastActivity
      if (age > 45000) { // 45 seconds (remove after 15s fade)
        logger.log(`Removing old node: ${nodeId}`)
        container.removeChild(renderedNode.container)
        renderedNode.container.destroy()
        nodesToRemove.push(nodeId)
      } else if (age > 30000) {
        // Start fading after 30 seconds of no activity
        const fadeProgress = (age - 30000) / 15000 // 15 second fade
        renderedNode.container.alpha = 1 - fadeProgress
      } else {
        // Full opacity
        renderedNode.container.alpha = 1
      }
    })
    
    // Remove from map
    nodesToRemove.forEach(nodeId => renderedNodes.delete(nodeId))
  }, [nodes, createNodeVisual])

  // Update connections
  const updateConnections = useCallback(() => {
    if (!connectionsContainerRef.current) return
    
    const now = Date.now()
    const renderedConnections = renderedConnectionsRef.current
    const renderedNodes = renderedNodesRef.current
    const container = connectionsContainerRef.current
    
    // Add new connections
    connections.forEach(connection => {
      const sourceNode = renderedNodes.get(connection.source)
      const targetNode = renderedNodes.get(connection.target)
      
      if (sourceNode && targetNode && !renderedConnections.has(connection.id)) {
        logger.log(`Adding new connection: ${connection.source} -> ${connection.target}`)
        const renderedConnection = createConnectionVisual(connection, sourceNode, targetNode)
        renderedConnections.set(connection.id, renderedConnection)
        container.addChild(renderedConnection.line)
      } else if (renderedConnections.has(connection.id)) {
        // Update existing connection activity
        const renderedConnection = renderedConnections.get(connection.id)!
        renderedConnection.lastActivity = connection.lastActive
      }
    })
    
    // Remove old connections (after 5 seconds)
    const connectionsToRemove: string[] = []
    renderedConnections.forEach((renderedConnection, connectionId) => {
      const age = now - renderedConnection.lastActivity
      if (age > 5000) { // 5 seconds for connections
        logger.log(`Removing old connection: ${connectionId}`)
        container.removeChild(renderedConnection.line)
        renderedConnection.line.destroy()
        connectionsToRemove.push(connectionId)
      } else if (age > 3000) {
        // Start fading after 3 seconds
        const fadeProgress = (age - 3000) / 2000 // 2 second fade
        renderedConnection.line.alpha = 1 - fadeProgress
      } else {
        // Full opacity
        renderedConnection.line.alpha = 1
      }
    })
    
    // Remove from map
    connectionsToRemove.forEach(connectionId => renderedConnections.delete(connectionId))
  }, [connections, createConnectionVisual])

  // Main render loop
  const renderScene = useCallback(() => {
    updateNodes()
    updateConnections()
  }, [updateNodes, updateConnections])

  // Initialize PIXI application
  useEffect(() => {
    if (!containerRef.current) return

    logger.log('🎯 Initializing simple NodeGraph')

    // Create PIXI application
    const app = new Application()
    
    app.init({
      width: width,
      height: height,
      backgroundColor: 0x000000,
      antialias: true
    }).then(() => {
      if (!containerRef.current) return

      // Add canvas to container
      containerRef.current.appendChild(app.canvas)
      
      // Create containers for nodes and connections
      const connectionsContainer = new Container()
      const nodesContainer = new Container()
      
      app.stage.addChild(connectionsContainer)
      app.stage.addChild(nodesContainer)
      
      // Store references
      connectionsContainerRef.current = connectionsContainer
      nodesContainerRef.current = nodesContainer
      appRef.current = app
      
      // Start render loop at 30fps
      app.ticker.maxFPS = 30
      app.ticker.add(renderScene)
      
      logger.log('✅ Simple NodeGraph initialized successfully')
    }).catch(err => {
      logger.error('❌ Failed to initialize PIXI app:', err)
    })

    // Cleanup
    return () => {
      if (appRef.current) {
        appRef.current.destroy(true)
        appRef.current = null
      }
      renderedNodesRef.current.clear()
      renderedConnectionsRef.current.clear()
    }
  }, [width, height, renderScene])

  // Handle resize
  useEffect(() => {
    if (appRef.current) {
      appRef.current.renderer.resize(width, height)
    }
  }, [width, height])

  // Debug logging
  useEffect(() => {
    logger.log(`📊 NodeGraph: Mode=${captureContextValue.captureMode}, Nodes=${nodes.length}, Connections=${connections.length}`)
  }, [captureContextValue.captureMode, nodes.length, connections.length])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
