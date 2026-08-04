import React, { useState, useEffect, useRef } from 'react';
import { usePacketStore } from '../../stores/packetStore';
import { useNetworkStore } from '../../stores/networkStore';

export interface PerformanceTestWindowProps {
  isOpen: boolean;
  onMinimize: () => void;
  onTestModeChange?: (enabled: boolean, nodeCount: number, connectionCount: number) => void;
}

/**
 * Draggable Performance Test Mode window following Black Hat NOC Design System.
 */
export const PerformanceTestWindow: React.FC<PerformanceTestWindowProps> = ({
  isOpen,
  onMinimize,
  onTestModeChange,
}) => {
  const [testEnabled, setTestEnabled] = useState(false);
  const [nodeCount, setNodeCount] = useState(150);
  const [connectionCount, setConnectionCount] = useState(250);

  const [position, setPosition] = useState({ x: 460, y: 68 });
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
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT') return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
  };

  const handleToggle = (checked: boolean) => {
    setTestEnabled(checked);
    onTestModeChange?.(checked, nodeCount, connectionCount);
  };

  const handleNodeChange = (val: number) => {
    setNodeCount(val);
    if (testEnabled) {
      onTestModeChange?.(true, val, connectionCount);
    }
  };

  const handleConnectionChange = (val: number) => {
    setConnectionCount(val);
    if (testEnabled) {
      onTestModeChange?.(true, nodeCount, val);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: `${position.y}px`,
        left: `${position.x}px`,
        zIndex: 1001,
        background: 'var(--surface-card, #141414)',
        border: 'var(--border-card, 1px solid rgba(255, 255, 255, 0.1))',
        borderRadius: 'var(--radius-xl, 14px)',
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
        color: 'var(--text-hi, #fff)',
        width: '360px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Draggable Header */}
      <div
        onMouseDown={handleHeaderMouseDown}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          borderBottom: 'var(--border-card, 1px solid rgba(255,255,255,0.1))',
          background: 'var(--sidebar, #0e0e0e)',
          cursor: 'move',
          borderTopLeftRadius: 'var(--radius-xl, 14px)',
          borderTopRightRadius: 'var(--radius-xl, 14px)',
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
          PERFORMANCE TEST
        </span>
        <button
          onClick={onMinimize}
          style={{
            background: 'transparent',
            border: 'var(--border-control, 1px solid rgba(255,255,255,0.15))',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '2px 8px',
            font: 'var(--type-ui-sm)',
            transition: 'all 0.15s ease',
          }}
        >
          Minimize
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '16px 16px 20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            font: 'var(--type-ui)',
            color: 'var(--text-hi)',
          }}
        >
          <input
            type="checkbox"
            checked={testEnabled}
            onChange={(e) => handleToggle(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          Enable Simulation Generator
        </label>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', font: 'var(--type-ui-sm)' }}>
            <span style={{ color: 'var(--text-muted)' }}>NODES</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--signal-teal)' }}>{nodeCount}</span>
          </div>
          <input
            type="range"
            min="50"
            max="3000"
            step="50"
            value={nodeCount}
            onChange={(e) => handleNodeChange(Number(e.target.value))}
            style={{ width: '100%', cursor: 'pointer' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', font: 'var(--type-ui-sm)' }}>
            <span style={{ color: 'var(--text-muted)' }}>CONNECTIONS</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--signal-violet)' }}>{connectionCount}</span>
          </div>
          <input
            type="range"
            min="50"
            max="5000"
            step="50"
            value={connectionCount}
            onChange={(e) => handleConnectionChange(Number(e.target.value))}
            style={{ width: '100%', cursor: 'pointer' }}
          />
        </div>

        <div
          style={{
            padding: '10px',
            background: 'var(--sidebar, rgba(255,255,255,0.03))',
            borderRadius: 'var(--radius-md, 8px)',
            border: 'var(--border-inset, 1px solid rgba(255,255,255,0.08))',
            fontSize: '11px',
            color: 'var(--text-muted)',
            lineHeight: '1.4',
          }}
        >
          Generates live synthetic network nodes and protocol connections at 60 FPS in-browser for stress testing graphics pipelines.
        </div>
      </div>
    </div>
  );
};
