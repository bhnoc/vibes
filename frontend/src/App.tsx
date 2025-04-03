import { useEffect, useState, memo, Suspense, lazy, useMemo } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { usePacketProcessor } from './hooks/usePacketProcessor'
import { usePacketStore } from './stores/packetStore'
import { useNetworkStore } from './stores/networkStore'
import './index.css'

// Import critical components directly 
import { NodeGraph, CaptureContext } from './components/NodeGraph'
import { SettingsPanel } from './components/SettingsPanel' // Direct import
import { DebugPanel } from './components/DebugPanel'

// Only lazy load non-critical components
const StatsPanel = lazy(() => import('./components/StatsPanel').then(module => ({ default: module.StatsPanel })))

// Status bar component
const StatusBar = memo(({ status, error }: { status: string; error: string | null }) => (
  <div className="status-bar">
    <span className={`status ${status}`}>{status}</span>
    {error && <span className="error">{error}</span>}
  </div>
))

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
  // Default to waiting state, don't start simulated mode automatically
  const [captureMode, setCaptureMode] = useState<'simulated' | 'real' | 'waiting'>('waiting')
  const [selectedInterface, setSelectedInterface] = useState<string>('')
  const [interfaces, setInterfaces] = useState<Array<{ name: string; description: string }>>([])
  const [initialLoad, setInitialLoad] = useState(true)
  
  const { packets, clearPackets } = usePacketStore()
  const { clearNetwork } = useNetworkStore()
  
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
        
        console.log(`🔍 Initial load detected interface request: ${interfaceName}`);
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
        console.log("Fetching interfaces...");
        const response = await fetch('http://localhost:8080/api/interfaces');
        console.log("API Response status:", response.status);
        
        if (!response.ok) {
          throw new Error(`API returned status ${response.status}`);
        }
        
        const rawData = await response.json();
        console.log("Received interfaces (raw):", rawData);
        
        if (!Array.isArray(rawData) || rawData.length === 0) {
          console.warn("API returned empty or invalid interface list, using fallback interfaces");
          setFallbackInterfaces();
          return;
        }
        
        // Map API response (uppercase fields) to the format our component expects (lowercase fields)
        const formattedData = rawData.map((iface: any) => ({
          name: iface.Name,
          description: iface.Description || iface.Name // Use Name as fallback if Description is empty
        }));
        
        console.log("Formatted interfaces:", formattedData);
        
        if (formattedData.length === 0) {
          console.warn("No interfaces after formatting, using fallback interfaces");
          setFallbackInterfaces();
          return;
        }
        
        setInterfaces(formattedData);
      } catch (error) {
        console.error('Failed to fetch interfaces:', error);
        setFallbackInterfaces();
      }
    };
    
    // Provide fallback interfaces if API fails
    const setFallbackInterfaces = () => {
      const fallbackList = [
        { name: "eth0", description: "Ethernet Adapter (Fallback)" },
        { name: "wlan0", description: "Wireless Adapter (Fallback)" },
        { name: "lo", description: "Loopback Interface (Fallback)" },
        { name: "any", description: "All Interfaces (Fallback)" }
      ];
      console.log("Setting fallback interfaces:", fallbackList);
      setInterfaces(fallbackList);
    };
    
    fetchInterfaces();
  }, [captureMode]);
  
  // WebSocket connection
  const wsUrl = useMemo(() => {
    // Only create a WebSocket URL if we're not in waiting mode
    if (captureMode === 'waiting') {
      console.log('In waiting mode, not connecting to any WebSocket');
      return null;
    }
    
    if (captureMode === 'real' && selectedInterface) {
      // Real mode with selected interface
      return `ws://localhost:8080/ws?interface=${selectedInterface}`;
    } else if (captureMode === 'simulated') {
      // Only connect to simulation if explicitly in simulation mode
      return 'ws://localhost:8080/ws';
    } else {
      // Return null to prevent any connection when not ready
      return null;
    }
  }, [captureMode, selectedInterface]);
  
  console.log(`🌐 Using WebSocket URL: ${wsUrl || 'none - waiting for settings'}`);
  
  // Always call useWebSocket, but it won't connect if url is null
  const { status, error, captureMode: actualCaptureMode } = useWebSocket(wsUrl);
  
  // Update local state if the server reports a different mode
  useEffect(() => {
    if (actualCaptureMode !== 'unknown' && actualCaptureMode !== captureMode) {
      console.log(`Server reported different capture mode: ${actualCaptureMode}, updating local state`);
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
    console.log("Switching mode to:", mode);
    setCaptureMode(mode)
    clearPackets()
    clearNetwork()
  }
  
  const handleInterfaceSelect = (iface: string) => {
    console.log("Interface selected:", iface);
    setSelectedInterface(iface);
    
    // If user selects an interface, automatically switch to real mode
    if (iface && captureMode !== 'real') {
      console.log("Switching to real mode because interface was selected");
      setCaptureMode('real');
    }
    
    clearPackets();
    clearNetwork();
  }
  
  return (
    <div className="app">
      <CaptureContext.Provider value={{ 
        captureMode: actualCaptureMode,
        captureInterface: selectedInterface 
      }}>
        <div className="canvas-container">
          <NodeGraph />
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
        
        {/* Add the debug panel */}
        <DebugPanel />
        
        <div className="crt-effect" />
        <div className="scanline" />
        
        <Suspense fallback={<LoadingFallback />}>
          <StatsPanel />
        </Suspense>
        
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