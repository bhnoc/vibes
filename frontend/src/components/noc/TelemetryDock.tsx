import React, { memo, useMemo, useState } from 'react';
import {
  Card,
  CardState,
  Gauge,
  Sparkline,
  StatTile,
  LogStream,
  DataTable,
  Column,
  SeverityBadge,
  Button,
  IconButton,
  Switch,
  Badge,
} from './kit';
import { protocolHue } from './NocSidebar';
import {
  useTelemetry,
  useTelemetryStore,
  formatBitrate,
  formatBytes,
  formatCount,
  formatClock,
  formatRelative,
  Alert,
  Talker,
} from '../../telemetry/nocTelemetry';

/**
 * The right-hand instrumentation dock.
 *
 * Every panel here declares its own freshness. That is the point of the dock:
 * the map can look busy while the numbers behind it are four minutes old, and
 * the operator has to be able to see which of the two is lying. Freshness is
 * derived once, from the age of the last packet, and every card reads it, so no
 * panel can independently claim to be live.
 */

/** Fresh under 3s, stale to 30s, unreachable past that. */
function freshness(secondsSincePacket: number): { state: CardState; updated: string } {
  if (secondsSincePacket < 3) return { state: 'ready', updated: 'live' };
  if (secondsSincePacket < 30) return { state: 'stale', updated: formatRelative(secondsSincePacket) };
  return { state: 'unreachable', updated: formatRelative(secondsSincePacket) };
}

/* -------------------------------------------------------------------------- */

const TalkerRow: React.FC<{ talker: Talker; tone: string }> = ({ talker, tone }) => (
  <div
    title={`${talker.host} · ${formatCount(talker.packets)} packets`}
    style={{ display: 'grid', gridTemplateColumns: 'minmax(0,118px) minmax(0,1fr) 62px', gap: 'var(--spacing-3)', alignItems: 'center', height: 30, borderBottom: 'var(--border-inset)' }}
  >
    <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{talker.host}</span>
    <span style={{ height: 4, background: 'var(--secondary)', minWidth: 0, borderRadius: 2 }}>
      <span style={{ display: 'block', width: `${talker.pct}%`, height: '100%', background: tone, borderRadius: 2, transition: 'width var(--duration-base) var(--ease-out)' }} />
    </span>
    <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-body)', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {formatBytes(talker.bytes)}
    </span>
  </div>
);

/* -------------------------------------------------------------------------- */

export interface TelemetryDockProps {
  onSelectHost: (host: string) => void;
  selectedHost: string | null;
}

