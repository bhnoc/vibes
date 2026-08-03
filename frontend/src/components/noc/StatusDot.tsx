import React from 'react';

export type StatusLevel = 
  | 'ok' | 'online' | 'ready' | 'connected'
  | 'critical' | 'error'
  | 'high'
  | 'medium' | 'degraded' | 'warning' | 'waiting' | 'connecting'
  | 'low' | 'info'
  | 'idle' | 'offline';

const HUES: Record<StatusLevel, string> = {
  ok: 'var(--status-ok)',
  online: 'var(--status-ok)',
  ready: 'var(--status-ok)',
  connected: 'var(--status-ok)',
  critical: 'var(--status-critical)',
  error: 'var(--status-critical)',
  high: 'var(--status-high)',
  medium: 'var(--status-medium)',
  degraded: 'var(--status-medium)',
  warning: 'var(--status-medium)',
  waiting: 'var(--status-medium)',
  connecting: 'var(--status-medium)',
  low: 'var(--status-low)',
  info: 'var(--status-low)',
  idle: 'var(--status-idle)',
  offline: 'var(--status-idle)'
};

export interface StatusDotProps {
  status?: StatusLevel | string;
  size?: number;
  pulse?: boolean;
  ping?: boolean;
  label?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
}

/**
 * Status atom: a solid dot in the status hue. Status is a dot plus a word, never an icon.
 * Follows Black Hat NOC Design System contract.
 */
export const StatusDot: React.FC<StatusDotProps> = ({
  status = 'ok',
  size = 8,
  pulse = false,
  ping = false,
  label,
  ariaLabel,
  style
}) => {
  const hue = HUES[status as StatusLevel] || HUES.idle;
  
  const dot = (
    <span 
      role={ariaLabel ? 'img' : undefined} 
      aria-label={ariaLabel} 
      aria-hidden={!ariaLabel ? 'true' : undefined}
      style={{ 
        position: 'relative', 
        width: size, 
        height: size, 
        flex: '0 0 auto', 
        display: 'inline-block',
        ...(!label ? style : {})
      }}
    >
      <span style={{ 
        position: 'absolute', 
        inset: 0, 
        borderRadius: 'var(--radius-full, 9999px)', 
        background: hue, 
        animation: pulse ? 'bh-pulse 2s ease-in-out infinite' : undefined 
      }} />
      {ping && (
        <span style={{ 
          position: 'absolute', 
          inset: 0, 
          borderRadius: 'var(--radius-full, 9999px)', 
          background: hue, 
          animation: 'bh-ping 1.8s ease-out infinite' 
        }} />
      )}
    </span>
  );

  if (!label) {
    return dot;
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', ...style }}>
      {dot}
      <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-muted)' }}>{label}</span>
    </span>
  );
};
