import { useEffect, useRef } from 'react'
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import { useNetworkStore } from '../stores/networkStore'
import { useSizeStore } from '../stores/sizeStore'
import React, { createContext, useContext } from 'react'

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

export const UltraSimpleGraph = () => {
  const { width, height } = useSizeStore()
  const { nodes, connections } = useNetworkStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const captureContextValue = useCaptureContext()
  
  // Store what we've rendered
  const renderedRef = useRef<{
    nodeContainers: Map<string, Container>,
    connectionLines: Map<string, Graphics>,
    nodePositions: Map<string, {x: number, y: number}>
  }>({
    nodeContainers: new Map(),
    connectionLines: new Map(),
    nodePositions: new Map()
  })
  
  const sceneRef = useRef<{
    nodeLayer: Container | null,
    connectionLayer: Container | null
  }>({
    nodeLayer: null,
    connectionLayer: null
  })

  // Initialize PIXI once
  useEffect(() => {
    if (!containerRef.current) return

    console.log('🚀 ULTRA SIMPLE: Starting PIXI init')

    const app = new Application()
    
    app.init({
      width: width || 1200,
      height: height || 800,
      backgroundColor: 0x000000,
      antialias: true
    }).then(() => {
      if (!containerRef.current) return

      console.log('✅ ULTRA SIMPLE: PIXI initialized')
      
      // Clear container and add canvas
      containerRef.current.innerHTML = ''
      containerRef.current.appendChild(app.canvas)
      
      // Create layers
      const connectionLayer = new Container()
      const nodeLayer = new Container()
      
      app.stage.addChild(connectionLayer)
      app.stage.addChild(nodeLayer)
      
      sceneRef.current = {
        connectionLayer,
        nodeLayer
      }
      appRef.current = app
      
      console.log('✅ ULTRA SIMPLE: Scene setup complete')
      
      // Start render loop
      const renderLoop = () => {
        try {
          renderNodes()
          renderConnections()
        } catch (e) {
          console.error('Render error:', e)
        }
      }
      
      app.ticker.add(renderLoop)
      
      // Initial render
      renderLoop()
      
      console.log('✅ ULTRA SIMPLE: Ready!')
    }).catch(err => {
      console.error('❌ ULTRA SIMPLE: PIXI failed:', err)
    })

    return () => {
      if (appRef.current) {
        appRef.current.destroy(true)
        appRef.current = null
      }
    }
  }, []) // No dependencies - init once

  // Render nodes function
  const renderNodes = () => {
    if (!sceneRef.current.nodeLayer) return
    
    const layer = sceneRef.current.nodeLayer
    const rendered = renderedRef.current
    
    console.log(`🎨 ULTRA SIMPLE: Rendering ${nodes.length} nodes`)
    
    // Add new nodes
    nodes.forEach(node => {
      if (!rendered.nodeContainers.has(node.id)) {
        console.log(`➕ ULTRA SIMPLE: Adding node ${node.id}`)
        
        // Generate position
        let pos = rendered.nodePositions.get(node.id)
        if (!pos) {
          pos = {
            x: 200 + Math.random() * 800,
            y: 200 + Math.random() * 400
          }
          rendered.nodePositions.set(node.id, pos)
        }
        
        // Create visual
        const container = new Container()
        
        // Green circle
        const circle = new Graphics()
        circle.clear()
        circle.beginFill(0x00ff41)
        circle.drawCircle(0, 0, 15)
        circle.endFill()
        container.addChild(circle)
        
        // Label
        if (node.label && node.label.includes('.')) {
          const text = new Text({
            text: node.label,
            style: new TextStyle({
              fontFamily: 'Arial',
              fontSize: 12,
              fill: 0x00ff41
            })
          })
          text.anchor.set(0.5, -2)
          container.addChild(text)
        }
        
        // Position and add
        container.position.set(pos.x, pos.y)
        layer.addChild(container)
        rendered.nodeContainers.set(node.id, container)
      }
    })
    
    // Clean up old nodes
    const now = Date.now()
    const toRemove: string[] = []
    
    rendered.nodeContainers.forEach((container, nodeId) => {
      const node = nodes.find(n => n.id === nodeId)
      if (!node || (now - node.lastActive) > 15000) {
        console.log(`➖ ULTRA SIMPLE: Removing node ${nodeId}`)
        layer.removeChild(container)
        container.destroy()
        toRemove.push(nodeId)
      } else {
        // Handle fading
        const age = now - node.lastActive
        if (age > 10000) {
          container.alpha = Math.max(0.2, 1 - (age - 10000) / 5000)
        } else {
          container.alpha = 1
        }
      }
    })
    
    toRemove.forEach(id => rendered.nodeContainers.delete(id))
  }

  // Render connections function
  const renderConnections = () => {
    if (!sceneRef.current.connectionLayer) return
    
    const layer = sceneRef.current.connectionLayer
    const rendered = renderedRef.current
    
    console.log(`🎨 ULTRA SIMPLE: Rendering ${connections.length} connections`)
    
    // Add new connections
    connections.forEach(connection => {
      const key = `${connection.source}-${connection.target}`
      
      if (!rendered.connectionLines.has(key)) {
        const sourcePos = rendered.nodePositions.get(connection.source)
        const targetPos = rendered.nodePositions.get(connection.target)
        
        if (sourcePos && targetPos) {
          console.log(`➕ ULTRA SIMPLE: Adding connection ${key}`)
          
          const line = new Graphics()
          line.clear()
          line.lineStyle(3, 0x00ffff, 0.8)
          line.moveTo(sourcePos.x, sourcePos.y)
          line.lineTo(targetPos.x, targetPos.y)
          
          layer.addChild(line)
          rendered.connectionLines.set(key, line)
        }
      }
    })
    
    // Clean up old connections
    const now = Date.now()
    const toRemove: string[] = []
    
    rendered.connectionLines.forEach((line, key) => {
      const connection = connections.find(c => 
        `${c.source}-${c.target}` === key || 
        `${c.target}-${c.source}` === key
      )
      
      if (!connection || (now - connection.lastActive) > 5000) {
        console.log(`➖ ULTRA SIMPLE: Removing connection ${key}`)
        layer.removeChild(line)
        line.destroy()
        toRemove.push(key)
      } else {
        // Handle fading
        const age = now - connection.lastActive
        if (age > 3000) {
          line.alpha = Math.max(0.2, 1 - (age - 3000) / 2000)
        } else {
          line.alpha = 1
        }
      }
    })
    
    toRemove.forEach(key => rendered.connectionLines.delete(key))
  }

  // Handle resize
  useEffect(() => {
    if (appRef.current && width && height) {
      console.log('📐 ULTRA SIMPLE: Resizing')
      appRef.current.renderer.resize(width, height)
    }
  }, [width, height])

  // Debug logging
  useEffect(() => {
    console.log(`📊 ULTRA SIMPLE: Mode=${captureContextValue.captureMode}, Nodes=${nodes.length}, Connections=${connections.length}`)
  }, [captureContextValue.captureMode, nodes.length, connections.length])

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        background: '#000'
      }} 
    />
  )
} 