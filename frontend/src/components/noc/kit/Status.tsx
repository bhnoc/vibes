import React from 'react';
import { Sparkline } from './Meters';
import { SignalTone } from './Badge';

/**
 * The three most-repeated atoms in the system: the status dot, the severity
 * chip, and the metric tile.
 *
 * Status is a dot plus a word, never an icon, and never colour alone — the word
 * is what a colour-blind operator reads and what a screen reader announces.
 */

export type StatusLevel =
  | 'ok' | 'online' | 'ready' | 'connected'
  | 'critical' | 'error'
  | 'high'
  | 'medium' | 'degraded' | 'warning' | 'waiting' | 'connecting'
  | 'low' | 'info'
  | 'idle' | 'offline';

const STATUS_HUES: Record<StatusLevel, string> = {
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
  offline: 'var(--status-idle)',
};

export interface StatusDotProps {
  status?: StatusLevel | string;
  size?: number;
  /** Live heartbeat. Only set this where values are actually arriving. */
  pulse?: boolean;
  /** An event landing this second. */
  ping?: boolean;
  label?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
}

export const StatusDot: React.FC<StatusDotProps> = ({ status = 'ok', size = 8, pulse, ping, label, ariaLabel, style }) => {
  const hue = STATUS_HUES[status as StatusLevel] || STATUS_HUES.idle;

  const dot = (
    <span
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={!ariaLabel ? true : undefined}
      style={{ position: 'relative', width: size, height: size, flex: '0 0 auto', display: 'inline-block', ...(!label ? style : null) }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'var(--radius-full)',
          background: hue,
          animation: pulse ? 'bh-pulse var(--duration-pulse) var(--ease-in-out) infinite' : undefined,
        }}
      />
      {ping ? <span style={{ position: 'absolute', inset: 0, borderRadius: 'var(--radius-full)', background: hue, animation: 'bh-ping 1.8s ease-out infinite' }} /> : null}
    </span>
  );

  if (!label) return dot;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-1-5)', ...style }}>
      {dot}
      <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-muted)' }}>{label}</span>
    </span>
  );
};

/* -------------------------------------------------------------------------- */

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'ok' | 'ready' | 'waiting' | 'error';

const SEVERITY: Record<SeverityLevel, [string, string]> = {
  critical: ['CRITICAL', 'var(--status-critical)'],
  error: ['ERROR', 'var(--status-critical)'],
  high: ['HIGH', 'var(--status-high)'],
  medium: ['MEDIUM', 'var(--status-medium)'],
  waiting: ['WAITING', 'var(--status-medium)'],
  low: ['LOW', 'var(--status-low)'],
  info: ['INFO', 'var(--status-low)'],
  ok: ['ACTIVE', 'var(--status-ok)'],
  ready: ['READY', 'var(--status-ok)'],
};

export interface SeverityBadgeProps {
  level?: SeverityLevel | string;
  label?: string;
  /** The 3px bar used inside dense table rows, where a full chip would not fit. */
  compact?: boolean;
  showDot?: boolean;
  /** Unacknowledged critical. Stops on acknowledgement. */
  blink?: boolean;
  style?: React.CSSProperties;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ level = 'info', label, compact, showDot = true, blink, style }) => {
  const [defaultLabel, hue] = SEVERITY[level as SeverityLevel] || [String(level).toUpperCase(), 'var(--status-low)'];
  const text = label || defaultLabel;

  if (compact) {
    return (
      <span
        role="img"
        aria-label={`${text} severity`}
        title={text}
        style={{ display: 'inline-block', width: 3, height: 14, background: hue, borderRadius: 1, ...style }}
      />
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--spacing-1-5)',
        maxWidth: '100%',
        padding: '2px var(--spacing-2)',
        borderRadius: 'var(--radius-full)',
        background: `color-mix(in oklab, ${hue} 15%, transparent)`,
        color: hue,
        border: `1px solid color-mix(in oklab, ${hue} 35%, transparent)`,
        font: 'var(--type-data-sm)',
        fontVariantNumeric: 'tabular-nums',
        textTransform: 'uppercase',
        letterSpacing: 'var(--tracking-label)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        ...style,
      }}
    >
      {showDot ? (
        <span
          style={{
            width: 6,
            height: 6,
            flex: '0 0 auto',
            borderRadius: 'var(--radius-full)',
            background: hue,
            animation: blink ? 'bh-blink 1s steps(1) infinite' : undefined,
          }}
        />
      ) : null}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
    </span>
  );
};

/* -------------------------------------------------------------------------- */

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'flat';
  sub?: React.ReactNode;
  tone?: SignalTone;
  /** Trend behind the numeral. Pass the same series the value was sampled from. */
  series?: number[];
  size?: 'default' | 'sm' | 'lg';
  /** Renders bare, for the canvas overlay where a card border would be noise. */
  bare?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

const TONE_HUES: Record<SignalTone, string> = {
  critical: 'var(--signal-red)',
  warn: 'var(--signal-amber)',
  ok: 'var(--signal-teal)',
  info: 'var(--signal-cyan)',
  rf: 'var(--signal-violet)',
  neutral: 'var(--foreground)',
};

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  unit,
  delta,
  deltaTone,
  sub,
  tone,
  series,
  size = 'default',
  bare,
  style,
  children,
}) => {
  const hue = tone ? TONE_HUES[tone] : 'var(--foreground)';
  const resolvedDeltaTone = deltaTone || (delta?.trim().startsWith('-') ? 'down' : 'up');
  const deltaHue = resolvedDeltaTone === 'down' ? 'var(--signal-teal)' : resolvedDeltaTone === 'flat' ? 'var(--text-muted)' : 'var(--signal-amber)';

  const valueSize = size === 'lg' ? 'var(--text-4xl)' : size === 'sm' ? 'var(--text-xl)' : 'var(--text-3xl)';

  return (
    <div
      style={{
        background: bare ? 'transparent' : 'var(--card)',
        border: bare ? 'none' : 'var(--border-card)',
        borderRadius: bare ? 0 : 'var(--radius-xl)',
        padding: bare ? 0 : 'var(--spacing-3) var(--spacing-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-2)',
        minWidth: 0,
        ...style,
      }}
    >
      <div
        style={{
          font: 'var(--type-label)',
          letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-2)', minWidth: 0 }}>
        <span
          style={{
            font: `var(--font-weight-bold) ${valueSize}/1 var(--font-display)`,
            color: hue,
            letterSpacing: 'var(--tracking-hero)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
        {unit ? <span style={{ font: 'var(--type-data-sm)', color: 'var(--muted-foreground)' }}>{unit}</span> : null}
        {delta ? (
          <span style={{ marginLeft: 'auto', font: 'var(--type-data-sm)', color: deltaHue, fontVariantNumeric: 'tabular-nums' }}>{delta}</span>
        ) : null}
      </div>

      {series && series.length > 1 ? <Sparkline data={series} tone={tone || 'ok'} width={220} height={24} style={{ width: '100%' }} /> : null}
      {children}
      {sub ? <div style={{ font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>{sub}</div> : null}
    </div>
  );
};
