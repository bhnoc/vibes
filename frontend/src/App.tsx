import { useEffect, useState, memo, Suspense, lazy, useMemo, useRef } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { usePacketProcessor } from './hooks/usePacketProcessor'
import { usePacketStore } from './stores/packetStore'
import { useNetworkStore } from './stores/networkStore'
import { useSizeStore } from './stores/sizeStore'
import { getApiBaseUrl } from './utils/websocketUtils'
import './index.css'
import { logger } from './utils/logger'
import { useWebSocketPinning } from './hooks/useWebSocketPinning'

// Import critical components directly 
import { RendererSelector } from './components/RendererSelector'
import { CaptureContext } from './components/MinimalGraph'
import { SettingsPanel } from './components/SettingsPanel' // Direct import
import { UnifiedDebugPanel } from './components/UnifiedDebugPanel'
import { PerformanceTestData } from './components/PerformanceTestData'
// import { IPDebugPage } from './components/IPDebugPage'  // Using lazy loading instead

// Only lazy load non-critical components
const StatsPanel = lazy(() => import('./components/StatsPanel').then(module => ({ default: module.StatsPanel })))
const IPDebugPage = lazy(() => import('./components/IPDebugPage').then(module => ({ default: module.IPDebugPage })))

import { CommandBar } from './components/CommandBar';

// Status bar component with active panel
const StatusBar = memo(({ status, error }: { status: string; error: string | null }) => {
  const { nodes, connections } = useNetworkStore();
  const { packets } = usePacketStore();
  
  return (
    <div className="status-bar" style={{ zIndex: 999, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <span className={`status ${status}`}>{status}</span>
        {error && <span className="error">{error}</span>}
      </div>
      <CommandBar />
      
      
      {/* Active Panel - Shows current network activity */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '15px',
        fontSize: '14px',
        color: '#00ff00'
      }}>
        <span>📦 Packets: <strong style={{ color: '#fff' }}>{packets.length}</strong></span>
        <span>🔘 Nodes: <strong style={{ color: '#fff' }}>{nodes.length}</strong></span>
        <span>🔗 Connections: <strong style={{ color: '#fff' }}>{connections.length}</strong></span>
        <span style={{ 
          fontSize: '12px', 
          padding: '2px 6px', 
          background: nodes.length > 0 ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 0, 0, 0.2)',
          borderRadius: '3px',
          border: `1px solid ${nodes.length > 0 ? '#00ff00' : '#ff0000'}`
        }}>
          {nodes.length > 0 ? '✅ ACTIVE' : '⚠️ WAITING'}
        </span>
      </div>
    </div>
  );
});

// Loading fallback
const LoadingFallback = () => (
  <div style={{ 
    position: 'fixed', 
    top: '20px', 
    right: '20px', 
    background: 'rgba(0,0,0,0.8)',
    border: '1px solid #00ff00',
    padding: '10px',
    color: '#00ff00',
    zIndex: 1000
  }}>
    Loading stats...
  </div>
)

