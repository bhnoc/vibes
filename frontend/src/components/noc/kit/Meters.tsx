import React from 'react';
import { SignalTone } from './Badge';

/**
 * shadcn/ui Progress plus the two NOC read-outs built on it.
 *
 * The indicator animates with `transform`, never `width`. A dock full of meters
 * updating once a second would otherwise trigger layout on every tick.
 */

const HUES: Record<string, string> = {
  ok: 'var(--signal-teal)',
  warn: 'var(--signal-amber)',
  critical: 'var(--destructive)',
  info: 'var(--signal-cyan)',
  rf: 'var(--signal-violet)',
  neutral: 'var(--muted-foreground)',
};

export interface ProgressProps {
  value?: number;
  max?: number;
  tone?: SignalTone;
  height?: number;
  style?: React.CSSProperties;
}

export const Progress: React.FC<ProgressProps> = ({ value = 0, max = 100, tone, height = 8, style }) => {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        position: 'relative',
        height,
        width: '100%',
        overflow: 'hidden',
        borderRadius: 'var(--radius-full)',
        background: 'color-mix(in oklab,var(--primary) 20%,transparent)',
        ...style,
      }}
    >
      <div
        style={{
          height: '100%',
          width: '100%',
          background: tone ? HUES[tone] : 'var(--primary)',
          transformOrigin: 'left center',
          transform: `scaleX(${pct / 100})`,
          transition: 'transform var(--duration-base) var(--ease-out), background-color var(--duration-base) var(--ease-out)',
        }}
      />
    </div>
  );
};

export interface GaugeProps {
  value?: number;
  max?: number;
  label?: React.ReactNode;
  valueLabel?: React.ReactNode;
  tone?: SignalTone;
  /** Auto-colours to warn then critical as the meter crosses these percentages. */
  thresholds?: [number, number];
  height?: number;
  style?: React.CSSProperties;
}

export const Gauge: React.FC<GaugeProps> = ({ value = 0, max = 100, label, valueLabel, tone, thresholds = [70, 90], height = 8, style }) => {
  const pct = Math.max(0, Math.min(1, value / (max || 1)));
  const auto: SignalTone = pct * 100 >= thresholds[1] ? 'critical' : pct * 100 >= thresholds[0] ? 'warn' : 'ok';
  const resolved = tone || auto;

  return (
    <div style={{ display: 'grid', gap: 'var(--spacing-1-5)', minWidth: 0, ...style }}>
      {label || valueLabel ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-2)' }}>
          <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>{label}</span>
          <span style={{ marginLeft: 'auto', font: 'var(--type-data-sm)', color: HUES[resolved], fontVariantNumeric: 'tabular-nums' }}>
            {valueLabel != null ? valueLabel : `${Math.round(pct * 100)}%`}
          </span>
        </div>
      ) : null}
      <Progress value={pct * 100} tone={resolved} height={height} />
    </div>
  );
};

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  tone?: SignalTone;
  fill?: boolean;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

/** Axis-free trend line drawn on the shadcn chart tokens, which are the signal palette. */
export const Sparkline: React.FC<SparklineProps> = ({ data, width = 120, height = 28, tone = 'ok', fill = true, strokeWidth = 1.5, style }) => {
  const hue = {
    ok: 'var(--chart-1)',
    critical: 'var(--chart-2)',
    warn: 'var(--chart-3)',
    info: 'var(--chart-4)',
    rf: 'var(--chart-5)',
    neutral: 'var(--muted-foreground)',
  }[tone];

  const n = data.length;
  if (!n) return <svg width={width} height={height} style={style} />;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (n - 1 || 1)) * width, height - ((v - min) / span) * (height - 2) - 1] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible', ...style }}
    >
      {fill ? <path d={area} fill={hue} opacity={0.12} /> : null}
      <path d={line} fill="none" stroke={hue} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r={2} fill={hue} />
    </svg>
  );
};
