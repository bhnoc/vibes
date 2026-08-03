import React, { memo, useEffect, useMemo, useState } from 'react';
import { Card, DataTable, Column, SeverityBadge, Badge, Button, StatTile, Sparkline, Tabs } from './kit';
import { protocolHue } from './NocSidebar';
import { useNetworkStore, Connection, Node } from '../../stores/networkStore';
import {
  useTelemetry,
  useTelemetryStore,
  Alert,
  formatBytes,
  formatCount,
  formatClock,
  formatRelative,
} from '../../telemetry/nocTelemetry';

/**
 * The tabular surfaces: flows, hosts and detections.
 *
 * The network store mutates at capture rate. Subscribing a table to it directly
 * would repaint hundreds of rows per second and make the console feel worse the
 * busier the network gets, which is exactly backwards. These views sample the
 * store once a second instead — the same cadence as the telemetry snapshot, so
 * the tables and the dock always describe the same moment.
 */

function useNetworkSample(intervalMs = 1000) {
  const [sample, setSample] = useState(() => {
    const { nodes, connections } = useNetworkStore.getState();
    return { nodes, connections, at: Date.now() };
  });

  useEffect(() => {
    const id = setInterval(() => {
      const { nodes, connections } = useNetworkStore.getState();
      setSample({ nodes, connections, at: Date.now() });
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return sample;
}

const ProtocolChip: React.FC<{ protocol?: string }> = ({ protocol }) => {
  const p = (protocol || 'other').toLowerCase();
  const hue = protocolHue(p);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--spacing-1-5)',
        font: 'var(--type-data-sm)',
        letterSpacing: 'var(--tracking-label)',
        textTransform: 'uppercase',
        color: hue,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: hue }} />
      {p}
    </span>
  );
};

const matches = (query: string, ...fields: (string | number | undefined)[]) => {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
};

/* -------------------------------------------------------------------------- */

export interface ViewProps {
  query: string;
  selectedHost: string | null;
  onSelectHost: (host: string) => void;
}

/* -------------------------------------------------------------------------- */

interface FlowRow {
  id: string;
  source: string;
  target: string;
  protocol: string;
  ports: string;
  portless: boolean;
  packets: number;
  bytes: number;
  age: number;
}

export const FlowsView = memo(({ query, selectedHost, onSelectHost }: ViewProps) => {
  const { connections, at } = useNetworkSample();
  const t = useTelemetry();
  const [sort, setSort] = useState<'bytes' | 'packets' | 'recent'>('bytes');

  const rows = useMemo<FlowRow[]>(() => {
    const mapped = connections
      .filter((c: Connection) => matches(query, c.source, c.target, c.protocol, c.srcPort, c.dstPort))
      .filter((c: Connection) => !selectedHost || c.source === selectedHost || c.target === selectedHost)
      .map((c: Connection) => ({
        id: c.id,
        source: c.source,
        target: c.target,
        protocol: (c.protocol || 'other').toLowerCase(),
        // ICMP has no ports. Showing an em dash is the honest cell; showing
        // numbers borrowed from another layer is not.
        ports: c.srcPort || c.dstPort ? `${c.srcPort ?? '—'} → ${c.dstPort ?? '—'}` : '—',
        portless: (c.protocol || '').toLowerCase() === 'icmp',
        packets: c.packetCount ?? 1,
        bytes: c.byteCount ?? c.size ?? 0,
        age: (at - (c.lastActive || at)) / 1000,
      }));

    const comparator = {
      bytes: (a: FlowRow, b: FlowRow) => b.bytes - a.bytes,
      packets: (a: FlowRow, b: FlowRow) => b.packets - a.packets,
      recent: (a: FlowRow, b: FlowRow) => a.age - b.age,
    }[sort];

    return mapped.sort(comparator).slice(0, 300);
  }, [connections, query, selectedHost, sort, at]);

  const columns = useMemo<Column<FlowRow>[]>(
    () => [
      { key: 'protocol', label: 'Proto', width: '84px', render: (r) => <ProtocolChip protocol={r.protocol} /> },
      { key: 'source', label: 'Source', width: 'minmax(0,150px)', mono: true, tone: 'hi' },
      { key: 'target', label: 'Destination', width: 'minmax(0,150px)', mono: true, tone: 'hi' },
      { key: 'ports', label: 'Ports', width: '120px', mono: true, tone: 'muted', compactHidden: true, render: (r) => (r.portless ? '—' : r.ports) },
      { key: 'packets', label: 'Packets', width: '82px', mono: true, align: 'right', render: (r) => formatCount(r.packets) },
      { key: 'bytes', label: 'Bytes', width: '82px', mono: true, align: 'right', render: (r) => formatBytes(r.bytes) },
      { key: 'age', label: 'Last seen', width: '86px', mono: true, tone: 'faint', align: 'right', render: (r) => formatRelative(r.age) },
    ],
    [],
  );

  return (
    <ViewFrame
      title="Flows"
      subtitle={`${formatCount(rows.length)} conversations${selectedHost ? ` involving ${selectedHost}` : ''}${query ? ` matching "${query}"` : ''}`}
      actions={
        <Tabs
          variant="line"
          value={sort}
          onChange={(v) => setSort(v as typeof sort)}
          items={[
            { value: 'bytes', label: 'By volume' },
            { value: 'packets', label: 'By packets' },
            { value: 'recent', label: 'Most recent' },
          ]}
        />
      }
      tiles={
        <>
          <StatTile label="Active flows" value={formatCount(t.flows)} tone="info" series={t.flowSeries} />
          <StatTile label="Packets / sec" value={formatCount(t.packetsPerSecond)} tone="ok" series={t.ppsSeries} />
          <StatTile label="Shown" value={formatCount(rows.length)} sub="capped at 300 rows" />
          <StatTile label="Window" value="2" unit="min" sub={`sampled ${formatClock(at)}`} />
        </>
      }
    >
      <Card title="Conversations" meta="sampled once per second" flush updated={t.live ? 'live' : formatRelative(t.secondsSincePacket)} state={t.secondsSincePacket < 3 ? 'ready' : 'stale'}>
        <DataTable<FlowRow>
          columns={columns}
          rows={rows}
          rowLabel={(r) => `${r.protocol} flow from ${r.source} to ${r.target}`}
          onRowClick={(r) => onSelectHost(r.source)}
          empty={query || selectedHost ? 'No flows match this filter in the current window.' : 'No flows in this window. Nothing has been captured yet.'}
          maxHeight="calc(100vh - 340px)"
        />
      </Card>
    </ViewFrame>
  );
});

