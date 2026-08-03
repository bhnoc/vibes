import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePacketStore } from '../stores/packetStore';
import { useNetworkStore } from '../stores/networkStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTelemetry, formatBitrate, formatBytes, formatCount, formatRelative } from '../telemetry/nocTelemetry';
import { FloatingPanel, Tabs, Switch, Progress, Sparkline, Badge, Separator, StatusDot, DataTable, Column } from './noc/kit';

/**
 * Diagnostics.
 *
 * This panel answers one question: is the console telling the truth? It reports
 * on the pipeline itself — what the socket delivered, how much of it is real
 * capture versus generated load, what the renderer is doing and what the browser
 * has left. Everything is measured, and where a number cannot be measured in this
 * browser it says so rather than showing a plausible zero.
 */

type TabType = 'stream' | 'system' | 'renderer' | 'protocols';

export interface RendererOption {
  key: string;
  name: string;
  description: string;
  /** Rough capacity, phrased as the scale it holds rather than a star rating. */
  scale: string;
  recommended?: boolean;
}

interface UnifiedDebugPanelProps {
  onRendererChange?: (renderer: string) => void;
  currentRenderer?: string;
  rendererOptions?: RendererOption[];
  isOpen?: boolean;
  onMinimize?: () => void;
}

const DEFAULT_RENDERERS: RendererOption[] = [
  {
    key: 'canvas',
    name: 'Canvas 2D',
    description: 'Immediate-mode drawing with object pooling and viewport culling.',
    scale: 'thousands of objects at 60fps',
    recommended: true,
  },
  {
    key: 'minimal',
    name: 'Minimal DOM',
    description: 'One element per object. Inspectable in devtools, but the browser lays out every node.',
    scale: 'under ~100 objects',
  },
];

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-3)', padding: '3px 0' }}>
    <span style={{ font: 'var(--type-ui-sm)', color: 'var(--text-muted)' }}>{label}</span>
    <span
      style={{
        marginLeft: 'auto',
        font: 'var(--type-data)',
        color: 'var(--text-hi)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </span>
  </div>
);

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ display: 'grid', gap: 'var(--spacing-1)' }}>
    <h4
      style={{
        margin: '0 0 var(--spacing-1) 0',
        font: 'var(--type-label)',
        letterSpacing: 'var(--tracking-label)',
        textTransform: 'uppercase',
        color: 'var(--text-faint)',
      }}
    >
      {title}
    </h4>
    {children}
  </section>
);

/** `performance.memory` is Chromium-only and unavailable under cross-origin isolation. */
function useHeap() {
  const [heap, setHeap] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    const read = () => {
      const m = (performance as any).memory;
      if (!m?.jsHeapSizeLimit) return setHeap(null);
      setHeap({ used: m.usedJSHeapSize, limit: m.jsHeapSizeLimit });
    };
    read();
    const id = setInterval(read, 2000);
    return () => clearInterval(id);
  }, []);

  return heap;
}

