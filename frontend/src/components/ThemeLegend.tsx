import React, { useState, useEffect, useRef } from 'react';
import { useThemeStore, THEMES } from '../stores/themeStore';

/**
 * Collapsible protocol & node color legend for visual themes.
 */
export interface ThemeLegendProps {
  isOpen?: boolean;
  onMinimize?: () => void;
}

/**
 * Collapsible protocol & node color legend for visual themes.
 */
export const ThemeLegend: React.FC<ThemeLegendProps> = ({ isOpen = true, onMinimize }) => {
  const { themeKey } = useThemeStore();
  const theme = THEMES[themeKey] || THEMES['blackhat-noc'] || THEMES.classic;

  const [position, setPosition] = useState({ x: 18, y: typeof window !== 'undefined' ? window.innerHeight - 300 : 500 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 240, dragRef.current.initialX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.initialY + dy)),
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

  if (!isOpen) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: `${position.y}px`,
        left: `${position.x}px`,
        zIndex: 900,
        background: 'var(--surface-card, #141414)',
        border: 'var(--border-card, 1px solid rgba(255, 255, 255, 0.15))',
        borderRadius: 'var(--radius-xl, 14px)',
        padding: '12px 14px',
        color: 'var(--text-hi, #fff)',
        fontFamily: 'var(--font-sans)',
        width: '240px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onMouseDown={handleHeaderMouseDown}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
          borderBottom: 'var(--border-inset, 1px solid rgba(255,255,255,0.1))',
          paddingBottom: '8px',
          cursor: 'move',
        }}
      >
        <span
          style={{
            font: 'var(--type-label)',
            letterSpacing: 'var(--tracking-wide, 0.14em)',
            textTransform: 'uppercase',
            color: 'var(--text-hi, #fff)',
          }}
        >
          LEGEND
        </span>
        <button
          onClick={onMinimize}
          style={{
            background: 'transparent',
            border: 'var(--border-control, 1px solid rgba(255,255,255,0.15))',
            color: 'var(--text-muted)',
            borderRadius: 'var(--radius-sm, 6px)',
            padding: '2px 8px',
            font: 'var(--type-ui-sm)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Minimize
        </button>
      </div>

      <div style={{ display: 'grid', gap: '8px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>TCP STREAM</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 12, height: 3, background: theme.edgeTcp, borderRadius: 2 }} />
            <span style={{ color: theme.edgeTcp }}>{theme.edgeTcp}</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>UDP DATAGRAM</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 12, height: 3, background: theme.edgeUdp, borderRadius: 2 }} />
            <span style={{ color: theme.edgeUdp }}>{theme.edgeUdp}</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>HTTP / WEB</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 12, height: 3, background: theme.edgeHttp, borderRadius: 2 }} />
            <span style={{ color: theme.edgeHttp }}>{theme.edgeHttp}</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>ICMP CONTROL</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 12, height: 3, background: theme.edgeIcmp, borderRadius: 2 }} />
            <span style={{ color: theme.edgeIcmp }}>{theme.edgeIcmp}</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>OTHER PROTOCOL</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 12, height: 3, background: theme.edgeDefault, borderRadius: 2 }} />
            <span style={{ color: theme.edgeDefault }}>{theme.edgeDefault}</span>
          </span>
        </div>

        <div
          style={{
            marginTop: '4px',
            paddingTop: '6px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>GROUP HALO</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, border: `2px solid ${theme.groupHalo}` }} />
            <span style={{ color: theme.groupHalo }}>ACTIVE</span>
          </span>
        </div>
      </div>
    </div>
  );
};
