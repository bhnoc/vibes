import React from 'react';
import { usePhysicsStore } from '../stores/physicsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { FiRefreshCw } from 'react-icons/fi';

interface RangeSliderProps {
  label: string;
  value: number;
  min: string | number;
  max: string | number;
  step?: string | number;
  onChange: (value: number) => void;
  displayValue: string;
}

const RangeSlider: React.FC<RangeSliderProps> = ({ label, value, min, max, step, onChange, displayValue }) => (
  <div>
    <label>{label}</label>
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

export const PhysicsPanel: React.FC = () => {
  const {
    connectionPullStrength,
    collisionRepulsion,
    damping,
    connectionLifetime,
    nodeSpacing,
    driftAwayStrength,
    setConnectionPullStrength,
    setCollisionRepulsion,
    setDamping,
    setConnectionLifetime,
    setNodeSpacing,
    setDriftAwayStrength,
    resetPhysicsDefaults,
  } = usePhysicsStore();

  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3>Physics Controls</h3>
        <button
          onClick={resetPhysicsDefaults}
          style={{ background: 'none', border: 'none', color: '#00ff00', cursor: 'pointer' }}
          title="Reset to defaults"
        >
          <FiRefreshCw />
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
          value={driftAwayStrength * 100}
          min="0"
          max="500"
          onChange={(v: number) => setDriftAwayStrength(v / 100)}
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
          max="100"
          onChange={(v: number) => setDamping(v / 1000)}
          displayValue={damping.toFixed(3)}
        />
        <RangeSlider 
          label="Connection Lifetime"
          value={connectionLifetime}
          min="100"
          max="10000"
          step="100"
          onChange={setConnectionLifetime}
          displayValue={`${connectionLifetime} ms`}
        />
        <RangeSlider 
          label="Max Nodes"
          value={useSettingsStore.getState().maxNodes}
          min="500"
          max="50000"
          step="500"
          onChange={useSettingsStore.getState().setMaxNodes}
          displayValue={`${useSettingsStore.getState().maxNodes}`}
        />
      </div>
    </div>
  );
}; 