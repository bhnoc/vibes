import React, { useState } from 'react';
import { useNetworkStore } from '../stores/networkStore';
import { useSettingsStore } from '../stores/settingsStore';
import { FiWifi, FiSliders } from 'react-icons/fi';
import { PhysicsPanel } from './PhysicsPanel';

type Tab = 'network' | 'physics';

export const SettingsPanel: React.FC<{
  captureMode: 'simulated' | 'real' | 'zeek' | 'waiting';
  onCaptureModeChange: (mode: 'simulated' | 'real' | 'zeek') => void;
  interfaces: Array<{ name: string; description: string }>;
  selectedInterface: string;
  onInterfaceSelect: (iface: string) => void;
  zeekTcpAddr: string;
  onZeekTcpAddrChange: (addr: string) => void;
  /** Current frontend WebSocket URL (updates when mode / Zeek address changes). */
  wsPreviewUrl: string | null;
  onMinimize: () => void;
}> = ({ 
  captureMode, 
  onCaptureModeChange, 
  interfaces, 
  selectedInterface, 
  onInterfaceSelect,
  zeekTcpAddr,
  onZeekTcpAddrChange,
  wsPreviewUrl,
  onMinimize
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('network');
  const { clearNetwork } = useNetworkStore();
  const { maxNodes, setMaxNodes } = useSettingsStore();

  const handlePanelMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="settings-panel" onMouseDown={handlePanelMouseDown}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Settings</h2>
        <button onClick={onMinimize} className="minimize-btn">_</button>
      </div>
      
      {/* Tab Navigation */}
      <div className="button-group">
        <button 
          className={activeTab === 'network' ? 'active' : ''}
          onClick={() => setActiveTab('network')}
        >
          <FiWifi style={{display: 'inline-block', marginRight: '5px', verticalAlign: 'middle'}} />
          Network
        </button>
        <button 
          className={activeTab === 'physics' ? 'active' : ''}
          onClick={() => setActiveTab('physics')}
        >
          <FiSliders style={{display: 'inline-block', marginRight: '5px', verticalAlign: 'middle'}} />
          Physics
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'network' && (
          <div style={{marginTop: '20px'}}>
            <h3>Capture Mode</h3>
            <div className="button-group">
              <button
                className={captureMode === 'simulated' ? 'active' : ''}
                onClick={() => onCaptureModeChange('simulated')}
              >
                Simulated
              </button>
              <button
                className={captureMode === 'real' ? 'active' : ''}
                onClick={() => onCaptureModeChange('real')}
              >
                Real
              </button>
              <button
                className={captureMode === 'zeek' ? 'active' : ''}
                onClick={() => onCaptureModeChange('zeek')}
                title="Zeek conn.log as NDJSON over TCP"
              >
                Zeek (TCP)
              </button>
            </div>

            {captureMode === 'zeek' && (
              <div style={{ marginTop: '16px' }}>
                <h3>Zeek ingest address</h3>
                <p style={{ fontSize: '12px', opacity: 0.85, marginBottom: '8px' }}>
                  Backend listens here; stream conn JSON lines (e.g. from zeek-cut | your forwarder).
                </p>
                <input
                  type="text"
                  value={zeekTcpAddr}
                  onChange={(e) => onZeekTcpAddrChange(e.target.value)}
                  placeholder=":4777"
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid #00ff00',
                    color: '#fff',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            )}

            {captureMode === 'real' && (
              <div className="interface-select">
                <h3>Network Interface</h3>
                <select
                  value={selectedInterface}
                  onChange={(e) => onInterfaceSelect(e.target.value)}
                >
                  <option value="">Select Interface</option>
                  {interfaces.map((iface) => (
                    <option key={iface.name} value={iface.name}>{iface.description || iface.name}</option>
                  ))}
                </select>
              </div>
            )}
            
            {wsPreviewUrl && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '8px',
                  fontSize: '11px',
                  lineHeight: 1.4,
                  wordBreak: 'break-all',
                  background: 'rgba(0,40,0,0.25)',
                  border: '1px solid rgba(0,255,0,0.25)',
                  borderRadius: '4px',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                <div style={{ opacity: 0.85, marginBottom: '4px' }}>WebSocket URL (live)</div>
                <div style={{ color: '#9f9' }}>{wsPreviewUrl}</div>
              </div>
            )}

            <div style={{ marginTop: '20px' }}>
              <h3>Display</h3>
              <label>Max Nodes on Screen: {maxNodes}</label>
              <input
                type="range"
                min="50"
                max="1000"
                step="50"
                value={maxNodes}
                onChange={(e) => setMaxNodes(Number(e.target.value))}
                style={{ width: '100%', marginTop: '6px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', opacity: 0.6 }}>
                <span>50</span><span>1000</span>
              </div>
            </div>

            <button
              onClick={clearNetwork}
              style={{
                background: 'rgba(255, 0, 0, 0.7)',
                border: '1px solid #ff0000',
                color: 'white',
                width: '100%',
                marginTop: '20px'
              }}
            >
              Clear Network Data
            </button>
          </div>
        )}

        {activeTab === 'physics' && (
          <PhysicsPanel />
        )}
      </div>
    </div>
  );
}; 