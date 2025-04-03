import { useCallback, useEffect, useRef, useState } from 'react'
import { Application, Container } from 'pixi.js'
import { Graphics } from 'pixi.js'
import { Text, TextStyle, TextStyleAlign } from 'pixi.js'
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

// Helper to use the capture context
export const useCaptureContext = () => useContext(CaptureContext);

// Additional context values from app state
interface AppStateValues {
  captureError: string | null;
  requestedInterface: string;
}

// Helper function to extract data directly from URL
const getRequestedCaptureMode = (): { isRealRequested: boolean, requestedInterface: string } => {
  const url = new URL(window.location.href);
  const wsParam = url.searchParams.get('ws');
  
  if (wsParam && wsParam.includes('interface=')) {
    const interfacePart = wsParam.split('interface=')[1];
    const interfaceName = interfacePart.split('&')[0]; // Handle any additional params
    return { isRealRequested: true, requestedInterface: interfaceName };
  }
  
  return { isRealRequested: false, requestedInterface: '' };
};

// Helper to format node labels like IP addresses
const formatNodeLabel = (label: string): string => {
  // Check if this looks like an IP address
  const isIP = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(label);
  
  // For IP addresses, display them as-is
  if (isIP) {
    return label;
  }
  
  // For other labels, limit length and add ellipsis if needed
  if (label.length > 15) {
    return label.substring(0, 12) + '...';
  }
  
  return label;
};

// Helper to detect if we're likely using simulated data
const detectSimulatedData = (nodes: any[]): boolean => {
  // If empty, can't tell
  if (nodes.length === 0) return false;
  
  // Check if we have likely "client/server" naming pattern or known fake IPs
  const simulatedPatterns = [
    /^client-\d+$/,
    /^server-\d+$/,
    /^gateway$/,
    /^internet$/,
    /^database$/,
    /^webserver$/,
    /^fileserver$/
  ];
  
  // Look for private IP ranges in 192.168.1.* or 10.0.0.*
  const knownSimIPs = [
    /^192\.168\.1\.\d+$/,
    /^10\.0\.0\.\d+$/
  ];
  
  // Sample a few nodes to check for patterns
  const sampleSize = Math.min(5, nodes.length);
  let simulatedCount = 0;
  
  for (let i = 0; i < sampleSize; i++) {
    const nodeId = nodes[i].id;
    const nodeLabel = nodes[i].label || nodeId;
    
    // Check string patterns
    for (const pattern of simulatedPatterns) {
      if (pattern.test(nodeId) || pattern.test(nodeLabel)) {
        simulatedCount++;
        break;
      }
    }
    
    // Check if using our known simulated IP ranges
    for (const ipPattern of knownSimIPs) {
      if (ipPattern.test(nodeId) || ipPattern.test(nodeLabel)) {
        simulatedCount++;
        break;
      }
    }
  }
  
  // If majority of sampled nodes match patterns, likely simulated
  return simulatedCount >= sampleSize / 2;
};

// Helper to format connection details for tooltip
const formatConnectionDetails = (connection: any): string => {
  const timestamp = new Date(connection.timestamp * 1000);
  const timeString = timestamp.toLocaleTimeString();
  
  return `${connection.source} → ${connection.target}
Protocol: ${connection.protocol}
Size: ${connection.size} bytes
Time: ${timeString}`;
};

