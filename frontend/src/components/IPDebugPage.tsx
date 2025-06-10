import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Application, Graphics, Text, Container } from 'pixi.js'
import { usePacketStore } from '../stores/packetStore'

interface IPNode {
  ip: string
  x: number
  y: number
  isActive: boolean
  timeoutId?: number
  lastSeen: number
  graphics?: Graphics
  text?: Text
  ring?: Graphics
  container?: Container
}

export const IPDebugPage: React.FC = () => {
  const [nodes, setNodes] = useState<Map<string, IPNode>>(new Map())
  const canvasRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  
  // Use the existing packet store from App.tsx
  const { packets } = usePacketStore()

  // Initialize PIXI Application
  useEffect(() => {
    if (!canvasRef.current) return

    const initApp = async () => {
      try {
        console.log('🎨 Initializing PIXI Application...')
        
        // Try PIXI v8+ async initialization first
        const app = new Application()
        
        // Check if the app has an init method (PIXI v8+)
        if (typeof (app as any).init === 'function') {
          console.log('🎨 Using PIXI v8+ async initialization')
          await (app as any).init({
            width: window.innerWidth,
            height: window.innerHeight - 100,
            backgroundColor: 0x000000,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true
          })
        } else {
          console.log('🎨 PIXI v8+ init method not found, trying fallback')
          throw new Error('No init method, trying fallback')
        }

        appRef.current = app
        
        // Get canvas - try multiple properties for different PIXI versions
        const canvas = (app as any).canvas || (app as any).view || app.renderer?.view
        console.log('🎨 Canvas found:', !!canvas)
        
        if (canvas && canvasRef.current) {
          canvasRef.current.appendChild(canvas)
          console.log('🎨 Canvas successfully appended to DOM')
        } else {
          throw new Error('No canvas found')
        }

        const handleResize = () => {
          app.renderer.resize(window.innerWidth, window.innerHeight - 100)
        }
        window.addEventListener('resize', handleResize)

        return () => {
          window.removeEventListener('resize', handleResize)
          app.destroy(true, { children: true, texture: true })
        }
      } catch (error) {
        console.error('PIXI v8+ initialization failed:', error)
        
        // Fallback: try PIXI v7 style synchronous initialization
        try {
          console.log('🎨 Trying PIXI v7 synchronous initialization')
          const app = new Application({
            width: window.innerWidth,
            height: window.innerHeight - 100,
            backgroundColor: 0x000000,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true
          })

          appRef.current = app
          
          // Try different view properties for older versions
          const canvas = (app as any).view || (app as any).canvas || app.renderer?.view
          console.log('🎨 Fallback canvas found:', !!canvas)
          
          if (canvas && canvasRef.current) {
            canvasRef.current.appendChild(canvas)
            console.log('🎨 Fallback canvas successfully appended to DOM')
          } else {
            console.error('🎨 No canvas found in fallback mode either')
            return
          }

          const handleResize = () => {
            app.renderer.resize(window.innerWidth, window.innerHeight - 100)
          }
          window.addEventListener('resize', handleResize)

          return () => {
            window.removeEventListener('resize', handleResize)
            app.destroy(true, { children: true, texture: true })
          }
        } catch (fallbackError) {
          console.error('🎨 Both PIXI initialization methods failed:', fallbackError)
          
          // Create a fallback HTML5 canvas as last resort
          console.log('🎨 Creating fallback HTML5 canvas')
          const canvas = document.createElement('canvas')
          canvas.width = window.innerWidth
          canvas.height = window.innerHeight - 100
          canvas.style.backgroundColor = 'black'
          if (canvasRef.current) {
            canvasRef.current.appendChild(canvas)
          }
          
          // Create a minimal fallback context
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.fillStyle = '#22c55e'
            ctx.font = '16px monospace'
            ctx.fillText('PIXI.js failed to initialize - fallback canvas active', 10, 30)
            ctx.fillText('IP nodes will not render without PIXI.js', 10, 50)
          }
        }
      }
    }

    let cleanup: (() => void) | undefined
    initApp().then(cleanupFn => {
      cleanup = cleanupFn
    })

    return () => {
      if (cleanup) cleanup()
    }
  }, [])

  // Function to generate random position for new IP
  const generateRandomPosition = useCallback(() => {
    if (!appRef.current) return { x: 50, y: 50 }
    
    const width = appRef.current.screen.width
    const height = appRef.current.screen.height
    
    const margin = 80
    const x = Math.random() * (width - 2 * margin) + margin
    const y = Math.random() * (height - 2 * margin) + margin
    
    return { x, y }
  }, [])

  // Function to create PIXI graphics for an IP node
  const createNodeGraphics = useCallback((node: IPNode) => {
    if (!appRef.current) return

    const app = appRef.current
    const container = new Container()
    
    const circle = new Graphics()
    const radius = node.isActive ? 28 : 24  // Smaller circles
    
    if (node.isActive) {
      circle.beginFill(0x22c55e)
      circle.lineStyle(2, 0x4ade80, 1)
    } else {
      circle.beginFill(0x4b5563)
      circle.lineStyle(1, 0x6b7280, 1)
    }
    
    circle.drawCircle(0, 0, radius)
    circle.endFill()
    
    const text = new Text(node.ip.split('.').slice(-2).join('.'), {
      fontFamily: 'monospace',
      fontSize: 10,
      fill: node.isActive ? 0x22c55e : 0x9ca3af,
      align: 'center',
      fontWeight: 'bold'
    })
    text.anchor.set(0.5)
    text.y = radius + 15  // Position text below the circle
    
    let ring: Graphics | undefined
    if (node.isActive) {
      ring = new Graphics()
      ring.lineStyle(3, 0x22c55e, 0.8)
      ring.drawCircle(0, 0, 45)  // Smaller ring too
      container.addChild(ring)
      
      let scale = 1
      let growing = true
      const animate = () => {
        if (growing) {
          scale += 0.02
          if (scale >= 1.3) growing = false
        } else {
          scale -= 0.02
          if (scale <= 1) growing = true
        }
        if (ring) {
          ring.scale.set(scale)
          ring.alpha = 1 - (scale - 1) * 2
        }
        if (node.isActive && ring) {
          requestAnimationFrame(animate)
        }
      }
      animate()
    }
    
    container.addChild(circle)
    container.addChild(text)
    container.x = node.x
    container.y = node.y
    
    // Set z-index for layering - active nodes on top
    container.zIndex = node.isActive ? 100 : 1
    
    app.stage.addChild(container)
    app.stage.sortChildren()  // Sort children by zIndex
    
    node.graphics = circle
    node.text = text
    node.ring = ring
    node.container = container
    
    console.log('🎨 Created PIXI graphics for IP:', node.ip, 'at', node.x, node.y)
  }, [])

  // Function to update node graphics
  const updateNodeGraphics = useCallback((node: IPNode) => {
    if (!node.graphics || !node.text || !node.container || !appRef.current) return
    
    const radius = node.isActive ? 28 : 24  // Smaller circles
    
    node.graphics.clear()
    if (node.isActive) {
      node.graphics.beginFill(0x22c55e)
      node.graphics.lineStyle(2, 0x4ade80, 1)
    } else {
      node.graphics.beginFill(0x4b5563)
      node.graphics.lineStyle(1, 0x6b7280, 1)
    }
    node.graphics.drawCircle(0, 0, radius)
    node.graphics.endFill()
    
    // Update text color and position
    node.text.style.fill = node.isActive ? 0x22c55e : 0x9ca3af
    node.text.y = radius + 15  // Position text below the circle
    
    // Update z-index - active nodes come to front
    node.container.zIndex = node.isActive ? 100 : 1
    appRef.current.stage.sortChildren()  // Re-sort to bring active nodes to top
    
    if (node.isActive && !node.ring) {
      const ring = new Graphics()
      ring.lineStyle(3, 0x22c55e, 0.8)
      ring.drawCircle(0, 0, 45)  // Smaller ring
      node.container.addChildAt(ring, 0)
      node.ring = ring
      
      let scale = 1
      let growing = true
      const animate = () => {
        if (growing) {
          scale += 0.02
          if (scale >= 1.3) growing = false
        } else {
          scale -= 0.02
          if (scale <= 1) growing = true
        }
        if (ring) {
          ring.scale.set(scale)
          ring.alpha = 1 - (scale - 1) * 2
        }
        if (node.isActive && ring) {
          requestAnimationFrame(animate)
        }
      }
      animate()
    } else if (!node.isActive && node.ring) {
      node.container.removeChild(node.ring)
      node.ring.destroy()
      node.ring = undefined
    }
  }, [])

  // Function to activate or reactivate an IP node
  const activateNode = useCallback((ip: string) => {
    setNodes(prevNodes => {
      const newNodes = new Map(prevNodes)
      const existingNode = newNodes.get(ip)
      
      if (existingNode) {
        if (existingNode.timeoutId) {
          clearTimeout(existingNode.timeoutId)
        }
        
        const timeoutId = setTimeout(() => {
          setNodes(currentNodes => {
            const updatedNodes = new Map(currentNodes)
            const nodeToUpdate = updatedNodes.get(ip)
            if (nodeToUpdate) {
              nodeToUpdate.isActive = false
              nodeToUpdate.timeoutId = undefined
              updateNodeGraphics(nodeToUpdate)
              updatedNodes.set(ip, nodeToUpdate)
            }
            return updatedNodes
          })
        }, 5000)
        
        existingNode.isActive = true
        existingNode.timeoutId = timeoutId
        existingNode.lastSeen = Date.now()
        updateNodeGraphics(existingNode)
        newNodes.set(ip, existingNode)
      } else {
        const position = generateRandomPosition()
        
        const timeoutId = setTimeout(() => {
          setNodes(currentNodes => {
            const updatedNodes = new Map(currentNodes)
            const nodeToUpdate = updatedNodes.get(ip)
            if (nodeToUpdate) {
              nodeToUpdate.isActive = false
              nodeToUpdate.timeoutId = undefined
              updateNodeGraphics(nodeToUpdate)
              updatedNodes.set(ip, nodeToUpdate)
            }
            return updatedNodes
          })
        }, 5000)
        
        const newNode: IPNode = {
          ip,
          x: position.x,
          y: position.y,
          isActive: true,
          timeoutId,
          lastSeen: Date.now()
        }
        
        newNodes.set(ip, newNode)
        setTimeout(() => createNodeGraphics(newNode), 0)
      }
      
      return newNodes
    })
  }, [generateRandomPosition, createNodeGraphics, updateNodeGraphics])

  // Watch for new packets from the existing store
  useEffect(() => {
    if (packets.length === 0) return
    
    console.log(`📦 Processing ${packets.length} packets from store`)
    
    // Process the latest packets
    packets.slice(-5).forEach(packet => {
      // Extract IPs from source and destination
      const ips: string[] = []
      if (packet.src && /^\d+\.\d+\.\d+\.\d+$/.test(packet.src)) {
        ips.push(packet.src)
      }
      if (packet.dst && /^\d+\.\d+\.\d+\.\d+$/.test(packet.dst)) {
        ips.push(packet.dst)
      }
      
      // Activate nodes for each IP
      ips.forEach(ip => {
        console.log(`🔥 Activating IP from packet store: ${ip}`)
        activateNode(ip)
      })
    })
  }, [packets, activateNode])

  // Clear all nodes
  const handleClear = () => {
    nodes.forEach(node => {
      if (node.timeoutId) {
        clearTimeout(node.timeoutId)
      }
      if (appRef.current && node.container) {
        appRef.current.stage.removeChild(node.container)
        node.container.destroy({ children: true })
      }
    })
    setNodes(new Map())
  }

  // Test function
  const handleTestIP = () => {
    const testIPs = ['192.168.1.1', '10.0.0.1', '172.16.0.1', '8.8.8.8', '1.1.1.1']
    const randomIP = testIPs[Math.floor(Math.random() * testIPs.length)]
    console.log(`🧪 Testing with IP: ${randomIP}`)
    activateNode(randomIP)
  }

  return (
    <div className="w-full h-screen bg-black text-green-400 relative overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-black bg-opacity-90 border-b border-green-400 p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-mono">IP Debug Visualizer (Shared WebSocket)</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={handleClear}
              className="px-3 py-1 bg-red-900 hover:bg-red-800 text-red-300 rounded text-sm"
            >
              Clear
            </button>
            <button
              onClick={handleTestIP}
              className="px-3 py-1 bg-blue-900 hover:bg-blue-800 text-blue-300 rounded text-sm"
            >
              Test IP
            </button>
          </div>
        </div>
        
        <div className="mt-2 text-xs text-green-600">
          Packets in Store: {packets.length} | Active Nodes: {Array.from(nodes.values()).filter(n => n.isActive).length} | Total Nodes: {nodes.size}
        </div>
      </div>

      {/* PIXI Canvas Container */}
      <div 
        ref={canvasRef}
        className="w-full h-full pt-20"
        style={{ position: 'absolute', top: '80px', left: 0, right: 0, bottom: 0 }}
      />
    </div>
  )
} 