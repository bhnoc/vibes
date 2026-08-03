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
  const { theme, updateThemeColor, resetThemeColors } = useThemeStore();
  const currentTheme = theme || THEMES['blackhat-noc'] || THEMES.classic;

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
        width: '250px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={resetThemeColors}
            title="Reset custom legend colors to defaults"
            style={{
              background: 'transparent',
              border: 'var(--border-control, 1px solid rgba(255,255,255,0.15))',
              color: 'var(--text-muted)',
              borderRadius: 'var(--radius-sm, 6px)',
              padding: '2px 6px',
              font: 'var(--type-ui-sm)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Reset
          </button>
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
      </div>

      <div style={{ display: 'grid', gap: '8px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>TCP STREAM</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} title="Click to customize TCP color">
            <input
              type="color"
              value={currentTheme.edgeTcp}
              onChange={(e) => updateThemeColor('edgeTcp', e.target.value)}
              style={{ width: '18px', height: '14px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            />
            <span style={{ color: currentTheme.edgeTcp }}>{currentTheme.edgeTcp}</span>
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>UDP DATAGRAM</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} title="Click to customize UDP color">
            <input
              type="color"
              value={currentTheme.edgeUdp}
              onChange={(e) => updateThemeColor('edgeUdp', e.target.value)}
              style={{ width: '18px', height: '14px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            />
            <span style={{ color: currentTheme.edgeUdp }}>{currentTheme.edgeUdp}</span>
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>HTTP / WEB</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} title="Click to customize HTTP color">
            <input
              type="color"
              value={currentTheme.edgeHttp}
              onChange={(e) => updateThemeColor('edgeHttp', e.target.value)}
              style={{ width: '18px', height: '14px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            />
            <span style={{ color: currentTheme.edgeHttp }}>{currentTheme.edgeHttp}</span>
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>ICMP CONTROL</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} title="Click to customize ICMP color">
            <input
              type="color"
              value={currentTheme.edgeIcmp}
              onChange={(e) => updateThemeColor('edgeIcmp', e.target.value)}
              style={{ width: '18px', height: '14px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            />
            <span style={{ color: currentTheme.edgeIcmp }}>{currentTheme.edgeIcmp}</span>
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>OTHER PROTOCOL</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} title="Click to customize Default protocol color">
            <input
              type="color"
              value={currentTheme.edgeDefault}
              onChange={(e) => updateThemeColor('edgeDefault', e.target.value)}
              style={{ width: '18px', height: '14px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            />
            <span style={{ color: currentTheme.edgeDefault }}>{currentTheme.edgeDefault}</span>
          </label>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} title="Click to customize Halo color">
            <input
              type="color"
              value={currentTheme.groupHalo}
              onChange={(e) => updateThemeColor('groupHalo', e.target.value)}
              style={{ width: '18px', height: '14px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            />
            <span style={{ color: currentTheme.groupHalo }}>{currentTheme.groupHalo}</span>
          </label>
        </div>
      </div>
    </div>
  );
};
