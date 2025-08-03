import React, { useState } from 'react';
import { useNetworkStore } from '../stores/networkStore';
import { FiWifi, FiSliders } from 'react-icons/fi';
import { PhysicsPanel } from './PhysicsPanel';

type Tab = 'network' | 'physics';

export const SettingsPanel: React.FC<{
  captureMode: 'simulated' | 'real' | 'waiting';
  onCaptureModeChange: (mode: 'simulated' | 'real') => void;
  interfaces: Array<{ name: string; description: string }>;
  selectedInterface: string;
  onInterfaceSelect: (iface: string) => void;
  onMinimize: () => void;
}> = ({ 
  captureMode, 
  onCaptureModeChange, 
  interfaces, 
  selectedInterface, 
  onInterfaceSelect,
  onMinimize
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('network');
  const { clearNetwork } = useNetworkStore();

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
            </div>

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