export const TelemetryDock = memo(({ onSelectHost, selectedHost }: TelemetryDockProps) => {
  const t = useTelemetry();
  const acknowledge = useTelemetryStore((s) => s.acknowledge);
  const acknowledgeAll = useTelemetryStore((s) => s.acknowledgeAll);
  const [follow, setFollow] = useState(true);

  const { state, updated } = freshness(t.secondsSincePacket);
  const openAlerts = t.alerts.filter((a) => !a.acknowledged);

  const alertColumns = useMemo<Column<Alert>[]>(
    () => [
      { key: 'level', label: 'Sev', width: '86px', render: (r) => <SeverityBadge level={r.level} blink={!r.acknowledged && r.level === 'critical'} /> },
      { key: 'event', label: 'Event', width: 'minmax(0,1fr)', tone: 'hi' },
      { key: 'src', label: 'Source', width: 'minmax(0,110px)', mono: true, tone: 'muted' },
      { key: 'hits', label: 'Hits', width: '52px', mono: true, align: 'right' },
    ],
    [],
  );

  return (
    <aside
      aria-label="Telemetry"
      style={{
        gridArea: 'dock',
        width: 'var(--vibes-dock-w)',
        background: 'var(--surface-chrome)',
        borderLeft: '1px solid var(--line-hairline)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--gutter)',
        padding: 'var(--gutter)',
        overflowY: 'auto',
        minHeight: 0,
        zIndex: 20,
      }}
    >
      {/* Throughput. Two numbers and their trends: what is arriving, and how fast. */}
      <Card title="Throughput" meta="2 min window" state={state} updated={updated} dense>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 'var(--spacing-4)' }}>
          <StatTile bare label="Packets / sec" value={formatCount(t.packetsPerSecond)} tone="ok" series={t.ppsSeries} sub={`peak ${formatCount(t.peakPps)}`} />
          <StatTile bare label="Bitrate" value={formatBitrate(t.bytesPerSecond).split(' ')[0]} unit={formatBitrate(t.bytesPerSecond).split(' ')[1]} tone="info" series={t.bpsSeries} sub={`${formatBytes(t.totalBytes)} total`} />
        </div>
      </Card>

      {/* Working set. These are the two numbers that decide whether the map is
          readable, so they are meters rather than bare counts. */}
      <Card title="Working set" meta="what the map is drawing" state={state} updated={updated} dense>
        <div style={{ display: 'grid', gap: 'var(--spacing-3)' }}>
          <Gauge label="Hosts" value={t.hosts} max={1000} valueLabel={`${formatCount(t.hosts)} / 1,000`} thresholds={[60, 85]} />
          <Gauge label="Active flows" value={t.flows} max={5000} valueLabel={formatCount(t.flows)} thresholds={[60, 85]} tone="info" />
          <div style={{ display: 'flex', gap: 'var(--spacing-4)', paddingTop: 'var(--spacing-1)' }}>
            <Sparkline data={t.hostSeries} tone="ok" width={140} height={22} style={{ flex: 1 }} />
            <Sparkline data={t.flowSeries} tone="info" width={140} height={22} style={{ flex: 1 }} />
          </div>
        </div>
      </Card>

      {/* Top talkers. Volume share, decayed, so a finished burst leaves the table. */}
      <Card
        title="Top talkers"
        meta={`${t.talkers.length} of ${formatCount(t.hosts)} hosts`}
        state={state}
        updated={updated}
        dense
        actions={selectedHost ? <Button size="xs" variant="ghost" onClick={() => onSelectHost('')}>Clear</Button> : undefined}
      >
        {t.talkers.length === 0 ? (
          <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>No talkers in this window. Nothing has been captured yet.</span>
        ) : (
          <div>
            {t.talkers.map((talker, i) => (
              <button
                key={talker.host}
                type="button"
                onClick={() => onSelectHost(talker.host)}
                aria-label={`Focus ${talker.host}`}
                style={{
                  all: 'unset',
                  display: 'block',
                  width: '100%',
                  cursor: 'pointer',
                  background: selectedHost === talker.host ? 'var(--muted)' : 'transparent',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <TalkerRow talker={talker} tone={i === 0 ? 'var(--signal-amber)' : 'var(--signal-teal)'} />
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Services. Destination ports, named where we know them. */}
      <Card title="Top services" meta="by destination port" state={state} updated={updated} dense>
        {t.services.length === 0 ? (
          <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>No port data. The current source does not report ports.</span>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--spacing-2)' }}>
            {t.services.map((s) => (
              <div key={s.port} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 44px', gap: 'var(--spacing-2)', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, flex: '0 0 auto', borderRadius: 'var(--radius-full)', background: protocolHue(s.name) }} />
                  <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </span>
                  <span style={{ marginLeft: 'auto', font: 'var(--type-data-sm)', color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCount(s.packets)}
                  </span>
                </span>
                <span style={{ height: 4, background: 'var(--secondary)', borderRadius: 2 }}>
                  <span style={{ display: 'block', width: `${s.pct}%`, height: '100%', background: 'var(--signal-cyan)', borderRadius: 2 }} />
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Detections. Everything here names the rule that fired it. */}
      <Card
        title="Detections"
        meta={openAlerts.length ? `${openAlerts.length} open` : 'none open'}
        state={state === 'unreachable' ? 'ready' : state}
        updated={updated}
        flush
        actions={
          openAlerts.length ? (
            <Button size="xs" variant="signal" onClick={acknowledgeAll}>
              Acknowledge all
            </Button>
          ) : undefined
        }
      >
        <DataTable<Alert>
          columns={alertColumns}
          rows={t.alerts.slice(0, 8)}
          severityKey="level"
          rowLabel={(r) => `${r.level} detection: ${r.event} from ${r.src}`}
          onRowClick={(r) => acknowledge(r.id)}
          empty="No detections in this window. Rules: port scan, host sweep, ICMP flood, sensitive service."
          maxHeight={260}
        />
      </Card>

      {/* Live stream. The caret only blinks while lines are arriving. */}
      <Card
        title="Live stream"
        meta="all sources"
        updated={t.live && follow ? 'live' : follow ? updated : 'paused'}
        state={state === 'unreachable' ? 'ready' : 'ready'}
        dense
        actions={
          <>
            <Switch size="sm" checked={follow} onChange={setFollow} ariaLabel="Follow the live stream" />
            <IconButton icon="Download" label="Copy visible lines" size="sm" onClick={() => navigator.clipboard?.writeText(t.log.map((l) => `${l.time} ${l.tag} ${l.text}`).join('\n'))} />
          </>
        }
      >
        <LogStream lines={t.log} height={180} follow={follow} live={t.live} empty="No events yet. Lines appear as packets arrive." />
      </Card>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', paddingBottom: 'var(--spacing-2)' }}>
        <Badge tone="neutral" mono>
          sampled {formatClock(t.sampledAt || Date.now())}
        </Badge>
        <span style={{ marginLeft: 'auto', font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>1 Hz</span>
      </div>
    </aside>
  );
});