/* -------------------------------------------------------------------------- */

interface HostRow {
  id: string;
  ports: number;
  packets: number;
  bytes: number;
  share: number;
  age: number;
}

export const HostsView = memo(({ query, selectedHost, onSelectHost }: ViewProps) => {
  const { nodes, at } = useNetworkSample();
  const t = useTelemetry();

  const byHost = useMemo(() => new Map(t.talkers.map((x) => [x.host, x])), [t.talkers]);

  const rows = useMemo<HostRow[]>(
    () =>
      nodes
        .filter((n: Node) => matches(query, n.id, n.label))
        .map((n: Node) => {
          const talker = byHost.get(n.id);
          return {
            id: n.id,
            ports: n.ports?.size ?? 0,
            packets: talker?.packets ?? 0,
            bytes: talker?.bytes ?? 0,
            share: talker?.pct ?? 0,
            age: (at - (n.lastActive || at)) / 1000,
          };
        })
        .sort((a, b) => b.bytes - a.bytes || a.age - b.age)
        .slice(0, 300),
    [nodes, query, byHost, at],
  );

  const columns = useMemo<Column<HostRow>[]>(
    () => [
      { key: 'id', label: 'Host', width: 'minmax(0,180px)', mono: true, tone: 'hi' },
      {
        key: 'share',
        label: 'Share',
        width: 'minmax(0,1fr)',
        render: (r) => (
          <span style={{ display: 'block', height: 4, background: 'var(--secondary)', borderRadius: 2, minWidth: 60 }}>
            <span style={{ display: 'block', width: `${Math.min(100, r.share)}%`, height: '100%', background: 'var(--signal-teal)', borderRadius: 2 }} />
          </span>
        ),
      },
      { key: 'ports', label: 'Ports', width: '70px', mono: true, align: 'right', compactHidden: true },
      { key: 'packets', label: 'Packets', width: '82px', mono: true, align: 'right', render: (r) => formatCount(r.packets) },
      { key: 'bytes', label: 'Volume', width: '86px', mono: true, align: 'right', render: (r) => formatBytes(r.bytes) },
      { key: 'age', label: 'Last seen', width: '86px', mono: true, tone: 'faint', align: 'right', render: (r) => formatRelative(r.age) },
    ],
    [],
  );

  return (
    <ViewFrame
      title="Hosts"
      subtitle={`${formatCount(rows.length)} hosts on the wire${query ? ` matching "${query}"` : ''}`}
      tiles={
        <>
          <StatTile label="Hosts" value={formatCount(t.hosts)} tone="ok" series={t.hostSeries} />
          <StatTile label="Talking now" value={formatCount(t.talkers.length)} tone="info" sub="non-zero volume in window" />
          <StatTile label="Scanning" value={formatCount(t.scanSuspects)} tone={t.scanSuspects ? 'critical' : 'neutral'} sub="hosts tripping a scan rule" />
          <StatTile label="Total volume" value={formatBytes(t.totalBytes).split(' ')[0]} unit={formatBytes(t.totalBytes).split(' ')[1]} sub="since this session began" />
        </>
      }
    >
      <Card title="Talkers" meta="ordered by volume in the 2 min window" flush updated={t.live ? 'live' : formatRelative(t.secondsSincePacket)} state={t.secondsSincePacket < 3 ? 'ready' : 'stale'}>
        <DataTable<HostRow>
          columns={columns}
          rows={rows}
          selectedId={selectedHost}
          rowLabel={(r) => `Host ${r.id}`}
          onRowClick={(r) => onSelectHost(r.id === selectedHost ? '' : r.id)}
          empty={query ? 'No hosts match this filter.' : 'No hosts yet. Hosts appear as soon as the first packet arrives.'}
          maxHeight="calc(100vh - 340px)"
        />
      </Card>
    </ViewFrame>
  );
});

