import React from 'react';
import { usePhysicsStore } from '../stores/physicsStore';
import { IconButton, Separator } from './noc/kit';

/**
 * Layout forces for the capture map.
 *
 * These are display preferences, not capture settings: nothing here changes what
 * is measured, only how the graph arranges itself. The read-out beside each
 * slider shows the value in the unit the simulation actually uses, so a setting
 * that looks good on a projector can be written down and reproduced.
 */

interface RangeSliderProps {
  label: string;
  value: number;
  min: string | number;
  max: string | number;
  step?: string | number;
  onChange: (value: number) => void;
  displayValue: string;
  hint?: string;
}

const RangeSlider: React.FC<RangeSliderProps> = ({ label, value, min, max, step, onChange, displayValue, hint }) => (
  <div>
    <label>{label}</label>
    {hint ? <div style={{ font: 'var(--type-data-sm)', color: 'var(--text-faint)', margin: 'var(--spacing-0-5) 0 var(--spacing-1-5)' }}>{hint}</div> : null}
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
      <input
        className="noc-range"
        type="range"
        min={min}
        max={max}
        step={step || 1}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
      <span
        style={{
          minWidth: '68px',
          textAlign: 'right',
          font: 'var(--type-data)',
          color: 'var(--signal-teal)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {displayValue}
      </span>
    </div>
  </div>
);

export const PhysicsPanel: React.FC = () => {
  const {
    connectionPullStrength,
    collisionRepulsion,
    damping,
    connectionLifetime,
    nodeLifetime,
    nodeSpacing,
    driftAwayStrength,
    centerPullStrength,
    springRestLength,
    nodeSizingIntensity,
    edgeWidthIntensity,
    setConnectionPullStrength,
    setCollisionRepulsion,
    setDamping,
    setConnectionLifetime,
    setNodeLifetime,
    setNodeSpacing,
    setDriftAwayStrength,
    setCenterPullStrength,
    setSpringRestLength,
    setNodeSizingIntensity,
    setEdgeWidthIntensity,
    resetPhysicsDefaults,
  } = usePhysicsStore();

  return (
    <div className="physics-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-3)' }}>
        <h3 style={{ margin: 0 }}>Forces</h3>
        <IconButton icon="RotateCcw" label="Reset forces to defaults" size="sm" onClick={resetPhysicsDefaults} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
        <RangeSlider 
          label="Node Spacing"
          value={nodeSpacing}
          min="0"
          max="300"
          onChange={setNodeSpacing}
          displayValue={`${nodeSpacing} px`}
        />
        <RangeSlider
          label="Drift Away Strength"
          value={Math.round(driftAwayStrength * 1000)}
          min="0"
          max="2000"
          step="10"
          onChange={(v: number) => setDriftAwayStrength(v / 1000)}
          displayValue={driftAwayStrength.toFixed(2)}
        />
        <RangeSlider 
          label="Connection Pull"
          value={connectionPullStrength * 100}
          min="0"
          max="1000"
          onChange={(v: number) => setConnectionPullStrength(v / 100)}
          displayValue={connectionPullStrength.toFixed(2)}
        />
        <RangeSlider 
          label="Collision Repulsion"
          value={collisionRepulsion * 100}
          min="0"
          max="500"
          onChange={(v: number) => setCollisionRepulsion(v / 100)}
          displayValue={collisionRepulsion.toFixed(2)}
        />
        <RangeSlider 
          label="Damping"
          value={damping * 1000}
          min="0"
          max="900"
          step="10"
          onChange={(v: number) => setDamping(v / 1000)}
          displayValue={damping.toFixed(3)}
        />
        <RangeSlider
          label="Center Pull"
          value={Math.round(centerPullStrength * 100000)}
          min="0"
          max="500"
          step="1"
          onChange={(v) => setCenterPullStrength(v / 100000)}
          displayValue={centerPullStrength.toFixed(5)}
        />
        <RangeSlider
          label="Spring Rest Length"
          value={springRestLength}
          min="20"
          max="400"
          step="10"
          onChange={setSpringRestLength}
          displayValue={`${springRestLength} px`}
        />
      </div>

      <Separator style={{ margin: 'var(--spacing-6) 0 var(--spacing-4)' }} />

      <div>
        <h3 style={{ marginBottom: 'var(--spacing-1-5)' }}>Encoding</h3>
        <p style={{ margin: '0 0 var(--spacing-4)', font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>
          Bind host size and flow width to measured values. At 0% both are uniform, so shape carries no meaning.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          <RangeSlider
            label="Connection-count sizing"
            hint="Ball size grows with number of connections"
            value={Math.round(nodeSizingIntensity * 100)}
            min="0"
            max="100"
            step="1"
            onChange={(v) => setNodeSizingIntensity(v / 100)}
            displayValue={`${Math.round(nodeSizingIntensity * 100)}%`}
          />
          <RangeSlider
            label="Throughput line width"
            hint="Line thickness follows sustained throughput"
            value={Math.round(edgeWidthIntensity * 100)}
            min="0"
            max="100"
            step="1"
            onChange={(v) => setEdgeWidthIntensity(v / 100)}
            displayValue={`${Math.round(edgeWidthIntensity * 100)}%`}
          />
        </div>
      </div>
    </div>
  );
};
