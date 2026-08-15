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
import { useThemeStore } from './stores/themeStore'
import { useWindowStore } from './stores/windowStore'

// Import critical components directly 
import { RendererSelector } from './components/RendererSelector'
import { CaptureContext } from './components/MinimalGraph'
import { SettingsPanel } from './components/SettingsPanel' // Direct import
import type { NetFlowHostAddress, NetFlowListenerStatus } from './components/SettingsPanel'
import { UnifiedDebugPanel } from './components/UnifiedDebugPanel'
import { PerformanceTestData } from './components/PerformanceTestData'
// import { IPDebugPage } from './components/IPDebugPage'  // Using lazy loading instead

// Only lazy load non-critical components
const StatsPanel = lazy(() => import('./components/StatsPanel').then(module => ({ default: module.StatsPanel })))
const IPDebugPage = lazy(() => import('./components/IPDebugPage').then(module => ({ default: module.IPDebugPage })))

import { CommandBar } from './components/CommandBar';
import { NocHeader, NocStatusBar, PerformanceTestWindow } from './components/noc';
import { ThemeLegend } from './components/ThemeLegend';

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
  // --- State Declarations ---
  const [captureMode, setCaptureMode] = useState<'simulated' | 'real' | 'zeek' | 'netflow' | 'waiting'>('simulated');
  const [zeekTcpAddr, setZeekTcpAddr] = useState<string>(':4777');
  const [netflowAddresses, setNetflowAddresses] = useState<NetFlowHostAddress[]>([]);
  const [netflowBindIP, setNetflowBindIP] = useState<string>('0.0.0.0');
  const [netflowPort, setNetflowPort] = useState<number>(2055);
  const [netflowStatus, setNetflowStatus] = useState<NetFlowListenerStatus | null>(null);
  const [netflowBusy, setNetflowBusy] = useState(false);
  const [interfaces, setInterfaces] = useState<{ name: string; description: string }[]>([]);
  const [selectedInterface, setSelectedInterface] = useState<string>('');
  const [currentRenderer, setCurrentRenderer] = useState('canvas');
  const [currentRoute, setCurrentRoute] = useState(window.location.hash.slice(1) || 'main');
  const [initialLoad, setInitialLoad] = useState(true);
  const [performanceTestData, setPerformanceTestData] = useState({ enabled: false, nodeCount: 0, connectionCount: 0 });
  const { showSettings, showDebug, showLegend, toggleSettings, toggleDebug, toggleLegend } = useWindowStore();
  const [showPerfTest, setShowPerfTest] = useState(false);

  useEffect(() => {
    if (captureMode === 'waiting') {
      toggleSettings(true);
    }
  }, [captureMode, toggleSettings]);

  // --- Store Hooks ---
  const { packets, clearPackets } = usePacketStore()
  const { clearNetwork } = useNetworkStore()
  const { setSize } = useSizeStore()
  const { themeKey } = useThemeStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeKey);
  }, [themeKey]);

  // WebSocket connection
  const wsUrl = useMemo(() => {
    // Only create a WebSocket URL if we're not in waiting mode
    if (captureMode === 'waiting') {
      logger.log('In waiting mode, not connecting to any WebSocket');
      return null;
    }

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // ALWAYS connect the WebSocket back to whichever host:port served this page.
    // This is correct behind the Vite dev proxy (localhost:5173 → /ws proxied to
    // :8080) AND when the Go backend serves the built app in production (a remote
    // client hitting 10.220.199.71:8080). We deliberately do NOT honor
    // VITE_BACKEND_HOST here: frontend/.env pins it to "localhost", which would
    // make every remote viewer try their OWN machine — the exact bug we hit.
    const wsBase = `${proto}://${window.location.host}`;

    if (captureMode === 'real') {
      if (selectedInterface) {
        return `${wsBase}/ws?interface=${selectedInterface}`;
      }
      return `${wsBase}/ws`;
    }
    if (captureMode === 'zeek') {
      const addr = zeekTcpAddr.trim() || ':4777';
      return `${wsBase}/ws?zeek_tcp=${encodeURIComponent(addr)}`;
    }
    if (captureMode === 'netflow') {
      return `${wsBase}/ws?netflow=1`;
    }
    if (captureMode === 'simulated') {
      return `${wsBase}/ws`;
    }
    return null;
  }, [captureMode, selectedInterface, zeekTcpAddr]);

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

  // Periodically remove expired nodes and connections from the store
  useEffect(() => {
    const { removeInactiveElements } = useNetworkStore.getState();
    const id = setInterval(removeInactiveElements, 5000);
    return () => clearInterval(id);
  }, [])
  
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

  // NetFlow: load host IPs + poll listener status while in NetFlow mode
  useEffect(() => {
    if (captureMode !== 'netflow') return;

    let cancelled = false;
    const apiBaseUrl = getApiBaseUrl();

    const refreshAddresses = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/netflow/addresses`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as NetFlowHostAddress[];
        if (cancelled) return;
        setNetflowAddresses(data);
        setNetflowBindIP((current) => {
          if (data.length && !data.some((a) => a.ip === current)) {
            return data[0].ip;
          }
          return current;
        });
      } catch (err) {
        logger.warn('Failed to load NetFlow bind addresses:', err);
      }
    };

    const refreshStatus = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/netflow/status`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as NetFlowListenerStatus;
        if (cancelled) return;
        setNetflowStatus(data);
        if (data.bind_ip) setNetflowBindIP(data.bind_ip);
        if (data.port) setNetflowPort(data.port);
      } catch (err) {
        logger.warn('Failed to load NetFlow status:', err);
      }
    };

    refreshAddresses();
    refreshStatus();
    const id = window.setInterval(refreshStatus, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [captureMode]);
  
  logger.log(`🌐 WebSocket URL updated: ${wsUrl || 'none - waiting for settings'} (mode: ${captureMode}, interface: ${selectedInterface})`);

  const { status, error, captureMode: actualCaptureMode, sendMessage } = useWebSocket(wsUrl);
  useWebSocketPinning(sendMessage);

  // Auto-enable fallback simulation if WebSocket is unavailable / blocked while in simulated mode
  useEffect(() => {
    if (captureMode === 'simulated' && (status === 'error' || status === 'disconnected' || status === 'waiting') && !performanceTestData.enabled) {
      logger.log('🎮 Enabling automatic browser simulation fallback for Black Hat NOC Console');
      setPerformanceTestData({ enabled: true, nodeCount: 150, connectionCount: 250 });
    } else if (status === 'connected' && performanceTestData.enabled) {
      setPerformanceTestData({ enabled: false, nodeCount: 0, connectionCount: 0 });
    }
  }, [captureMode, status, performanceTestData.enabled]);
  
  // Update local state if the server reports a different mode
  // Add a ref to track user-initiated changes to prevent conflicts
  const userInitiatedChangeRef = useRef(false);
  
  useEffect(() => {
    const serverUiMode =
      actualCaptureMode === 'zeek_conn'
        ? 'zeek'
        : actualCaptureMode === 'netflow_v9'
          ? 'netflow'
          : actualCaptureMode === 'unknown' || actualCaptureMode === 'waiting'
            ? null
            : (actualCaptureMode as 'simulated' | 'real');
    // Only update if this is not a user-initiated change and there's a meaningful difference
    if (
      serverUiMode !== null &&
      serverUiMode !== captureMode &&
      !userInitiatedChangeRef.current
    ) {
      // Don't let hook "simulated" (reconnect/error) stomp an explicit Zeek/NetFlow selection before server mode arrives
      if ((captureMode === 'zeek' || captureMode === 'netflow') && serverUiMode === 'simulated') {
        return;
      }
      logger.log(`📡 Server reported capture mode: ${actualCaptureMode}, updating local state`);
      setCaptureMode(serverUiMode);
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
    } else if (actualCaptureMode === 'zeek_conn') {
      document.title = 'Network Visualizer - ZEEK CONN';
    } else if (actualCaptureMode === 'netflow_v9') {
      document.title = 'Network Visualizer - NETFLOW V9';
    } else {
      document.title = 'Network Visualizer';
    }
  }, [actualCaptureMode]);
  
  const handleCaptureModeChange = (mode: 'simulated' | 'real' | 'zeek' | 'netflow') => {
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

  const handleNetflowStart = async () => {
    setNetflowBusy(true);
    try {
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/api/netflow/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: netflowBindIP || '0.0.0.0', port: netflowPort || 2055 }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || `HTTP ${res.status}`;
        logger.warn('NetFlow start failed:', msg);
        if (data?.status) setNetflowStatus(data.status);
        else setNetflowStatus((prev) => ({ ...(prev || {
          state: 'error', bind_ip: netflowBindIP, port: netflowPort, listen_addr: '', templates: 0,
          datagrams_ok: 0, datagrams_bad: 0, flows_ok: 0, subscribers: 0,
        }), state: 'error', last_error: msg }));
        return;
      }
      setNetflowStatus(data as NetFlowListenerStatus);
    } catch (err) {
      logger.warn('NetFlow start error:', err);
    } finally {
      setNetflowBusy(false);
    }
  };

  const handleNetflowStop = async () => {
    setNetflowBusy(true);
    try {
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/api/netflow/stop`, { method: 'POST' });
      if (res.ok) {
        setNetflowStatus((await res.json()) as NetFlowListenerStatus);
      }
    } catch (err) {
      logger.warn('NetFlow stop error:', err);
    } finally {
      setNetflowBusy(false);
    }
  };
  
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
        (captureMode === 'real' || captureMode === 'zeek' || captureMode === 'netflow') && 
        !userInitiatedChangeRef.current) {
      logger.log('🔄 Capture failed, falling back to simulation mode');
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
        captureMode:
          actualCaptureMode === 'zeek_conn'
            ? 'zeek'
            : actualCaptureMode === 'netflow_v9'
              ? 'netflow'
              : actualCaptureMode === 'real' || actualCaptureMode === 'simulated'
                ? actualCaptureMode
                : captureMode,
        captureInterface: selectedInterface 
      }}>
        {/* Black Hat NOC Header */}
        <NocHeader
          currentRoute={currentRoute}
          status={status}
          error={error}
          captureMode={captureMode}
          showSettings={showSettings}
          onToggleSettings={() => toggleSettings()}
          showDebug={showDebug}
          onToggleDebug={() => toggleDebug()}
          showLegend={showLegend}
          onToggleLegend={() => toggleLegend()}
        />
        
        {/* Conditionally render content based on route */}
        {currentRoute === 'debug' ? (
          <IPDebugPage />
        ) : (
          <div className="canvas-container">
            {/* Use the fully memoized renderer component for maximum stability */}
            {memoizedRenderer}
          </div>
        )}

        {showSettings && (
          <div className="sidebar">
            <div className="sidebar-section">
              <SettingsPanel 
                captureMode={captureMode}
                onCaptureModeChange={handleCaptureModeChange} 
                interfaces={interfaces}
                selectedInterface={selectedInterface}
                onInterfaceSelect={handleInterfaceSelect}
                zeekTcpAddr={zeekTcpAddr}
                onZeekTcpAddrChange={setZeekTcpAddr}
                netflowAddresses={netflowAddresses}
                netflowBindIP={netflowBindIP}
                onNetflowBindIPChange={setNetflowBindIP}
                netflowPort={netflowPort}
                onNetflowPortChange={setNetflowPort}
                netflowStatus={netflowStatus}
                netflowBusy={netflowBusy}
                onNetflowStart={handleNetflowStart}
                onNetflowStop={handleNetflowStop}
                wsPreviewUrl={wsUrl}
                onMinimize={() => toggleSettings(false)}
              />
            </div>
          </div>
        )}
        
        {/* Performance Test Data Generator */}
        <PerformanceTestData 
          enabled={performanceTestData.enabled}
          nodeCount={performanceTestData.nodeCount}
          connectionCount={performanceTestData.connectionCount}
        />

        {/* Unified Debug Panel */}
        <UnifiedDebugPanel 
          isOpen={showDebug}
          onMinimize={() => toggleDebug(false)}
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
        <ThemeLegend isOpen={showLegend} onMinimize={() => toggleLegend(false)} />
        
        <NocStatusBar status={status} error={error} />
      </CaptureContext.Provider>
    </div>
  )
})
