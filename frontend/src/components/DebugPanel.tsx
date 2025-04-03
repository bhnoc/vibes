import React, { useState, useEffect, useRef } from 'react';
import { usePacketStore } from '../stores/packetStore';

export const DebugPanel: React.FC = () => {
  const { packets } = usePacketStore();
  const [stats, setStats] = useState({
    real: 0,
    simulated: 0,
    unknown: 0
  });
  
  const [memory, setMemory] = useState({
    used: 0,
    total: 0,
    limit: 0
  });
  
  // Update memory stats periodically
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
    
    updateMemory(); // Initial update
    const intervalId = setInterval(updateMemory, 2000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  // Analyze packets when they change
  useEffect(() => {
    const realCount = packets.filter(p => p.source === 'real').length;
    const simulatedCount = packets.filter(p => p.source === 'simulated').length;
    const unknownCount = packets.length - realCount - simulatedCount;
    
    setStats({
      real: realCount,
      simulated: simulatedCount,
      unknown: unknownCount
    });
  }, [packets]);
  
  // Determine memory usage level
  const getMemoryColor = () => {
    if (!memory.limit) return '#00ff41';
    const percentage = (memory.used / memory.limit) * 100;
    if (percentage > 85) return '#ff0000';
    if (percentage > 70) return '#ff8800';
    return '#00ff41';
  };
  
  return (
    <div 
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: 'rgba(0,0,0,0.8)',
        padding: '15px',
        borderRadius: '5px',
        color: '#00ff41',
        fontFamily: 'VT323, monospace',
        fontSize: '16px',
        zIndex: 1000,
        border: '1px solid #00ff41',
        textAlign: 'left',
        minWidth: '250px',
        backdropFilter: 'blur(4px)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}
    >
      <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #00ff41', paddingBottom: '5px' }}>
        System Monitor
      </h3>
      
      {/* Memory usage section */}
      <div style={{ marginBottom: '15px' }}>
        <h4 style={{ margin: '0 0 5px 0', fontSize: '14px' }}>Memory Usage</h4>
        <div style={{ height: '10px', width: '100%', background: '#111', borderRadius: '5px', overflow: 'hidden' }}>
          <div 
            style={{ 
              height: '100%', 
              width: `${memory.limit ? (memory.used / memory.limit) * 100 : 50}%`,
              background: getMemoryColor(),
              transition: 'width 0.5s, background 0.5s'
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '5px' }}>
          <span>{memory.used} MB used</span>
          <span>{memory.limit ? `${memory.limit} MB limit` : 'Unknown limit'}</span>
        </div>
        {memory.used > memory.limit * 0.8 && (
          <div style={{ color: '#ff3333', fontSize: '12px', marginTop: '5px', fontWeight: 'bold' }}>
            Warning: High memory usage - performance may degrade
          </div>
        )}
      </div>
      
      <h4 style={{ margin: '10px 0 5px 0', fontSize: '14px' }}>Packet Analysis</h4>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span>✅ Real packets:</span> 
        <span style={{ 
          color: stats.real > 0 ? '#00ff41' : '#ff3333',
          fontWeight: 'bold'
        }}>
          {stats.real}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span>🤖 Simulated packets:</span> 
        <span style={{ color: '#ff3333' }}>{stats.simulated}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span>❓ Unknown source:</span> 
        <span>{stats.unknown}</span>
      </div>
      <div style={{ 
        marginTop: '10px', 
        textAlign: 'center',
        padding: '5px', 
        background: stats.real > 0 ? 'rgba(0,255,65,0.2)' : 'rgba(255,51,51,0.2)',
        borderRadius: '3px',
        color: stats.real > 0 ? '#00ff41' : '#ff3333',
        fontWeight: 'bold'
      }}>
        {stats.real > 0 
          ? '✅ SHOWING REAL NETWORK DATA' 
          : '⚠️ NO REAL PACKETS DETECTED'}
      </div>
      
      {/* Performance tips when memory usage is high */}
      {memory.used > memory.limit * 0.7 && (
        <div style={{ 
          marginTop: '15px', 
          padding: '8px', 
          fontSize: '12px',
          background: 'rgba(255,136,0,0.2)',
          borderRadius: '3px',
          border: '1px solid #ff8800'
        }}>
          <strong>Performance Tips:</strong>
          <ul style={{ margin: '5px 0 0 15px', padding: 0 }}>
            <li>Switch to "High FPS" performance mode</li>
            <li>Reduce capture duration</li>
            <li>Refresh the page to clear memory</li>
          </ul>
        </div>
      )}
    </div>
  );
}; 