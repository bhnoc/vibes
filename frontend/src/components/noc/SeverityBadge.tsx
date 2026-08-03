import React from 'react';
import { StatusLevel } from './StatusDot';

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'ok' | 'ready' | 'waiting' | 'error';

const LEVELS: Record<SeverityLevel, [string, string]> = {
  critical: ['CRITICAL', 'critical'],
  error: ['ERROR', 'critical'],
  high: ['HIGH', 'high'],
  medium: ['MEDIUM', 'medium'],
  waiting: ['WAITING', 'medium'],
  low: ['LOW', 'low'],
  info: ['INFO', 'info'],
  ok: ['ACTIVE', 'ok'],
  ready: ['READY', 'ok']
};

const HUES: Record<string, string> = {
  critical: 'var(--status-critical)',
  error: 'var(--status-critical)',
  high: 'var(--status-high)',
  medium: 'var(--status-medium)',
  waiting: 'var(--status-medium)',
  low: 'var(--status-low)',
  info: 'var(--status-low)',
  ok: 'var(--status-ok)',
  ready: 'var(--status-ok)'
};

export interface SeverityBadgeProps {
  level?: SeverityLevel | string;
  label?: string;
  compact?: boolean;
  style?: React.CSSProperties;
  showDot?: boolean;
}

/**
 * Severity badge locked to Black Hat NOC severity levels and washes.
 */
export const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  level = 'info',
  label: customLabel,
  compact = false,
  style,
  showDot = true
}) => {
  const levelEntry = LEVELS[level as SeverityLevel] || [level.toUpperCase(), 'info'];
  const displayLabel = customLabel || levelEntry[0];
  const hue = HUES[levelEntry[1]] || HUES.info;

  if (compact) {
    return (
      <span 
        role="img" 
        aria-label={`${displayLabel} severity`} 
        title={displayLabel} 
        style={{ 
          display: 'inline-block', 
          width: 3, 
          height: 14, 
          background: hue, 
          borderRadius: 1, 
          ...style 
        }} 
      />
    );
  }

  return (
    <span 
      style={{ 
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 9px',
        borderRadius: 'var(--radius-md, 8px)',
        background: `color-mix(in oklab, ${hue} 15%, transparent)`,
        color: hue,
        border: `1px solid color-mix(in oklab, ${hue} 35%, transparent)`,
        font: 'var(--type-data-sm)',
        fontVariantNumeric: 'tabular-nums',
        textTransform: 'uppercase',
        letterSpacing: 'var(--tracking-label, 0.08em)',
        ...style 
      }}
    >
      {showDot && (
        <span 
          style={{ 
            width: 6, 
            height: 6, 
            borderRadius: 'var(--radius-full, 9999px)', 
            background: hue 
          }} 
        />
      )}
      {displayLabel}
    </span>
  );
};
