import React from 'react';

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  delta?: string | number;
  deltaTone?: 'up' | 'down' | 'flat';
  sub?: string;
  tone?: 'critical' | 'warn' | 'ok' | 'info';
  size?: 'default' | 'lg';
  wall?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/**
 * Metric tile: shadcn card surface with the mono meta label above a display numeral.
 * Follows Black Hat NOC Design System contract.
 */
export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  unit,
  delta,
  deltaTone,
  sub,
  tone,
  size = 'default',
  wall = false,
  style,
  children
}) => {
  const toneColors: Record<string, string> = {
    critical: 'var(--signal-red)',
    warn: 'var(--signal-amber)',
    ok: 'var(--signal-teal)',
    info: 'var(--signal-cyan)'
  };

  const hue = tone ? toneColors[tone] || 'var(--foreground)' : 'var(--foreground)';
  const dTone = deltaTone || (typeof delta === 'string' && delta.trim().startsWith('-') ? 'down' : 'up');
  const dHue = dTone === 'down' ? 'var(--signal-teal)' : dTone === 'flat' ? 'var(--text-muted)' : 'var(--signal-amber)';

  const valueFont = wall
    ? (size === 'lg' ? 'var(--font-weight-bold) var(--text-wall-hero)/.95 var(--font-display)' : 'var(--font-weight-bold) var(--text-wall-metric)/1 var(--font-display)')
    : (size === 'lg' ? 'var(--font-weight-bold) var(--text-4xl)/1 var(--font-display)' : 'var(--font-weight-bold) var(--text-3xl)/1 var(--font-display)');

  return (
    <div 
      style={{
        background: wall ? 'transparent' : 'var(--surface-card, #141414)',
        border: wall ? 'none' : 'var(--border-card, 1px solid rgba(255,255,255,0.1))',
        borderRadius: wall ? 0 : 'var(--radius-xl, 14px)',
        padding: wall ? 0 : '14px 18px',
        display: 'flex', 
        flexDirection: 'column', 
        gap: wall ? '12px' : '8px', 
        minWidth: 0, 
        ...style
      }}
    >
      <div 
        style={{
          font: wall ? 'var(--font-weight-semibold) var(--text-wall-label)/1.1 var(--font-mono)' : 'var(--type-label)',
          letterSpacing: wall ? 'var(--tracking-wide)' : 'var(--tracking-label)',
          textTransform: 'uppercase', 
          color: 'var(--text-muted)'
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
        <span 
          style={{ 
            font: valueFont, 
            color: hue, 
            letterSpacing: 'var(--tracking-hero)', 
            fontVariantNumeric: 'tabular-nums' 
          }}
        >
          {value}
        </span>
        {unit && (
          <span 
            style={{ 
              font: wall ? 'var(--font-weight-medium) var(--text-wall-label) var(--font-mono)' : 'var(--type-data-sm)', 
              color: 'var(--text-muted)' 
            }}
          >
            {unit}
          </span>
        )}
        {delta != null && (
          <span 
            style={{ 
              marginLeft: 'auto', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 4, 
              font: 'var(--type-data-sm)', 
              color: dHue, 
              fontVariantNumeric: 'tabular-nums' 
            }}
          >
            {delta}
          </span>
        )}
      </div>
      {children}
      {sub && (
        <div 
          style={{ 
            font: wall ? 'var(--font-weight-normal) var(--text-wall-body)/1.3 var(--font-sans)' : 'var(--type-data-sm)', 
            color: 'var(--text-faint)' 
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
};
