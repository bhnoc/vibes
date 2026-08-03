import React, { useState } from 'react';
import { useNetworkStore } from '../stores/networkStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useThemeStore, THEMES } from '../stores/themeStore';
import { PhysicsPanel } from './PhysicsPanel';
import { Button, Tabs, Input, Badge, Separator, FloatingPanel } from './noc/kit';

/**
 * Capture settings.
 *
 * A floating layer over live content, so it carries a shadow and a blur and no
 * competing chrome. Every control is a kit control: the panel exists to change
 * what the capture is doing, and inventing bespoke widgets here is how a design
 * system quietly stops being one.
 */

type Tab = 'source' | 'display' | 'physics';

export interface SettingsPanelProps {
  open: boolean;
  captureMode: 'simulated' | 'real' | 'zeek' | 'waiting';
  onCaptureModeChange: (mode: 'simulated' | 'real' | 'zeek') => void;
  interfaces: Array<{ name: string; description: string }>;
  selectedInterface: string;
  onInterfaceSelect: (iface: string) => void;
  zeekTcpAddr: string;
  onZeekTcpAddrChange: (addr: string) => void;
  /** Current frontend WebSocket URL, so the operator can see what will be dialled. */
  wsPreviewUrl: string | null;
  onMinimize: () => void;
}

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section style={{ display: 'grid', gap: 'var(--spacing-2)', marginBottom: 'var(--spacing-5)' }}>
    <h3 style={{ margin: 0 }}>{title}</h3>
    {hint ? <p style={{ margin: 0, font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>{hint}</p> : null}
    {children}
  </section>
);

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }> = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
}) => (
  <div style={{ display: 'grid', gap: 'var(--spacing-1-5)' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-2)' }}>
      <span style={{ font: 'var(--type-ui-sm)', color: 'var(--text-body)' }}>{label}</span>
      <span style={{ marginLeft: 'auto', font: 'var(--type-data)', color: 'var(--signal-teal)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
    <input className="noc-range" type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
    <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>
      <span>{min}</span>
      <span>{max}</span>
    </div>
  </div>
);

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  open,
  captureMode,
  onCaptureModeChange,
  interfaces,
  selectedInterface,
  onInterfaceSelect,
  zeekTcpAddr,
  onZeekTcpAddrChange,
  wsPreviewUrl,
  onMinimize,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('source');
  const { clearNetwork } = useNetworkStore();
  const { maxNodes, setMaxNodes, maxConnectionsPerNode, setMaxConnectionsPerNode } = useSettingsStore();
  const { themeKey, setTheme } = useThemeStore();

  return (
    <FloatingPanel
      open={open}
      title="Capture settings"
      icon="Settings"
      onClose={onMinimize}
      initial={{ x: typeof window !== 'undefined' ? Math.max(0, window.innerWidth - 420) : 800, y: 76 }}
      width={380}
      padded={false}
    >
      <Tabs
        style={{ margin: 'var(--spacing-3) var(--spacing-4) var(--spacing-4)' }}
        value={activeTab}
        onChange={(v) => setActiveTab(v as Tab)}
        items={[
          { value: 'source', label: 'Source' },
          { value: 'display', label: 'Display' },
          { value: 'physics', label: 'Physics' },
        ]}
      />

      <div className="tab-content" style={{ padding: '0 var(--spacing-4) var(--spacing-4)' }}>
        {activeTab === 'source' ? (
          <>
            <Section title="Capture mode" hint="Switching modes clears the current stream.">
              <div className="button-group" style={{ marginBottom: 0 }}>
                <button className={captureMode === 'simulated' ? 'active' : ''} onClick={() => onCaptureModeChange('simulated')}>
                  Simulated
                </button>
                <button className={captureMode === 'real' ? 'active' : ''} onClick={() => onCaptureModeChange('real')}>
                  Live
                </button>
                <button className={captureMode === 'zeek' ? 'active' : ''} onClick={() => onCaptureModeChange('zeek')} title="Zeek conn.log as NDJSON over TCP">
                  Zeek
                </button>
              </div>
            </Section>

            {captureMode === 'real' ? (
              <Section title="Network interface" hint="Live capture needs administrator privileges on the backend host.">
                <select
                  className="noc-select"
                  aria-label="Network interface"
                  value={selectedInterface}
                  onChange={(e) => onInterfaceSelect(e.target.value)}
                >
                  <option value="">Select an interface</option>
                  {interfaces.map((iface) => (
                    <option key={iface.name} value={iface.name}>
                      {iface.description || iface.name}
                    </option>
                  ))}
                </select>
                {interfaces.length === 0 ? (
                  <span style={{ font: 'var(--type-data-sm)', color: 'var(--signal-amber)' }}>
                    No interfaces returned. The backend may not be running, or it lacks capture privileges.
                  </span>
                ) : null}
              </Section>
            ) : null}

            {captureMode === 'zeek' ? (
              <Section title="Zeek ingest address" hint="The backend listens here for conn.log JSON lines, one per line.">
                <Input mono value={zeekTcpAddr} placeholder=":4777" ariaLabel="Zeek ingest address" onChange={onZeekTcpAddrChange} />
              </Section>
            ) : null}

            <Section title="Socket">
              <div
                style={{
                  padding: 'var(--spacing-2) var(--spacing-3)',
                  background: 'var(--background)',
                  border: 'var(--border-inset)',
                  borderRadius: 'var(--radius-md)',
                  font: 'var(--type-data-sm)',
                  color: 'var(--text-body)',
                  wordBreak: 'break-all',
                }}
              >
                {wsPreviewUrl || 'No socket: no source is selected.'}
              </div>
            </Section>

            <Separator style={{ margin: 'var(--spacing-2) 0 var(--spacing-4)' }} />

            <Button variant="destructive" full icon="Trash2" onClick={clearNetwork}>
              Clear network data
            </Button>
          </>
        ) : null}

        {activeTab === 'display' ? (
          <>
            <Section title="Skin" hint="The NOC skin is the show-floor default. The retro skins rebind the same tokens.">
              <div style={{ display: 'grid', gap: 'var(--spacing-2)' }}>
                {Object.values(THEMES).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTheme(t.key)}
                    aria-pressed={themeKey === t.key}
                    style={{
                      all: 'unset',
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--spacing-3)',
                      height: 'var(--control-h-lg)',
                      padding: '0 var(--spacing-3)',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${themeKey === t.key ? 'color-mix(in oklab,var(--signal-teal) 45%,transparent)' : 'var(--input)'}`,
                      background: themeKey === t.key ? 'var(--wash-ok)' : 'color-mix(in oklab,var(--input) 20%,transparent)',
                      color: 'var(--foreground)',
                      font: 'var(--type-ui)',
                      transition: 'var(--transition-control)',
                    }}
                  >
                    <span style={{ display: 'flex', gap: 3 }}>
                      {[t.edgeTcp, t.edgeUdp, t.edgeIcmp, t.edgeHttp].map((c) => (
                        <span key={c} style={{ width: 8, height: 16, borderRadius: 2, background: c }} />
                      ))}
                    </span>
                    {t.label}
                    {themeKey === t.key ? (
                      <Badge tone="ok" mono style={{ marginLeft: 'auto' }}>
                        Active
                      </Badge>
                    ) : null}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Map limits" hint="Caps keep the map readable and the frame rate flat as the network grows.">
              <Slider label="Max hosts on screen" value={maxNodes} min={50} max={1000} step={50} onChange={setMaxNodes} />
              <div style={{ height: 'var(--spacing-4)' }} />
              <Slider label="Max flows per host" value={maxConnectionsPerNode} min={1} max={150} step={1} onChange={setMaxConnectionsPerNode} />
            </Section>
          </>
        ) : null}

        {activeTab === 'physics' ? <PhysicsPanel /> : null}
      </div>
    </FloatingPanel>
  );
};