export const NodeGraph = () => {
  const { nodes, connections } = useNetworkStore()
  const { width, height } = useSizeStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const animTimeRef = useRef<number>(0)
  const [renderStats, setRenderStats] = useState({ nodes: 0, connections: 0 })
  const [renderError, setRenderError] = useState<string | null>(null)
  const { captureMode } = useCaptureContext()
  const [errorState, setErrorState] = useState<{type: string, message: string} | null>(null);
  
  // Check if URL suggests real mode but we're showing simulation
  useEffect(() => {
    const { isRealRequested, requestedInterface } = getRequestedCaptureMode();
    const urlError = document.getElementById('ws-error')?.textContent || '';
    
    if (isRealRequested && captureMode === 'simulated' && urlError) {
      setErrorState({
        type: 'mode_mismatch',
        message: `Requested real capture on ${requestedInterface} but showing simulation data instead. ${urlError}`
      });
    } else {
      setErrorState(null);
    }
  }, [captureMode]);
  
  // Initialize PixiJS app on mount
  useEffect(() => {
    if (!containerRef.current) return
    
    try {
      console.log("Initializing PixiJS application...")
      
      // Create a new PIXI Application with explicit dimensions
      const app = new Application()
      
      // Initialize the application with specific parameters
      app.init({
        background: '#000000', 
        width: width || window.innerWidth,
        height: height || window.innerHeight,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
      }).then(() => {
        // Add the canvas to the container
        if (containerRef.current) {
          containerRef.current.appendChild(app.canvas)
          console.log("PixiJS application initialized successfully and canvas added to DOM")
          console.log("Canvas dimensions:", app.canvas.width, "x", app.canvas.height)
          console.log("Stage children count:", app.stage.children.length)
        }
        
        // Store the app reference for later use
        appRef.current = app
        
        // Set up animation ticker
        app.ticker.add(() => {
          // Update animation time
          animTimeRef.current += 0.01;
          
          // Get current data from store
          const currentNodes = useNetworkStore.getState().nodes;
          const currentConnections = useNetworkStore.getState().connections;
          
          // Only render if we have nodes
          if (currentNodes.length > 0) {
            renderNetwork(app, currentNodes, currentConnections, animTimeRef.current);
          }
        });
        
        // Force an initial render
        const currentNodes = useNetworkStore.getState().nodes
        const currentConnections = useNetworkStore.getState().connections
        console.log(`Initial state: ${currentNodes.length} nodes, ${currentConnections.length} connections`)
        
        if (currentNodes.length > 0) {
          console.log("Rendering initial nodes:", currentNodes)
          renderNetwork(app, currentNodes, currentConnections, 0)
        }
      }).catch(err => {
        console.error("Error initializing PixiJS app:", err)
        setRenderError(`Error initializing PixiJS: ${err.message}`)
      })
    } catch (err: any) {
      console.error("Error creating PixiJS application:", err)
      setRenderError(`Error creating PixiJS application: ${err.message}`)
    }
    
    // Cleanup on unmount
    return () => {
      if (appRef.current) {
        console.log("Destroying PixiJS application")
        appRef.current.destroy()
        appRef.current = null
      }
    }
  }, [])
  
  // Separate function to render the network
  const renderNetwork = useCallback((app: Application, nodes: any[], connections: any[], animTime: number = 0) => {
    try {
      // Only log occasionally to avoid console spam
      if (Math.floor(animTime * 10) % 30 === 0) {
        console.log(`Rendering network with ${nodes.length} nodes and ${connections.length} connections`)
      }
      
      // Clear previous content
      while(app.stage.children.length > 0) {
        app.stage.removeChildAt(0)
      }
      
      // Memory usage optimization: limit number of rendered elements
      const MAX_RENDER_NODES = 50;
      const MAX_RENDER_CONNECTIONS = 75;
      
      // Take only the most recent nodes and connections if over limit
      const nodesToRender = nodes.length > MAX_RENDER_NODES 
        ? nodes.slice(-MAX_RENDER_NODES) 
        : nodes;
        
      const connectionsToRender = connections.length > MAX_RENDER_CONNECTIONS 
        ? connections.slice(-MAX_RENDER_CONNECTIONS) 
        : connections;
      
      // Root container
      const rootContainer = new Container()
      app.stage.addChild(rootContainer)
      
      // Add a clear "SIMULATED DATA" warning if we're in simulation mode
      if (captureMode === 'simulated') {
        const simulationMarker = new Text({
          text: "SIMULATED NETWORK DATA",
          style: new TextStyle({
            fontFamily: 'VT323, monospace',
            fontSize: 16,
            fill: 0xff3333,
            fontWeight: 'bold'
          })
        });
        simulationMarker.position.set(app.screen.width - 220, 10);
        rootContainer.addChild(simulationMarker);
        
        // If we're in simulation due to error, add extra warning
        if (errorState && errorState.type === 'mode_mismatch') {
          const errorMarker = new Text({
            text: "⚠️ REAL CAPTURE FAILED - CHECK PERMISSIONS",
            style: new TextStyle({
              fontFamily: 'VT323, monospace',
              fontSize: 20,
              fill: 0xff0000,
              fontWeight: 'bold'
            })
          });
          
          errorMarker.position.set(app.screen.width / 2 - errorMarker.width / 2, 40);
          rootContainer.addChild(errorMarker);
        }
      } else if (captureMode === 'real') {
        // For real capture, show which interface we're using
        const interfaceInfo = useCaptureContext().captureInterface;
        
        // Check if we have any real packets in our data
        const hasRealPackets = connections.some(conn => conn.source === 'real');
        
        const realMarker = new Text({
          text: hasRealPackets 
            ? `✅ REAL CAPTURE ON ${interfaceInfo.toUpperCase()}`
            : `⚠️ REAL CAPTURE REQUESTED BUT NO REAL DATA RECEIVED YET`,
          style: new TextStyle({
            fontFamily: 'VT323, monospace',
            fontSize: 16,
            fill: hasRealPackets ? 0x00ff00 : 0xffff00,
            fontWeight: 'bold'
          })
        });
        realMarker.position.set(app.screen.width - 420, 10);
        rootContainer.addChild(realMarker);
        
        // If we have real packets, add a debug counter
        if (hasRealPackets) {
          const realCount = connections.filter(conn => conn.source === 'real').length;
          const simCount = connections.filter(conn => conn.source === 'simulated').length;
          const unknownCount = connections.length - realCount - simCount;
          
          const countText = new Text({
            text: `Real packets: ${realCount}, Simulated: ${simCount}, Unknown: ${unknownCount}`,
            style: new TextStyle({
              fontFamily: 'VT323, monospace',
              fontSize: 12,
              fill: 0x00ff00
            })
          });
          countText.position.set(app.screen.width - 420, 30);
          rootContainer.addChild(countText);
        }
      } else if (captureMode === 'waiting') {
        // Display a message when in waiting mode
        const waitingMarker = new Text({
          text: "SELECT CAPTURE MODE TO BEGIN",
          style: new TextStyle({
            fontFamily: 'VT323, monospace',
            fontSize: 24,
            fill: 0x00ffff,
            fontWeight: 'bold'
          })
        });
        
        waitingMarker.position.set(
          app.screen.width / 2 - waitingMarker.width / 2, 
          app.screen.height / 2 - 50
        );
        rootContainer.addChild(waitingMarker);
        
        const instructionsText = new Text({
          text: "Use the settings panel to choose real or simulated capture",
          style: new TextStyle({
            fontFamily: 'VT323, monospace',
            fontSize: 16,
            fill: 0x00ffff
          })
        });
        
        instructionsText.position.set(
          app.screen.width / 2 - instructionsText.width / 2, 
          app.screen.height / 2
        );
        rootContainer.addChild(instructionsText);
        
        // Return early - don't draw nodes or connections in waiting mode
        setRenderStats({ nodes: 0, connections: 0 });
        return;
      }
      
      // Create connections - ONLY ONCE for all connections
      const connectionsGraphics = new Graphics()
      rootContainer.addChild(connectionsGraphics)
      
      // Draw connections
      let drawnConnections = 0
      connectionsToRender.forEach(connection => {
        const sourceNode = nodesToRender.find(n => n.id === connection.source)
        const targetNode = nodesToRender.find(n => n.id === connection.target)
        
        if (!sourceNode || !targetNode) {
          return
        }
        
        // Set line style based on protocol
        let lineColor: number;
        switch(connection.protocol) {
          case 'TCP':
            lineColor = 0x00ff00 // Green
            break
          case 'UDP':
            lineColor = 0xff00ff // Magenta
            break
          case 'ICMP':
            lineColor = 0x00ffff // Cyan
            break
          default:
            lineColor = 0xffffff // White
        }
        
        // Pulse effect for line alpha
        const pulseAlpha = 0.3 + Math.sin(animTime * 3 + connection.timestamp * 0.001) * 0.2;
        
        // Using updated v8 API with bolder lines
        connectionsGraphics.setStrokeStyle({
          width: 2, // Thinner lines for better performance
          color: lineColor,
          alpha: pulseAlpha
        });
        
        connectionsGraphics.moveTo(sourceNode.x, sourceNode.y)
        connectionsGraphics.lineTo(targetNode.x, targetNode.y)
        connectionsGraphics.stroke()
        drawnConnections++;

        // Only add tooltips for up to 20 connections (performance optimization)
        if (drawnConnections <= 20) {
          // Add a hitArea (invisible line with larger width) for interaction
          const hitAreaGraphics = new Graphics();
          hitAreaGraphics.setStrokeStyle({
            width: 20, // Wider for easier interaction
            color: 0xFFFFFF, 
            alpha: 0.001 // Almost invisible
          });
          
          hitAreaGraphics.moveTo(sourceNode.x, sourceNode.y);
          hitAreaGraphics.lineTo(targetNode.x, targetNode.y);
          hitAreaGraphics.stroke();
          
          // Make it interactive
          hitAreaGraphics.eventMode = 'static';
          hitAreaGraphics.cursor = 'pointer';
          
          // Connection tooltip on hover
          const tooltipStyle = new TextStyle({
            fontFamily: 'VT323, monospace',
            fontSize: 14,
            fill: 0xffffff,
          });
          
          // Calculate center position of the line for tooltip
          const centerX = (sourceNode.x + targetNode.x) / 2;
          const centerY = (sourceNode.y + targetNode.y) / 2;
          
          // Create tooltip text (not added to stage yet)
          const tooltip = new Text({
            text: formatConnectionDetails(connection),
            style: tooltipStyle
          });
          tooltip.anchor.set(0.5, 1);
          tooltip.position.set(centerX, centerY - 15);
          tooltip.visible = false; // Hide initially
          
          // Create tooltip background
          const tooltipBg = new Graphics();
          tooltipBg.beginFill(0x000000, 0.8);
          tooltipBg.lineStyle(1, lineColor, 0.8);
          tooltipBg.drawRoundedRect(
            -tooltip.width/2 - 10, 
            -tooltip.height - 10, 
            tooltip.width + 20, 
            tooltip.height + 15, 
            5
          );
          tooltipBg.endFill();
          tooltipBg.visible = false; // Hide initially
          
          // Add tooltip parts to a container for positioning
          const tooltipContainer = new Container();
          tooltipContainer.position.set(centerX, centerY - 15);
          tooltipContainer.addChild(tooltipBg);
          tooltipContainer.addChild(tooltip);
          tooltipContainer.visible = false;
          
          rootContainer.addChild(tooltipContainer);
          
          // Show/hide tooltip on hover
          hitAreaGraphics.on('pointerover', () => {
            tooltipContainer.visible = true;
            // Highlight this connection
            connectionsGraphics.setStrokeStyle({
              width: 5,
              color: lineColor,
              alpha: 0.9
            });
          });
          
          hitAreaGraphics.on('pointerout', () => {
            tooltipContainer.visible = false;
            // Reset style on next frame
          });
          
          rootContainer.addChild(hitAreaGraphics);
        }
      })
      
      // Create text style for labels
      const textStyle = new TextStyle({
        fontFamily: 'VT323, monospace',
        fontSize: 14,
        fill: 0x00ff41, // Green text
        align: 'center' as TextStyleAlign,
      });
      
      // Draw nodes
      let drawnNodes = 0
      nodesToRender.forEach(node => {
        const nodeContainer = new Container()
        nodeContainer.position.set(node.x, node.y)
        rootContainer.addChild(nodeContainer)
        
        // Node circle
        const nodeGraphics = new Graphics()
        
        // Pulse size for nodes - less aggressive pulsing
        const pulseSize = (node.size || 10) + Math.sin(animTime * 1.5) * 1.5;
        const pulseAlpha = 0.7 + Math.sin(animTime * 2) * 0.2;
        
        // Simplified node rendering
        nodeGraphics.setFillStyle({
          color: node.color || 0x00ff41,
          alpha: 0.8
        });
        nodeGraphics.circle(0, 0, pulseSize);
        nodeGraphics.fill();
        
        // Single outer glow instead of multiple
        nodeGraphics.setStrokeStyle({
          width: 2,
          color: node.color || 0x00ff41,
          alpha: pulseAlpha
        });
        nodeGraphics.circle(0, 0, pulseSize + 6);
        nodeGraphics.stroke();
        
        // Make it interactive
        nodeGraphics.eventMode = 'static'
        nodeGraphics.cursor = 'pointer'
        
        nodeContainer.addChild(nodeGraphics)
        
        // Node label - only if close enough to screen center (performance optimization)
        const centerX = app.screen.width / 2;
        const centerY = app.screen.height / 2;
        const distanceToCenter = Math.sqrt(Math.pow(node.x - centerX, 2) + Math.pow(node.y - centerY, 2));
        const showLabel = distanceToCenter < app.screen.width * 0.4; // Only show labels in center area
        
        if (showLabel) {
          const nodeLabel = new Text({
            text: formatNodeLabel(node.label || node.id),
            style: textStyle
          });
          nodeLabel.anchor.set(0.5, 0)
          nodeLabel.position.set(0, pulseSize + 10)
          nodeContainer.addChild(nodeLabel)
        }
        
        drawnNodes++;
      })
      
      // Update render stats
      setRenderStats({
        nodes: drawnNodes,
        connections: drawnConnections
      })
      
      // Add a visible indicator of render limits
      if (nodes.length > MAX_RENDER_NODES || connections.length > MAX_RENDER_CONNECTIONS) {
        const limitWarning = new Text({
          text: `Showing ${drawnNodes}/${nodes.length} nodes, ${drawnConnections}/${connections.length} connections`,
          style: new TextStyle({
            fontFamily: 'VT323, monospace',
            fontSize: 14, 
            fill: 0xffaa00,
            fontWeight: 'bold'
          })
        });
        limitWarning.position.set(app.screen.width / 2 - limitWarning.width / 2, app.screen.height - 30);
        rootContainer.addChild(limitWarning);
      }
      
      // Add memory usage display if available
      if (window.performance && (window.performance as any).memory) {
        const memoryInfo = (window.performance as any).memory;
        const usedHeapMB = Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024);
        const totalHeapMB = Math.round(memoryInfo.totalJSHeapSize / 1024 / 1024);
        
        const memoryText = new Text({
          text: `Memory: ${usedHeapMB}MB / ${totalHeapMB}MB`,
          style: new TextStyle({
            fontFamily: 'monospace',
            fontSize: 12,
            fill: usedHeapMB > totalHeapMB * 0.8 ? 0xff0000 : 0x00ff00
          })
        });
        memoryText.position.set(10, 30);
        rootContainer.addChild(memoryText);
      }
      
    } catch (err: any) {
      console.error("Error in renderNetwork:", err)
      setRenderError(`Error rendering network: ${err.message}`)
    }
  }, [captureMode, errorState])
  
  // Update the canvas when nodes or connections change
  useEffect(() => {
    if (!appRef.current) {
      console.log("No PixiJS app reference when trying to update canvas")
      return
    }
    
    console.log(`Updating canvas with ${nodes.length} nodes and ${connections.length} connections`)
    // No need to call renderNetwork here - the ticker will handle it
    
  }, [nodes, connections])
  
  // Update canvas size when window size changes
  useEffect(() => {
    if (!appRef.current || !containerRef.current) return
    
    console.log(`Resizing canvas to ${width}x${height}`)
    appRef.current.renderer.resize(width, height)
  }, [width, height])
  
  return (
    <>
      {/* PixiJS container */}
      <div 
        ref={containerRef} 
        className="absolute inset-0"
        style={{ 
          zIndex: 0,
          width: '100%',
          height: '100%',
          position: 'absolute',
          overflow: 'hidden',
          background: '#000'
        }}
      ></div>
      
      {/* Debug overlay for render errors */}
      {renderError && (
        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-90 text-red-500 p-3 border border-red-500 z-50">
          {renderError}
        </div>
      )}
      
      {/* Mode error notification */}
      {errorState && errorState.type === 'mode_mismatch' && (
        <div className="absolute top-0 left-0 right-0 bg-red-900 bg-opacity-90 text-white p-2 text-center font-bold z-50">
          ⚠️ FALLBACK TO SIMULATION: Real capture failed - check permissions and run as administrator
        </div>
      )}
      
      {/* Debug info overlay */}
      <div className="absolute top-16 left-4 bg-black bg-opacity-70 text-green-400 p-2 text-xs z-10">
        <p>Display: {width}x{height}</p>
        <p>Data: {nodes.length} nodes, {connections.length} connections</p>
        <p>Rendered: {renderStats.nodes} nodes, {renderStats.connections} connections</p>
        <p className={captureMode === 'simulated' ? "text-yellow-400" : "text-green-400"}>
          Mode: {captureMode.toUpperCase()} NETWORK
        </p>
        {nodes.length > 0 && renderStats.nodes === 0 && (
          <p className="text-yellow-400">Warning: Nodes available but not rendered!</p>
        )}
      </div>
      
      {/* Hidden div to store WebSocket error for reference */}
      <div id="ws-error" style={{ display: 'none' }}></div>
    </>
  )
} 