/** Frame timing measured off rAF, so it reflects what the renderer actually achieved. */
function useFrameRate() {
  const [fps, setFps] = useState(0);
  const [worst, setWorst] = useState(0);
  const state = useRef({ frames: 0, since: performance.now(), last: performance.now(), worst: 0 });

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const s = state.current;
      s.worst = Math.max(s.worst, t - s.last);
      s.last = t;
      s.frames += 1;
      if (t - s.since >= 1000) {
        setFps(Math.round((s.frames * 1000) / (t - s.since)));
        setWorst(Math.round(s.worst));
        s.frames = 0;
        s.since = t;
        s.worst = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { fps, worst };
}

export const UnifiedDebugPanel: React.FC<UnifiedDebugPanelProps> = ({
  onRendererChange,
  currentRenderer = 'canvas',
  isOpen = false,
  onMinimize,
  rendererOptions = DEFAULT_RENDERERS,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('stream');

  const packets = usePacketStore((s) => s.packets);
  const nodes = useNetworkStore((s) => s.nodes);
  const connections = useNetworkStore((s) => s.connections);
  const { verboseLogging, toggleVerboseLogging } = useSettingsStore();

  const t = useTelemetry();
  const heap = useHeap();
  const { fps, worst } = useFrameRate();

  // The buffer is capped, so these describe what is retained rather than what
  // has ever arrived. The telemetry engine holds the session totals.
  const provenance = useMemo(() => {
    let real = 0;
    let simulated = 0;
    for (const p of packets) {
      if (p.source === 'real') real += 1;
      else if (p.source === 'simulated') simulated += 1;
    }
    return { real, simulated, unknown: packets.length - real - simulated, buffered: packets.length };
  }, [packets]);

  const recent = useMemo(
    () =>
      packets
        .slice(-6)
        .reverse()
        .map((p, i) => ({
          id: p.id ?? String(i),
          flow: `${p.src ?? '—'} → ${p.dst ?? '—'}`,
          protocol: (p.protocol || 'other').toUpperCase(),
          size: formatBytes(p.size || 0),
        })),
    [packets],
  );

  const recentColumns: Column<(typeof recent)[number]>[] = [
    { key: 'flow', label: 'Flow', mono: true },
    { key: 'protocol', label: 'Proto', width: '68px' },
    { key: 'size', label: 'Size', width: '72px', align: 'right', mono: true },
  ];

  const heapPct = heap ? (heap.used / heap.limit) * 100 : 0;
  const heapTone = heapPct > 85 ? 'critical' : heapPct > 70 ? 'warn' : 'ok';
  const fpsTone = fps >= 55 ? 'ok' : fps >= 30 ? 'warn' : 'critical';

  return (
    <FloatingPanel
      open={isOpen}
      title="Diagnostics"
      icon="Terminal"
      onClose={onMinimize ?? (() => undefined)}
      initial={{ x: 24, y: 76 }}
      width={420}
      padded={false}
      actions={<StatusDot status={t.live ? 'ok' : 'idle'} pulse={t.live} label={t.live ? 'streaming' : 'idle'} />}
    >
      <Tabs
        style={{ margin: 'var(--spacing-3) var(--spacing-4) 0' }}
        value={activeTab}
        onChange={(v) => setActiveTab(v as TabType)}
        items={[
          { value: 'stream', label: 'Stream' },
          { value: 'system', label: 'System' },
          { value: 'renderer', label: 'Renderer' },
          { value: 'protocols', label: 'Protocols' },
        ]}
      />

      <div style={{ display: 'grid', gap: 'var(--spacing-4)', padding: 'var(--spacing-4)' }}>
        {activeTab === 'stream' ? (
          <>
            <Group title="Throughput">
              <Row label="Rate">{Math.round(t.packetsPerSecond).toLocaleString()} pps</Row>
              <Row label="Bandwidth">{formatBitrate(t.bytesPerSecond)}</Row>
              <Row label="Peak rate">{Math.round(t.peakPps).toLocaleString()} pps</Row>
              <Row label="Last packet">{formatRelative(t.secondsSincePacket)}</Row>
              <Sparkline data={t.ppsSeries} height={28} tone="ok" style={{ marginTop: 'var(--spacing-2)' }} />
            </Group>

            <Separator />

            <Group title="Session totals">
              <Row label="Packets">{formatCount(t.totalPackets)}</Row>
              <Row label="Volume">{formatBytes(t.totalBytes)}</Row>
              <Row label="Hosts">{nodes.length.toLocaleString()}</Row>
              <Row label="Flows">{connections.length.toLocaleString()}</Row>
            </Group>

            <Separator />

            <Group title="Provenance">
              <p style={{ margin: '0 0 var(--spacing-2) 0', font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>
                Of the {provenance.buffered.toLocaleString()} packets still in the buffer.
              </p>
              <Row label="Captured">
                <Badge tone={provenance.real > 0 ? 'ok' : 'neutral'}>{provenance.real.toLocaleString()}</Badge>
              </Row>
              <Row label="Generated">
                <Badge tone={provenance.simulated > 0 ? 'warn' : 'neutral'}>{provenance.simulated.toLocaleString()}</Badge>
              </Row>
              <Row label="Unlabelled">
                <Badge tone="neutral">{provenance.unknown.toLocaleString()}</Badge>
              </Row>
            </Group>

            <Separator />

            <Group title="Last packets">
              <DataTable columns={recentColumns} rows={recent} rowId="id" dense empty="Nothing captured yet." />
            </Group>
          </>
        ) : null}

        {activeTab === 'system' ? (
          <>
            <Group title="Frame timing">
              <Row label="Frame rate">
                <span style={{ color: `var(--status-${fpsTone === 'ok' ? 'ok' : fpsTone === 'warn' ? 'medium' : 'critical'})` }}>{fps} fps</span>
              </Row>
              <Row label="Longest frame">{worst} ms</Row>
              <Progress value={Math.min(fps, 60)} max={60} tone={fpsTone} style={{ marginTop: 'var(--spacing-2)' }} />
            </Group>

            <Separator />

            <Group title="Heap">
              {heap ? (
                <>
                  <Row label="In use">{formatBytes(heap.used)}</Row>
                  <Row label="Limit">{formatBytes(heap.limit)}</Row>
                  <Progress value={heapPct} tone={heapTone} style={{ marginTop: 'var(--spacing-2)' }} />
                </>
              ) : (
                <p style={{ margin: 0, font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>
                  This browser does not expose heap statistics.
                </p>
              )}
            </Group>

            <Separator />

            <Group title="Logging">
              <Switch
                checked={verboseLogging}
                onChange={toggleVerboseLogging}
                label="Verbose console logging"
                hint="Writes per-packet detail to devtools. Costs frames under load."
              />
            </Group>
          </>
        ) : null}

        {activeTab === 'renderer' ? (
          <Group title="Drawing engine">
            <div role="radiogroup" aria-label="Drawing engine" style={{ display: 'grid', gap: 'var(--spacing-2)' }}>
              {rendererOptions.map((r) => {
                const active = currentRenderer === r.key;
                return (
                  <label
                    key={r.key}
                    style={{
                      display: 'grid',
                      gap: 'var(--spacing-1)',
                      padding: 'var(--spacing-3)',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${active ? 'var(--signal-teal)' : 'var(--border)'}`,
                      background: active ? 'color-mix(in oklab, var(--signal-teal) 8%, transparent)' : 'transparent',
                      transition: 'var(--transition-control)',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                      <input
                        type="radio"
                        name="renderer"
                        value={r.key}
                        checked={active}
                        onChange={(e) => onRendererChange?.(e.target.value)}
                        style={{ accentColor: 'var(--signal-teal)' }}
                      />
                      <span style={{ font: 'var(--type-ui)', color: 'var(--text-hi)' }}>{r.name}</span>
                      {r.recommended ? <Badge tone="ok">Recommended</Badge> : null}
                    </span>
                    <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-muted)', paddingLeft: 'var(--spacing-6)' }}>
                      {r.description}
                    </span>
                    <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-faint)', paddingLeft: 'var(--spacing-6)' }}>
                      Holds {r.scale}.
                    </span>
                  </label>
                );
              })}
            </div>
            <p style={{ margin: 'var(--spacing-2) 0 0', font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>
              Drag to pan, wheel to zoom, R to reset the view.
            </p>
          </Group>
        ) : null}

        {activeTab === 'protocols' ? (
          <Group title="Protocol mix">
            {t.protocols.length ? (
              <div style={{ display: 'grid', gap: 'var(--spacing-2-5)' }}>
                {t.protocols.map((p) => (
                  <div key={p.protocol} style={{ display: 'grid', gap: 'var(--spacing-1)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-2)' }}>
                      <span
                        style={{
                          font: 'var(--type-data)',
                          color: `var(--proto-${p.protocol}, var(--proto-other))`,
                          textTransform: 'uppercase',
                        }}
                      >
                        {p.protocol}
                      </span>
                      <span style={{ marginLeft: 'auto', font: 'var(--type-data-sm)', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCount(p.packets)} · {p.pct.toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 'var(--radius-full)', background: 'var(--input)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: '100%',
                          background: `var(--proto-${p.protocol}, var(--proto-other))`,
                          transformOrigin: 'left center',
                          transform: `scaleX(${Math.max(0.01, p.pct / 100)})`,
                          transition: 'transform var(--duration-base) var(--ease-out)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>No protocols seen yet.</p>
            )}
          </Group>
        ) : null}
      </div>
    </FloatingPanel>
  );
};
