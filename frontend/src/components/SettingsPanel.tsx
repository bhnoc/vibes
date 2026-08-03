import React, { useState, useRef, useEffect } from 'react';
import { useNetworkStore } from '../stores/networkStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useThemeStore, THEMES } from '../stores/themeStore';
import { FiWifi, FiSliders } from 'react-icons/fi';
import { PhysicsPanel } from './PhysicsPanel';

type Tab = 'network' | 'physics';

const WifiIcon = FiWifi as React.ElementType;
const SlidersIcon = FiSliders as React.ElementType;

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
  const [ifaceOpen, setIfaceOpen] = useState(false);
  const ifaceRef = useRef<HTMLDivElement>(null);
  const { clearNetwork } = useNetworkStore();
  const { maxNodes, setMaxNodes, maxConnectionsPerNode, setMaxConnectionsPerNode } = useSettingsStore();
  const { themeKey, setTheme } = useThemeStore();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ifaceRef.current && !ifaceRef.current.contains(e.target as Node)) setIfaceOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [position, setPosition] = useState({ x: typeof window !== 'undefined' ? window.innerWidth - 380 : 800, y: 68 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 300, dragRef.current.initialX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 80, dragRef.current.initialY + dy)),
      });
    };
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
  };

  const handlePanelMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handlePanelWheel = (e: React.WheelEvent) => {
    // Keep scroll inside the panel; don't zoom/pan the canvas underneath.
    e.stopPropagation();
  };

  return (
    <div
      className="settings-panel"
      onMouseDown={handlePanelMouseDown}
      onWheel={handlePanelWheel}
      style={{ top: `${position.y}px`, left: `${position.x}px`, right: 'auto' }}
    >
      <div
        onMouseDown={handleHeaderMouseDown}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'move',
          paddingBottom: '12px',
          marginBottom: '12px',
          borderBottom: 'var(--border-inset, 1px solid rgba(255,255,255,0.1))',
        }}
      >
        <span
          style={{
            font: 'var(--type-label)',
            letterSpacing: '0.14em',
            color: 'var(--text-hi, #fff)',
            textTransform: 'uppercase',
          }}
        >
          SETTINGS
        </span>
        <button onClick={onMinimize} className="minimize-btn">Minimize</button>
      </div>
      
      {/* Tab Navigation */}
      <div className="button-group">
        <button 
          className={activeTab === 'network' ? 'active' : ''}
          onClick={() => setActiveTab('network')}
        >
          <WifiIcon style={{display: 'inline-block', marginRight: '5px', verticalAlign: 'middle'}} />
          Network
        </button>
        <button 
          className={activeTab === 'physics' ? 'active' : ''}
          onClick={() => setActiveTab('physics')}
        >
          <SlidersIcon style={{display: 'inline-block', marginRight: '5px', verticalAlign: 'middle'}} />
          Physics
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'network' && (
          <div style={{marginTop: '20px'}}>
            <h3>Theme</h3>
            <div className="button-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {Object.values(THEMES).map(t => (
                <button
                  key={t.key}
                  className={themeKey === t.key ? 'active' : ''}
                  onClick={() => setTheme(t.key)}
                  style={{ fontSize: '11px', padding: '8px 4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}
                  title={t.label}
                >
                  {t.label}
                </button>
              ))}
            </div>

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
                <p style={{ fontSize: '11px', opacity: 0.8, marginBottom: '8px', color: 'var(--text-muted)' }}>
                  Backend listens here; stream conn JSON lines (e.g. from zeek-cut | your forwarder).
                </p>
                <input
                  type="text"
                  value={zeekTcpAddr}
                  onChange={(e) => onZeekTcpAddrChange(e.target.value)}
                  placeholder=":4777"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: 'var(--card, #141414)',
                    border: 'var(--border-control, 1px solid rgba(255, 255, 255, 0.15))',
                    borderRadius: 'var(--radius-sm, 6px)',
                    color: 'var(--text-hi, #fff)',
                    font: 'var(--type-mono)',
                  }}
                />
              </div>
            )}

            {captureMode === 'real' && (
              <div className="interface-select" style={{ marginTop: '16px' }}>
                <h3>Network Interface</h3>
                <div ref={ifaceRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setIfaceOpen(v => !v)}
                    style={{
                      width: '100%',
                      background: 'var(--card, #141414)',
                      border: 'var(--border-control, 1px solid rgba(255, 255, 255, 0.15))',
                      borderRadius: 'var(--radius-md, 8px)',
                      color: 'var(--text-hi, #fff)',
                      padding: '8px 12px',
                      font: 'var(--type-ui)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedInterface
                        ? (interfaces.find(i => i.name === selectedInterface)?.description || selectedInterface)
                        : 'Select Interface'}
                    </span>
                    <span style={{ marginLeft: '8px', flexShrink: 0, color: 'var(--text-muted)' }}>{ifaceOpen ? '▲' : '▼'}</span>
                  </button>
                  {ifaceOpen && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      background: 'var(--surface-card, #141414)',
                      border: 'var(--border-card, 1px solid rgba(255, 255, 255, 0.15))',
                      borderRadius: 'var(--radius-md, 8px)',
                      zIndex: 1100,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.65)',
                    }}>
                      {interfaces.length === 0 && (
                        <div style={{ padding: '8px 12px', color: 'var(--text-muted)', font: 'var(--type-ui-sm)' }}>
                          No interfaces found
                        </div>
                      )}
                      {interfaces.map(iface => (
                        <div
                          key={iface.name}
                          onClick={() => { onInterfaceSelect(iface.name); setIfaceOpen(false); }}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            color: iface.name === selectedInterface ? 'var(--signal-teal, #00d2aa)' : 'var(--text-hi, #fff)',
                            background: iface.name === selectedInterface ? 'var(--wash-ok, rgba(0, 210, 170, 0.14))' : 'transparent',
                            font: 'var(--type-ui-sm)',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                          }}
                          onMouseEnter={e => { if (iface.name !== selectedInterface) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)'; }}
                          onMouseLeave={e => { if (iface.name !== selectedInterface) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                        >
                          {iface.description || iface.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', opacity: 0.85 }}>
                <span>50</span><span>1000</span>
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <label>Max Connections per Node: {maxConnectionsPerNode}</label>
              <input
                type="range"
                min="1"
                max="150"
                step="1"
                value={maxConnectionsPerNode}
                onChange={(e) => setMaxConnectionsPerNode(Number(e.target.value))}
                style={{ width: '100%', marginTop: '6px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', opacity: 0.85 }}>
                <span>1</span><span>150</span>
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
          <div style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingRight: '8px' }}>
            <PhysicsPanel />
          </div>
        )}
      </div>
    </div>
  );
}; 