export const App = memo(() => {
  useWebSocketPinning()
  // Simple routing based on URL hash
  const [currentRoute, setCurrentRoute] = useState<string>(window.location.hash.slice(1) || 'main')
  
  // Start with real capture mode by default, using the 'any' interface
  const [captureMode, setCaptureMode] = useState<'simulated' | 'real' | 'waiting'>('real')
  const [selectedInterface, setSelectedInterface] = useState<string>('any')
  const [interfaces, setInterfaces] = useState<Array<{ name: string; description: string }>>([])
  const [initialLoad, setInitialLoad] = useState(true)
  
  // State for the unified debug panel
  const [currentRenderer, setCurrentRenderer] = useState<string>('canvas')
  const [performanceTestData, setPerformanceTestData] = useState<{
    enabled: boolean;
    nodeCount: number;
    connectionCount: number;
  }>({ enabled: false, nodeCount: 2000, connectionCount: 3000 })
  
  const { packets, clearPackets } = usePacketStore()
  const { clearNetwork } = useNetworkStore()
  const { setSize } = useSizeStore()
  
  // Handle hash-based routing
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentRoute(window.location.hash.slice(1) || 'main')
    }
    
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])
  
  // Set initial size and update on resize
  useEffect(() => {
    // Set initial size
    setSize(window.innerWidth, window.innerHeight)
    
    // Update size on window resize
    const handleResize = () => {
      setSize(window.innerWidth, window.innerHeight)
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [setSize])
  
  // Process packets into nodes and connections
  usePacketProcessor()
  
  // Check URL on initial load to see if real capture was requested
  useEffect(() => {
    if (initialLoad) {
      const url = new URL(window.location.href);
      const wsParam = url.searchParams.get('ws');
      
      if (wsParam && wsParam.includes('interface=')) {
        const interfacePart = wsParam.split('interface=')[1];
        const interfaceName = interfacePart.split('&')[0]; // Handle any additional params
        
        logger.log(`🔍 Initial load detected interface request: ${interfaceName}`);
        setCaptureMode('real');
        setSelectedInterface(interfaceName);
      }
      
      setInitialLoad(false);
    }
  }, [initialLoad]);
  
  // Fetch available network interfaces
  useEffect(() => {
    // Only fetch interfaces if we're in real mode
    if (captureMode !== 'real') return;
    
    const fetchInterfaces = async () => {
      try {
        logger.log("Fetching interfaces...");
        
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        try {
          // First try with regular CORS mode
          // Use dynamic API base URL
          const apiBaseUrl = getApiBaseUrl();
          const response = await fetch(`${apiBaseUrl}/api/interfaces`, {
            headers: {
              'Accept': 'application/json'
            },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          logger.log("API Response status:", response.status);
          
          if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
          }
          
          const rawData = await response.json();
          logger.log("Received interfaces (raw):", rawData);
          
          if (!Array.isArray(rawData) || rawData.length === 0) {
            logger.warn("API returned empty or invalid interface list, using fallback interfaces");
            setFallbackInterfaces();
            return;
          }
          
          // Process the data from a successful response
          processInterfaceData(rawData);
          
        } catch (fetchError) {
          logger.error('Fetch operation failed:', fetchError);
          
          // Check if this is a CORS error specifically
          if (fetchError instanceof TypeError && fetchError.message.includes('Failed to fetch')) {
            logger.warn("CORS error detected - attempting fallback method");
            
            // Create a hidden div to show CORS error
            const corsError = document.createElement('div');
            corsError.style.display = 'none';
            corsError.id = 'cors-error';
            corsError.textContent = 'CORS error: Backend server needs Access-Control-Allow-Origin headers';
            document.body.appendChild(corsError);
            
            // Use fallback interfaces for now
            setFallbackInterfaces();
            
            // Display a more helpful error message for developers
            const backendUrl = getApiBaseUrl();
            logger.error(`
              ⚠️ CORS CONFIGURATION REQUIRED:
              The backend server at ${backendUrl} needs to be configured to allow requests
              from the frontend origin (${window.location.origin}).
              
              Backend needs to add these headers to API responses:
              Access-Control-Allow-Origin: ${window.location.origin}
              Access-Control-Allow-Methods: GET, POST
              Access-Control-Allow-Headers: Content-Type
            `);
          } else {
            // Other fetch error
            setFallbackInterfaces();
          }
        }
      } catch (error) {
        logger.error('Failed to fetch interfaces:', error);
        setFallbackInterfaces();
      }
    };
    
    // Helper to process interface data
    const processInterfaceData = (rawData: any[]) => {
      try {
        // Map API response (uppercase fields) to the format our component expects (lowercase fields)
        const formattedData = rawData.map((iface: any) => ({
          name: iface.Name,
          description: iface.Description || iface.Name // Use Name as fallback if Description is empty
        }));
        
        logger.log("Formatted interfaces:", formattedData);
        
        // Always include "any" interfaces option if not present
        if (!formattedData.some(iface => iface.name === 'any')) {
          formattedData.unshift({ 
            name: 'any', 
            description: 'All Interfaces (Recommended)'
          });
        }
        
        if (formattedData.length === 0) {
          logger.warn("No interfaces after formatting, using fallback interfaces");
          setFallbackInterfaces();
          return;
        }
        
        setInterfaces(formattedData);
      } catch (err) {
        logger.error("Error processing interface data:", err);
        setFallbackInterfaces();
      }
    };
    
    // Provide fallback interfaces if API fails
    const setFallbackInterfaces = () => {
      const fallbackList = [
        { name: "any", description: "All Interfaces (Recommended)" },
        { name: "eth0", description: "Ethernet Adapter (Fallback)" },
        { name: "wlan0", description: "Wireless Adapter (Fallback)" },
        { name: "lo", description: "Loopback Interface (Fallback)" }
      ];
      logger.log("Setting fallback interfaces:", fallbackList);
      setInterfaces(fallbackList);
    };
    
    fetchInterfaces();
  }, [captureMode]);
  
  // WebSocket connection
  const wsUrl = useMemo(() => {
    // Only create a WebSocket URL if we're not in waiting mode
    if (captureMode === 'waiting') {
      logger.log('In waiting mode, not connecting to any WebSocket');
      return null;
    }
    
    // Get host from environment variables or fall back to localhost
    const wsHost = import.meta.env.VITE_BACKEND_HOST || 'localhost';
    const wsPort = import.meta.env.VITE_BACKEND_PORT || '8080';
    
    if (captureMode === 'real' && selectedInterface) {
      // Real mode with selected interface
      return `ws://${wsHost}:${wsPort}/ws?interface=${selectedInterface}`;
    } else if (captureMode === 'simulated') {
      // Only connect to simulation if explicitly in simulation mode
      return `ws://${wsHost}:${wsPort}/ws`;
    } else {
      // Return null to prevent any connection when not ready
      return null;
    }
  }, [captureMode, selectedInterface]);
  
  logger.log(`🌐 WebSocket URL updated: ${wsUrl || 'none - waiting for settings'} (mode: ${captureMode}, interface: ${selectedInterface})`);
  
  // Always call useWebSocket, but it won't connect if url is null
  const { status, error, captureMode: actualCaptureMode } = useWebSocket(wsUrl);
  
  // Update local state if the server reports a different mode
  // Add a ref to track user-initiated changes to prevent conflicts
  const userInitiatedChangeRef = useRef(false);
  
  useEffect(() => {
    // Only update if this is not a user-initiated change and there's a meaningful difference
    if (actualCaptureMode !== 'unknown' && 
        actualCaptureMode !== captureMode && 
        !userInitiatedChangeRef.current) {
      logger.log(`📡 Server reported capture mode: ${actualCaptureMode}, updating local state`);
      setCaptureMode(actualCaptureMode as 'simulated' | 'real');
    }
  }, [actualCaptureMode, captureMode]);
  
  // Store error in hidden div for reference by other components
  useEffect(() => {
    const errorDiv = document.getElementById('ws-error');
    if (errorDiv && error) {
      errorDiv.textContent = error;
    }
  }, [error]);
  
  // Display permission error alert
  useEffect(() => {
    if (error && error.includes('Permission denied')) {
      // Show a more visible error message for permission issues
      alert(`🔒 Administrator Privileges Required\n\nTo capture real network traffic, this application needs to be run with administrator/root privileges.\n\nPlease restart the backend server with the appropriate permissions.`);
    }
  }, [error]);
  
  // Update title to show capture mode
  useEffect(() => {
    if (actualCaptureMode === 'real') {
      document.title = 'Network Visualizer - REAL CAPTURE';
    } else if (actualCaptureMode === 'simulated') {
      document.title = 'Network Visualizer - SIMULATION';
    } else {
      document.title = 'Network Visualizer';
    }
  }, [actualCaptureMode]);
  
  const handleCaptureModeChange = (mode: 'simulated' | 'real') => {
    logger.log("🔄 User switching mode to:", mode);
    
    // Prevent multiple rapid calls
    if (userInitiatedChangeRef.current) {
      logger.log("⏳ Mode change already in progress, ignoring duplicate call");
      return;
    }
    
    // Set flag to prevent server state from overriding user choice
    userInitiatedChangeRef.current = true;
    
    // Batch all state updates together
    setCaptureMode(mode);
    clearPackets();
    clearNetwork();
    
    // Reset the flag after state has had time to propagate
    setTimeout(() => {
      userInitiatedChangeRef.current = false;
    }, 2000);
  }
  
  const handleInterfaceSelect = (iface: string) => {
    logger.log("🔌 Interface selected:", iface);
    
    // Prevent multiple rapid calls
    if (userInitiatedChangeRef.current) {
      logger.log("⏳ Interface change already in progress, ignoring duplicate call");
      return;
    }
    
    // Set flag to prevent server state from overriding user choice
    userInitiatedChangeRef.current = true;
    
    // Batch all state updates together
    setSelectedInterface(iface);
    
    // If user selects an interface, automatically switch to real mode
    if (iface && captureMode !== 'real') {
      logger.log("Switching to real mode because interface was selected");
      setCaptureMode('real');
    }
    
    clearPackets();
    clearNetwork();
    
    // Reset the flag after state has had time to propagate
    setTimeout(() => {
      userInitiatedChangeRef.current = false;
    }, 2000);
  }

  // Handler for unified debug panel test mode changes
  const handleTestModeChange = (enabled: boolean, nodeCount: number, connectionCount: number) => {
    setPerformanceTestData({ enabled, nodeCount, connectionCount });
  }

  // Handler for renderer changes
  const handleRendererChange = (renderer: string) => {
    setCurrentRenderer(renderer);
  }
  
  // Simplified error handling - fall back to simulation only if not user-initiated
  useEffect(() => {
    if (status === 'error' && 
        captureMode === 'real' && 
        !userInitiatedChangeRef.current) {
      logger.log('🔄 Real capture failed, falling back to simulation mode');
      setCaptureMode('simulated');
      clearPackets();
      clearNetwork();
    }
  }, [status, captureMode]);

  // Memory optimization - use memo for expensive renders
  const memoizedRenderer = useMemo(() => (
    <RendererSelector 
      defaultRenderer={currentRenderer as 'canvas' | 'minimal'} 
      onChange={handleRendererChange}
      hideUI={true} // Hide built-in UI since we use the unified debug panel
    />
  ), [currentRenderer, actualCaptureMode, captureMode]); // Include capture modes to ensure re-render when mode changes

  return (
    <div className="app">
      <CaptureContext.Provider value={{ 
        captureMode: actualCaptureMode !== 'unknown' ? actualCaptureMode : captureMode,
        captureInterface: selectedInterface 
      }}>
        {/* Route navigation */}
        <div style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          zIndex: 1000,
          display: 'flex',
          gap: '10px'
        }}>
          <a 
            href="#main" 
            className="px-3 py-1 bg-blue-900 hover:bg-blue-800 text-blue-300 rounded text-sm"
          >
            Main
          </a>
          <a 
            href="#debug" 
            className="px-3 py-1 bg-green-900 hover:bg-green-800 text-green-300 rounded text-sm"
          >
            IP Debug
          </a>
        </div>
        
        {/* Conditionally render content based on route */}
        {currentRoute === 'debug' ? (
          <IPDebugPage />
        ) : (
          <>
            <div className="canvas-container" style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 0,
              overflow: 'hidden'
            }}>
              {/* Use the fully memoized renderer component for maximum stability */}
              {memoizedRenderer}
            </div>
            
            <div className="sidebar">
              <div className="sidebar-section">
                <SettingsPanel 
                  captureMode={captureMode}
                  onCaptureModeChange={handleCaptureModeChange} 
                  interfaces={interfaces}
                  selectedInterface={selectedInterface}
                  onInterfaceSelect={handleInterfaceSelect}
                />
              </div>
            </div>
            
            {/* Performance Test Data Generator */}
            <PerformanceTestData 
              enabled={performanceTestData.enabled}
              nodeCount={performanceTestData.nodeCount}
              connectionCount={performanceTestData.connectionCount}
            />
            
            {/* Unified Debug Panel */}
            <UnifiedDebugPanel 
              onTestModeChange={handleTestModeChange}
              onRendererChange={handleRendererChange}
              currentRenderer={currentRenderer}
              rendererOptions={[
                {
                  key: 'canvas',
                  name: '🎨 Canvas (High Performance)',
                  description: 'New Canvas-based renderer - handles 1000s of objects at 60fps',
                  performance: '⭐⭐⭐⭐⭐',
                  status: '✅ Recommended'
                },
                {
                  key: 'minimal',
                  name: '⚡ Minimal DOM',
                  description: 'Lightweight DOM renderer - good for < 100 objects',
                  performance: '⭐⭐⭐',
                  status: '⚠️ Limited scale'
                }
              ]}
            />
          </>
        )}
        
        {/* Performance Test Data Generator (always active for both routes) */}
        <PerformanceTestData 
          enabled={performanceTestData.enabled}
          nodeCount={performanceTestData.nodeCount}
          connectionCount={performanceTestData.connectionCount}
        />
        
        {error && (
          <div className="error-bar">
            <span className="error">{error}</span>
          </div>
        )}
        
        <StatusBar status={status} error={error} />
      </CaptureContext.Provider>
    </div>
  )
})
