import React from 'react';
import { FloatingPanel, Switch, Badge, Separator } from './kit';

/**
 * Synthetic load generator.
 *
 * Two things put fabricated traffic on the map: an operator turning this on to
 * prove the renderer holds 60fps at conference scale, and the console falling
 * back to it when no capture backend answers. Both look identical on the canvas,
 * so this panel is fully controlled by the app's real state rather than a local
 * copy of it — a switch that says "off" while the map is full of generated hosts
 * is worse than no switch. When the fallback is what turned it on, the panel says
 * so and explains that connecting a backend will end it.
 */

export interface PerformanceTestWindowProps {
  isOpen: boolean;
  onMinimize: () => void;
  enabled: boolean;
  nodeCount: number;
  connectionCount: number;
  /** True when the generator is running because the capture socket is unreachable. */
  fallback?: boolean;
  onTestModeChange: (enabled: boolean, nodeCount: number, connectionCount: number) => void;
}

const DEFAULT_NODES = 150;
const DEFAULT_CONNECTIONS = 250;

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  accent: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, accent, disabled, onChange }) => (
  <div style={{ display: 'grid', gap: 'var(--spacing-1-5)', opacity: disabled ? 0.5 : 1 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-2)' }}>
      <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span style={{ marginLeft: 'auto', font: 'var(--type-data)', color: accent, fontVariantNumeric: 'tabular-nums' }}>
        {value.toLocaleString()}
      </span>
    </div>
    <input
      className="noc-range"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
    />
    <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>
      <span>{min.toLocaleString()}</span>
      <span>{max.toLocaleString()}</span>
    </div>
  </div>
);

export const PerformanceTestWindow: React.FC<PerformanceTestWindowProps> = ({
  isOpen,
  onMinimize,
  enabled,
  nodeCount,
  connectionCount,
  fallback,
  onTestModeChange,
}) => {
  // The app zeroes the counts when it stops the generator, so the sliders fall
  // back to sensible values rather than pinning to their minimum.
  const nodes = nodeCount || DEFAULT_NODES;
  const conns = connectionCount || DEFAULT_CONNECTIONS;

  return (
    <FloatingPanel
      open={isOpen}
      title="Load generator"
      icon="Activity"
      onClose={onMinimize}
      initial={{ x: 460, y: 76 }}
      width={340}
      actions={enabled ? <Badge tone="warn">{fallback ? 'Fallback' : 'Running'}</Badge> : null}
    >
      <div style={{ display: 'grid', gap: 'var(--spacing-4)' }}>
        <Switch
          checked={enabled}
          onChange={(v) => onTestModeChange(v, nodes, conns)}
          label="Generate synthetic load"
          hint="Draws fabricated hosts and flows to stress the renderer"
        />

        <Separator />

        <Slider
          label="Nodes"
          value={nodes}
          min={50}
          max={3000}
          step={50}
          accent="var(--signal-teal)"
          disabled={!enabled}
          onChange={(v) => onTestModeChange(true, v, conns)}
        />
        <Slider
          label="Connections"
          value={conns}
          min={50}
          max={5000}
          step={50}
          accent="var(--signal-violet)"
          disabled={!enabled}
          onChange={(v) => onTestModeChange(true, nodes, v)}
        />

        {enabled ? (
          <p
            style={{
              margin: 0,
              padding: 'var(--spacing-2-5) var(--spacing-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid color-mix(in oklab, var(--signal-amber) 40%, transparent)',
              background: 'color-mix(in oklab, var(--signal-amber) 10%, transparent)',
              font: 'var(--type-data-sm)',
              color: 'var(--signal-amber)',
            }}
          >
            {fallback
              ? `No capture backend answered, so the map is showing ${nodes.toLocaleString()} fabricated hosts and ${conns.toLocaleString()} fabricated flows. Connect a sensor and this stops on its own.`
              : `The map is showing ${nodes.toLocaleString()} fabricated hosts and ${conns.toLocaleString()} fabricated flows. Nothing on screen is live traffic while this is on.`}
          </p>
        ) : (
          <p style={{ margin: 0, font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>
            Off. The map is showing captured traffic only.
          </p>
        )}
      </div>
    </FloatingPanel>
  );
};
