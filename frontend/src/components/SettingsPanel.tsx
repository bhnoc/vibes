import React, { memo, useEffect, useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useNetworkStore } from '../stores/networkStore';

interface SettingsPanelProps {
  captureMode: 'simulated' | 'real' | 'waiting';
  onCaptureModeChange: (mode: 'simulated' | 'real') => void;
  interfaces: Array<{ name: string; description: string }>;
  selectedInterface: string;
  onInterfaceSelect: (iface: string) => void;
}

// Main SettingsPanel component
export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  captureMode,
  onCaptureModeChange,
  interfaces,
  selectedInterface,
  onInterfaceSelect,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [highPerformanceMode, setHighPerformanceMode] = useState(true);
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  
  // Get node spacing settings
  const { nodeSpacing, setNodeSpacing } = useSettingsStore();
  
  // Apply performance settings
  useEffect(() => {
    // Set a global window property for other components to check
    (window as any).highPerformanceMode = highPerformanceMode;
    
    // Log performance mode changes
    console.log(`🚀 Performance mode set to: ${highPerformanceMode ? 'HIGH' : 'STANDARD'}`);
  }, [highPerformanceMode]);
  
  // Log state changes to debug UI issues
  useEffect(() => {
    console.log("SettingsPanel captureMode:", captureMode);
    console.log("SettingsPanel interfaces:", interfaces);
    console.log("SettingsPanel selectedInterface:", selectedInterface);
    
    // Show loading state briefly when switching to real mode
    if (captureMode === 'real') {
      setIsLoading(true);
      const timer = setTimeout(() => setIsLoading(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [captureMode, interfaces, selectedInterface]);

  // Ensure panel visibility when changing modes
  useEffect(() => {
    // Always show panel when mode changes, especially to real
    setIsPanelVisible(true);
  }, [captureMode]);

  // Trigger repositioning when node spacing changes
  useEffect(() => {
    if (nodeSpacing > 0) {
      // Get the repositioning function from the network store
      const { repositionOverlappingNodes } = useNetworkStore.getState();
      // Debounce the repositioning to avoid excessive updates
      const timer = setTimeout(() => {
        repositionOverlappingNodes();
        console.log(`🎛️ Node spacing changed to ${nodeSpacing}px - repositioning existing nodes`);
      }, 500); // 500ms delay to avoid excessive updates while dragging
      
      return () => clearTimeout(timer);
    }
  }, [nodeSpacing]);

  // Toggle panel visibility
  const togglePanel = () => {
    setIsPanelVisible(!isPanelVisible);
  };

  return (
    <>
      {/* Toggle button - always visible */}
      <button 
        className="settings-toggle" 
        onClick={togglePanel}
        style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          zIndex: 1000,
          background: '#00ff41',
          color: '#000',
          border: 'none',
          padding: '5px 10px',
          fontFamily: 'VT323, monospace',
          fontSize: '16px',
          cursor: 'pointer',
          boxShadow: '0 0 10px rgba(0,255,65,0.7)'
        }}
      >
        {isPanelVisible ? 'Hide Settings' : 'Show Settings'}
      </button>
      
      {/* Main settings panel */}
      <div className="settings-panel" style={{ 
        display: isPanelVisible ? 'block' : 'none' 
      }}>
        <h2>Settings</h2>
        
        <div className="capture-mode">
          <h3>Capture Mode</h3>
          <div className="button-group">
            <button
              className={captureMode === 'simulated' ? 'active' : ''}
              onClick={() => onCaptureModeChange('simulated')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '8px 15px',
                border: '2px solid #00ff41',
                background: captureMode === 'simulated' ? 'rgba(0,255,65,0.2)' : 'transparent'
              }}
            >
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>Simulated</span>
              <span style={{ fontSize: '12px', opacity: 0.8 }}>Test Data</span>
            </button>
            <button
              className={captureMode === 'real' ? 'active' : ''}
              onClick={() => {
                console.log("REAL button clicked");
                onCaptureModeChange('real');
                // Keep panel visible
                setIsPanelVisible(true);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '8px 15px',
                border: '2px solid #00ff41',
                background: captureMode === 'real' ? 'rgba(0,255,65,0.2)' : 'transparent'
              }}
            >
              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>Real</span>
              <span style={{ fontSize: '12px', opacity: 0.8 }}>Capture Live Traffic</span>
            </button>
          </div>
          <p style={{ fontSize: '12px', marginTop: '10px', opacity: 0.7 }}>
            Select a capture mode to begin visualizing network traffic
          </p>
        </div>
        
        {/* Performance mode toggle */}
        <div className="performance-mode" style={{ marginTop: '15px' }}>
          <h3>Performance Mode</h3>
          <div className="button-group">
            <button
              className={highPerformanceMode ? 'active' : ''}
              onClick={() => setHighPerformanceMode(true)}
              title="Throttles data processing for smoother performance"
            >
              High FPS
            </button>
            <button
              className={!highPerformanceMode ? 'active' : ''}
              onClick={() => setHighPerformanceMode(false)}
              title="Processes all data without throttling, may cause slowdowns"
            >
              All Data
            </button>
          </div>
          <p style={{ fontSize: '12px', marginTop: '5px', opacity: 0.7 }}>
            {highPerformanceMode 
              ? 'Prioritizes smooth rendering (recommended)' 
              : 'Shows all data (may cause slowdowns)'}
          </p>
        </div>

        {/* Node spacing slider */}
        <div className="node-spacing" style={{ marginTop: '15px' }}>
          <h3>Node Spacing</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', minWidth: '40px' }}>Tight</span>
            <input
              type="range"
              min="15"
              max="100"
              value={nodeSpacing}
              onChange={(e) => setNodeSpacing(Number(e.target.value))}
              style={{
                flex: 1,
                height: '4px',
                background: '#333',
                outline: 'none',
                borderRadius: '2px',
                cursor: 'pointer'
              }}
            />
            <span style={{ fontSize: '12px', minWidth: '40px' }}>Loose</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
            <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>
              Controls minimum distance between nodes
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: '#00ff41', fontWeight: 'bold' }}>
                {nodeSpacing}px
              </span>
              <button
                onClick={() => setNodeSpacing(50)}
                style={{
                  padding: '2px 6px',
                  fontSize: '10px',
                  background: 'transparent',
                  border: '1px solid #00ff41',
                  color: '#00ff41',
                  cursor: 'pointer',
                  borderRadius: '2px'
                }}
                title="Reset to default spacing"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Always render the interface selector container, but only show content if in real mode */}
        <div className="interface-select" style={{ 
          display: captureMode === 'real' ? 'block' : 'none',
          opacity: isLoading ? 0.7 : 1,
          position: 'relative'
        }}>
          <h3>Network Interface</h3>
          
          {isLoading && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.7)',
              zIndex: 10
            }}>
              <p>Loading interfaces...</p>
            </div>
          )}
          
          {!isLoading && interfaces.length > 0 ? (
            <select
              value={selectedInterface}
              onChange={(e) => onInterfaceSelect(e.target.value)}
              style={{
                animation: !selectedInterface ? 'pulse-border 1.5s infinite' : 'none',
                boxShadow: !selectedInterface ? '0 0 10px #00ff00' : 'none'
              }}
            >
              <option value="">Please select an interface to view real traffic</option>
              {interfaces.map((iface) => (
                <option key={iface.name} value={iface.name}>
                  {iface.description || iface.name}
                </option>
              ))}
            </select>
          ) : !isLoading ? (
            <div className="no-interfaces">
              <p>No interfaces available!</p>
              <button 
                onClick={() => onCaptureModeChange('real')} 
                className="retry-button"
                style={{
                  marginTop: '10px',
                  padding: '5px 10px',
                  background: 'transparent',
                  border: '1px solid #00ff00',
                  color: '#00ff00',
                  cursor: 'pointer'
                }}
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>

        {/* Debug info */}
        <div style={{ marginTop: '20px', fontSize: '12px', opacity: 0.7 }}>
          <p>Mode: {captureMode}</p>
          <p>Interfaces: {interfaces.length}</p>
          <p>Selected: {selectedInterface || 'none'}</p>
          <p>Loading: {isLoading ? 'yes' : 'no'}</p>
          <p>Performance: {highPerformanceMode ? 'HIGH FPS' : 'ALL DATA'}</p>
          
          {/* Add manual interface selection for testing */}
          {captureMode === 'real' && interfaces.length === 0 && !isLoading && (
            <div style={{ marginTop: '10px', border: '1px dashed #00ff00', padding: '10px' }}>
              <p style={{ marginBottom: '5px' }}>Debug: Manual interface select</p>
              <button 
                onClick={() => onInterfaceSelect('eth0')} 
                style={{ padding: '3px 6px', marginRight: '5px', background: 'transparent', border: '1px solid #00ff00', color: '#00ff00' }}
              >
                eth0
              </button>
              <button 
                onClick={() => onInterfaceSelect('lo')} 
                style={{ padding: '3px 6px', marginRight: '5px', background: 'transparent', border: '1px solid #00ff00', color: '#00ff00' }}
              >
                lo
              </button>
              <button 
                onClick={() => onInterfaceSelect('any')} 
                style={{ padding: '3px 6px', background: 'transparent', border: '1px solid #00ff00', color: '#00ff00' }}
              >
                any
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}; 