/* -------------------------------------------------------------------------- */

export const AlertsView = memo(({ query, onSelectHost }: ViewProps) => {
  const t = useTelemetry();
  const acknowledge = useTelemetryStore((s) => s.acknowledge);
  const acknowledgeAll = useTelemetryStore((s) => s.acknowledgeAll);

  const rows = useMemo(() => t.alerts.filter((a) => matches(query, a.src, a.event, a.detail)), [t.alerts, query]);
  const open = rows.filter((a) => !a.acknowledged);

  const columns = useMemo<Column<Alert>[]>(
    () => [
      { key: 'level', label: 'Sev', width: '96px', render: (r) => <SeverityBadge level={r.level} blink={!r.acknowledged && r.level === 'critical'} /> },
      { key: 'firstSeen', label: 'First seen', width: '92px', mono: true, tone: 'faint', compactHidden: true, render: (r) => formatClock(r.firstSeen) },
      { key: 'event', label: 'Event', width: 'minmax(0,160px)', tone: 'hi' },
      { key: 'src', label: 'Source', width: 'minmax(0,140px)', mono: true, tone: 'muted' },
      { key: 'detail', label: 'Why it fired', width: 'minmax(0,1fr)', tone: 'muted' },
      { key: 'hits', label: 'Hits', width: '58px', mono: true, align: 'right' },
      {
        key: 'acknowledged',
        label: 'State',
        width: '104px',
        render: (r) =>
          r.acknowledged ? (
            <Badge tone="neutral" mono>
              ACK
            </Badge>
          ) : (
            <Badge tone="warn" mono dot>
              OPEN
            </Badge>
          ),
      },
    ],
    [],
  );

  return (
    <ViewFrame
      title="Detections"
      subtitle={`${formatCount(open.length)} open of ${formatCount(rows.length)}${query ? ` matching "${query}"` : ''}`}
      actions={
        open.length ? (
          <Button size="sm" variant="signal" icon="Check" onClick={acknowledgeAll}>
            Acknowledge all
          </Button>
        ) : undefined
      }
      tiles={
        <>
          <StatTile label="Open" value={formatCount(open.length)} tone={open.length ? 'critical' : 'neutral'} sub="unacknowledged" />
          <StatTile label="Critical and high" value={formatCount(open.filter((a) => a.level === 'critical' || a.level === 'high').length)} tone="critical" />
          <StatTile label="Scanning hosts" value={formatCount(t.scanSuspects)} tone={t.scanSuspects ? 'warn' : 'neutral'} />
          <StatTile label="Packets / sec" value={formatCount(t.packetsPerSecond)} tone="ok" series={t.ppsSeries} />
        </>
      }
    >
      <Card title="Detection queue" meta="click a row to acknowledge it" flush updated={t.live ? 'live' : formatRelative(t.secondsSincePacket)}>
        <DataTable<Alert>
          columns={columns}
          rows={rows}
          severityKey="level"
          rowLabel={(r) => `${r.level} detection: ${r.event} from ${r.src}`}
          onRowClick={(r) => {
            acknowledge(r.id);
            onSelectHost(r.src);
          }}
          empty="No detections in this window. Rules: port scan (25 ports), host sweep (40 destinations), ICMP flood (40% of traffic), sensitive service."
          maxHeight="calc(100vh - 340px)"
        />
      </Card>
    </ViewFrame>
  );
});

/* -------------------------------------------------------------------------- */

/** Shared page frame: title block, a four-up metric row, then the content. */
const ViewFrame: React.FC<{
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  tiles?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, actions, tiles, children }) => (
  <div
    data-animate
    style={{
      height: '100%',
      overflowY: 'auto',
      padding: 'var(--gutter)',
      display: 'grid',
      gap: 'var(--gutter)',
      alignContent: 'start',
      animation: 'vibes-rise var(--duration-base) var(--ease-out)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--spacing-4)', flexWrap: 'wrap' }}>
      <div style={{ display: 'grid', gap: 'var(--spacing-1)' }}>
        <h1 style={{ margin: 0, font: 'var(--type-h1)', color: 'var(--foreground)', letterSpacing: 'var(--tracking-hero)' }}>{title}</h1>
        <span style={{ font: 'var(--type-body)', color: 'var(--muted-foreground)' }}>{subtitle}</span>
      </div>
      {actions ? <div style={{ marginLeft: 'auto' }}>{actions}</div> : null}
    </div>

    {tiles ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 'var(--gutter)' }}>{tiles}</div> : null}

    {children}
  </div>
);
