import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { usePacketStore } from '../stores/packetStore';
import { useNetworkStore } from '../stores/networkStore';

type TabType = 'websocket' | 'performance' | 'system' | 'renderer' | 'stats';

interface UnifiedDebugPanelProps {
  onTestModeChange?: (enabled: boolean, nodeCount: number, connectionCount: number) => void;
  onRendererChange?: (renderer: string) => void;
  currentRenderer?: string;
  rendererOptions?: Array<{
    key: string;
    name: string;
    description: string;
    performance: string;
    status: string;
  }>;
}

export const UnifiedDebugPanel: React.FC<UnifiedDebugPanelProps> = ({
  onTestModeChange,
  onRendererChange,
  currentRenderer = 'canvas',
  rendererOptions = [
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
  ]
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('websocket');
  const [isMinimized, setIsMinimized] = useState(false);
  const [testEnabled, setTestEnabled] = useState(false);
  const [nodeCount, setNodeCount] = useState(2000);
  const [connectionCount, setConnectionCount] = useState(3000);

  const { packets } = usePacketStore();
  const { nodes, connections } = useNetworkStore();

  // WebSocket stats
  const [wsStats, setWsStats] = useState({
    totalPackets: 0,
    recentPackets: 0,
    packetRate: 0,
    lastPacketTime: 0,
    samplePackets: [] as any[]
  });

  // System stats
  const [memory, setMemory] = useState({
    used: 0,
    total: 0,
    limit: 0
  });

  const [packetStats, setPacketStats] = useState({
    real: 0,
    simulated: 0,
    unknown: 0
  });

  // Track render frequency
  const renderCount = useRef(0);
  const lastRenderTime = useRef(Date.now());
  const [renderWarning, setRenderWarning] = useState<string>('');

  // Update WebSocket stats
  useEffect(() => {
    const now = Date.now();
    const recentPackets = packets.filter(p => (now - p.timestamp) < 5000);
    const packetRate = recentPackets.length / 5;
    
    const samplePackets = packets.slice(-3).map(p => ({
      src: p.src,
      dst: p.dst,
      protocol: p.protocol,
      timestamp: p.timestamp,
      age: Math.round((now - p.timestamp) / 1000)
    }));

    setWsStats({
      totalPackets: packets.length,
      recentPackets: recentPackets.length,
      packetRate: Math.round(packetRate * 10) / 10,
      lastPacketTime: packets.length > 0 ? packets[packets.length - 1].timestamp : 0,
      samplePackets
    });
  }, [packets]);

  // Update memory stats
  useEffect(() => {
    const updateMemory = () => {
      if (window.performance && (window.performance as any).memory) {
        const memInfo = (window.performance as any).memory;
        setMemory({
          used: Math.round(memInfo.usedJSHeapSize / 1024 / 1024),
          total: Math.round(memInfo.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(memInfo.jsHeapSizeLimit / 1024 / 1024)
        });
      }
    };
    
    updateMemory();
    const intervalId = setInterval(updateMemory, 2000);
    return () => clearInterval(intervalId);
  }, []);

  // Update packet analysis
  useEffect(() => {
    const realCount = packets.filter(p => p.source === 'real').length;
    const simulatedCount = packets.filter(p => p.source === 'simulated').length;
    const unknownCount = packets.length - realCount - simulatedCount;
    
    setPacketStats({
      real: realCount,
      simulated: simulatedCount,
      unknown: unknownCount
    });
  }, [packets]);

  // Track render frequency
  useEffect(() => {
    renderCount.current++;
    const now = Date.now();
    
    if (now - lastRenderTime.current < 100) {
      if (renderCount.current > 10) {
        setRenderWarning(`⚠️ High render frequency detected! ${renderCount.current} renders in ${now - lastRenderTime.current}ms`);
      }
    } else {
      renderCount.current = 0;
      lastRenderTime.current = now;
      setRenderWarning('');
    }
  });

  // Network statistics
  const networkStats = useMemo(() => {
    const protocolStats = packets.reduce((acc, packet) => {
      acc[packet.protocol] = (acc[packet.protocol] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalPackets: packets.length,
      uniqueNodes: nodes.length,
      uniqueConnections: connections.length,
      protocolStats
    };
  }, [packets, nodes, connections]);

  // Handle test mode changes
  const handleTestModeChange = (enabled: boolean) => {
    setTestEnabled(enabled);
    onTestModeChange?.(enabled, nodeCount, connectionCount);
  };

  const handleNodeCountChange = (count: number) => {
    setNodeCount(count);
    if (testEnabled) {
      onTestModeChange?.(true, count, connectionCount);
    }
  };

  const handleConnectionCountChange = (count: number) => {
    setConnectionCount(count);
    if (testEnabled) {
      onTestModeChange?.(true, nodeCount, count);
    }
  };

  const tabs = [
    { id: 'websocket', label: '🔌 WebSocket', icon: '📡' },
    { id: 'performance', label: '🧪 Performance', icon: '⚡' },
    { id: 'system', label: '💻 System', icon: '📊' },
    { id: 'renderer', label: '🖥️ Renderer', icon: '🎨' },
    { id: 'stats', label: '📈 Stats', icon: '📋' }
  ];

  const getMemoryColor = () => {
    if (!memory.limit) return '#00ff41';
    const percentage = (memory.used / memory.limit) * 100;
    if (percentage > 85) return '#ff0000';
    if (percentage > 70) return '#ff8800';
    return '#00ff41';
  };

  const lastPacketAge = wsStats.lastPacketTime > 0 ? 
    Math.round((Date.now() - wsStats.lastPacketTime) / 1000) : 0;

  if (isMinimized) {
    return (
      <div style={{
        position: 'fixed',
        top: '60px',
        right: '10px',
        zIndex: 1001,
        background: 'rgba(0, 0, 0, 0.9)',
        border: '1px solid #00ff00',
        borderRadius: '4px',
        padding: '8px 12px',
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#00ff00',
        cursor: 'pointer'
      }} onClick={() => setIsMinimized(false)}>
        🔧 Debug Panel (Click to expand)
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: '60px',
      right: '10px',
      zIndex: 1001,
      background: 'rgba(0, 0, 0, 0.95)',
      border: '1px solid #00ff00',
      borderRadius: '6px',
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#00ff00',
      width: '400px',
      maxHeight: '80vh',
      overflow: 'hidden',
      backdropFilter: 'blur(4px)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid #00ff00',
        background: 'rgba(0, 255, 0, 0.1)'
      }}>
        <span style={{ fontWeight: 'bold', color: '#00ff00' }}>🔧 Debug Panel</span>
        <button
          onClick={() => setIsMinimized(true)}
          style={{
            background: 'none',
            border: '1px solid #00ff00',
            color: '#00ff00',
            cursor: 'pointer',
            borderRadius: '2px',
            padding: '2px 6px',
            fontSize: '10px'
          }}
        >
          ➖
        </button>
      </div>

      {/* Tab navigation */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #333'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            style={{
              flex: 1,
              padding: '8px 4px',
              background: activeTab === tab.id ? 'rgba(0, 255, 0, 0.2)' : 'transparent',
              border: 'none',
              color: activeTab === tab.id ? '#00ff00' : '#666',
              cursor: 'pointer',
              fontSize: '9px',
              borderRight: '1px solid #333'
            }}
          >
            <div>{tab.icon}</div>
            <div style={{ fontSize: '8px' }}>{tab.label.split(' ')[1]}</div>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{
        padding: '12px',
        maxHeight: '60vh',
        overflowY: 'auto'
      }}>
        {activeTab === 'websocket' && (
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ffaa00' }}>
              📡 WebSocket Data Flow
            </div>
            
            {renderWarning && (
              <div style={{ 
                color: '#ff4444', 
                marginBottom: '8px', 
                border: '1px solid #ff4444', 
                padding: '4px', 
                borderRadius: '2px',
                fontSize: '10px'
              }}>
                {renderWarning}
              </div>
            )}
            
            <div style={{ marginBottom: '4px' }}>
              📦 Total Packets: <span style={{ color: '#fff' }}>{wsStats.totalPackets}</span>
            </div>
            <div style={{ marginBottom: '4px' }}>
              ⚡ Recent (5s): <span style={{ color: '#fff' }}>{wsStats.recentPackets}</span>
            </div>
            <div style={{ marginBottom: '4px' }}>
              📊 Rate: <span style={{ color: '#fff' }}>{wsStats.packetRate}/sec</span>
            </div>
            <div style={{ marginBottom: '4px' }}>
              ⏰ Last packet: <span style={{ color: lastPacketAge > 10 ? '#ff4444' : '#fff' }}>
                {lastPacketAge}s ago
              </span>
            </div>
            
            <div style={{ marginTop: '8px', marginBottom: '4px', color: '#00ff00' }}>
              📡 Store Status:
            </div>
            <div style={{ marginBottom: '4px' }}>
              🔘 Nodes: <span style={{ color: '#fff' }}>{nodes.length}</span>
            </div>
            <div style={{ marginBottom: '4px' }}>
              🔗 Connections: <span style={{ color: '#fff' }}>{connections.length}</span>
            </div>
            
            <div style={{ marginTop: '8px', marginBottom: '4px', color: '#00aaff' }}>
              📋 Recent Packets:
            </div>
            {wsStats.samplePackets.map((packet, idx) => (
              <div key={idx} style={{ fontSize: '9px', marginBottom: '2px', color: '#ccc' }}>
                {packet.src} → {packet.dst} ({packet.protocol}) {packet.age}s ago
              </div>
            ))}
            
            <div style={{ marginTop: '8px', fontSize: '9px', color: '#666' }}>
              🔄 Renders: {renderCount.current}
            </div>
          </div>
        )}

        {activeTab === 'performance' && (
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ffaa00' }}>
              🧪 Performance Test Control
            </div>
            
            <label style={{ display: 'block', marginBottom: '8px' }}>
              <input
                type="checkbox"
                checked={testEnabled}
                onChange={(e) => handleTestModeChange(e.target.checked)}
                style={{ marginRight: '8px' }}
              />
              Enable Test Mode
            </label>

            <label style={{ display: 'block', marginBottom: '8px' }}>
              Nodes:
              <input
                type="number"
                value={nodeCount}
                onChange={(e) => handleNodeCountChange(parseInt(e.target.value) || 1000)}
                min="100"
                max="10000"
                disabled={!testEnabled}
                style={{ 
                  width: '80px', 
                  marginLeft: '8px',
                  background: 'black',
                  color: '#00ff00',
                  border: '1px solid #00ff00',
                  padding: '2px 4px'
                }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: '8px' }}>
              Connections:
              <input
                type="number"
                value={connectionCount}
                onChange={(e) => handleConnectionCountChange(parseInt(e.target.value) || 1000)}
                min="100"
                max="15000"
                disabled={!testEnabled}
                style={{ 
                  width: '80px', 
                  marginLeft: '8px',
                  background: 'black',
                  color: '#00ff00',
                  border: '1px solid #00ff00',
                  padding: '2px 4px'
                }}
              />
            </label>

            {testEnabled && (
              <div style={{
                marginTop: '12px',
                padding: '8px',
                background: 'rgba(0, 255, 0, 0.1)',
                border: '1px solid #00ff00',
                borderRadius: '4px'
              }}>
                <div>🧪 Performance Test Active</div>
                <div>Nodes: {nodeCount}</div>
                <div>Connections: {connectionCount}</div>
                <div style={{ fontSize: '9px', color: '#888' }}>
                  Simulating Agar.io-scale data
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'system' && (
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ffaa00' }}>
              💻 System Monitor
            </div>
            
            {/* Memory usage */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ marginBottom: '4px', fontSize: '10px' }}>Memory Usage:</div>
              <div style={{ height: '8px', width: '100%', background: '#111', borderRadius: '4px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    width: `${memory.limit ? (memory.used / memory.limit) * 100 : 50}%`,
                    background: getMemoryColor(),
                    transition: 'width 0.5s, background 0.5s'
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginTop: '2px' }}>
                <span>{memory.used} MB used</span>
                <span>{memory.limit ? `${memory.limit} MB limit` : 'Unknown limit'}</span>
              </div>
            </div>

            {/* Packet Analysis */}
            <div style={{ marginBottom: '4px', fontSize: '10px' }}>Packet Analysis:</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span>✅ Real packets:</span> 
              <span style={{ 
                color: packetStats.real > 0 ? '#00ff41' : '#ff3333',
                fontWeight: 'bold'
              }}>
                {packetStats.real}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span>🤖 Simulated:</span> 
              <span style={{ color: '#ff3333' }}>{packetStats.simulated}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span>❓ Unknown:</span> 
              <span>{packetStats.unknown}</span>
            </div>
            
            <div style={{ 
              padding: '4px', 
              background: packetStats.real > 0 ? 'rgba(0,255,65,0.2)' : 'rgba(255,51,51,0.2)',
              borderRadius: '3px',
              color: packetStats.real > 0 ? '#00ff41' : '#ff3333',
              fontWeight: 'bold',
              fontSize: '9px',
              textAlign: 'center'
            }}>
              {packetStats.real > 0 
                ? '✅ SHOWING REAL NETWORK DATA' 
                : '⚠️ NO REAL PACKETS DETECTED'}
            </div>
          </div>
        )}

        {activeTab === 'renderer' && (
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ffaa00' }}>
              🖥️ Rendering Engine
            </div>
            
            {/* Canvas Renderer Stats */}
            {currentRenderer === 'canvas' && (
              <div style={{ 
                marginBottom: '12px',
                padding: '6px',
                background: 'rgba(0, 255, 65, 0.1)',
                borderRadius: '4px',
                border: '1px solid rgba(0, 255, 65, 0.3)'
              }}>
                <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', color: '#00ff41' }}>
                  🎨 Canvas Renderer v2.0 - Live Stats
                </div>
                <div style={{ fontSize: '9px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
                  <span>FPS:</span><span style={{ color: '#fff' }}>Real-time</span>
                  <span>Zoom:</span><span style={{ color: '#fff' }}>Interactive</span>
                  <span>Pan:</span><span style={{ color: '#fff' }}>Mouse control</span>
                  <span>Controls:</span><span style={{ color: '#fff' }}>Mouse + Wheel</span>
                </div>
                <div style={{ fontSize: '8px', marginTop: '4px', color: '#888' }}>
                  Tip: Mouse to pan, wheel to zoom, R to reset view
                </div>
              </div>
            )}
            
            {rendererOptions.map((renderer) => (
              <div key={renderer.key} style={{ marginBottom: '6px' }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  cursor: 'pointer',
                  padding: '4px',
                  backgroundColor: currentRenderer === renderer.key ? 'rgba(0, 255, 0, 0.2)' : 'transparent',
                  borderRadius: '2px'
                }}>
                  <input
                    type="radio"
                    name="renderer"
                    value={renderer.key}
                    checked={currentRenderer === renderer.key}
                    onChange={(e) => onRendererChange?.(e.target.value)}
                    style={{ marginRight: '8px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '10px' }}>{renderer.name}</div>
                    <div style={{ fontSize: '8px', color: '#aaa' }}>
                      {renderer.performance} | {renderer.status}
                    </div>
                    <div style={{ fontSize: '8px', color: '#888' }}>
                      {renderer.description}
                    </div>
                  </div>
                </label>
              </div>
            ))}
            
            <div style={{ 
              marginTop: '8px', 
              padding: '4px', 
              backgroundColor: 'rgba(0, 100, 0, 0.3)',
              fontSize: '8px',
              borderRadius: '2px'
            }}>
              💡 Canvas renderer is optimized for Agar.io-scale performance
            </div>

            <div style={{
              marginTop: '8px',
              padding: '4px',
              background: 'rgba(0, 0, 255, 0.2)',
              borderRadius: '2px',
              fontSize: '9px',
              textAlign: 'center'
            }}>
              Active: {rendererOptions.find(r => r.key === currentRenderer)?.name || currentRenderer}
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ffaa00' }}>
              📈 Network Statistics
            </div>
            
            {/* Stats Grid */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>📦 Total Packets:</span>
                <span style={{ color: '#fff', fontWeight: 'bold' }}>{networkStats.totalPackets}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>🔘 Unique Nodes:</span>
                <span style={{ color: '#fff', fontWeight: 'bold' }}>{networkStats.uniqueNodes}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>🔗 Connections:</span>
                <span style={{ color: '#fff', fontWeight: 'bold' }}>{networkStats.uniqueConnections}</span>
              </div>
            </div>

            {/* Protocol Distribution */}
            <div style={{ marginBottom: '4px', fontSize: '10px', color: '#00aaff' }}>
              Protocol Distribution:
            </div>
            {Object.entries(networkStats.protocolStats).map(([protocol, count]) => (
              <div key={protocol} style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '2px',
                fontSize: '9px'
              }}>
                <span style={{ color: '#aaa' }}>{protocol}:</span>
                <span style={{ color: '#fff' }}>{count}</span>
              </div>
            ))}

            {Object.keys(networkStats.protocolStats).length === 0 && (
              <div style={{ color: '#666', fontSize: '9px', fontStyle: 'italic' }}>
                No protocols detected yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}; 