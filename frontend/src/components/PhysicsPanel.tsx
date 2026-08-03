import React from 'react';
import { usePhysicsStore } from '../stores/physicsStore';
import { FiRefreshCw } from 'react-icons/fi';

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
    {hint && (
      <div style={{ fontSize: '11px', opacity: 0.65, marginBottom: '4px' }}>{hint}</div>
    )}
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step || 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
      <span style={{ minWidth: '70px', textAlign: 'right' }}>{displayValue}</span>
    </div>
  </div>
);

const RefreshIcon = FiRefreshCw as React.ElementType;

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
    <div style={{ marginTop: '12px', paddingBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3>Physics Controls</h3>
        <button
          onClick={resetPhysicsDefaults}
          style={{ background: 'none', border: 'none', color: '#00ff00', cursor: 'pointer' }}
          title="Reset to defaults"
        >
          <RefreshIcon />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
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
          label="Connection Lifetime"
          value={connectionLifetime}
          min="0"
          max="5000"
          step="50"
          onChange={(v) => {
            setConnectionLifetime(v);
            if (v > nodeLifetime) setNodeLifetime(v);
          }}
          displayValue={`${connectionLifetime} ms`}
        />
        <RangeSlider
          label="Node Lifetime"
          value={nodeLifetime}
          min={connectionLifetime}
          max="120000"
          step="1000"
          onChange={(v) => setNodeLifetime(Math.max(v, connectionLifetime))}
          displayValue={`${(nodeLifetime / 1000).toFixed(0)}s`}
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
    </div>
  );
};
