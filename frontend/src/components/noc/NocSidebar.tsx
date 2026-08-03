import React, { memo } from 'react';
import { NavItem, Icon, IconName, IconButton, Tooltip, Input, StatusDot } from './kit';
import { useTelemetry, formatCount } from '../../telemetry/nocTelemetry';

/**
 * The fixed left shell: a 56px icon rail for surfaces, and a 240px sidebar for
 * operations. Only the content column between them scrolls.
 *
 * Counts on the nav rows are live and take the severity tone of what they count,
 * so the shape of the show is readable without opening anything.
 */

export type ConsoleView = 'map' | 'flows' | 'hosts' | 'alerts' | 'inspector';

export const VIEWS: { key: ConsoleView; label: string; icon: IconName; hint: string }[] = [
  { key: 'map', label: 'Live map', icon: 'Radar', hint: 'Real-time traffic map' },
  { key: 'flows', label: 'Flows', icon: 'Waypoints', hint: 'Active conversations' },
  { key: 'hosts', label: 'Hosts', icon: 'Server', hint: 'Talkers on the wire' },
  { key: 'alerts', label: 'Alerts', icon: 'Siren', hint: 'Detections from the stream' },
  { key: 'inspector', label: 'Inspector', icon: 'Bug', hint: 'Per-address packet inspector' },
];

const PROTOCOL_HUES: Record<string, string> = {
  tcp: 'var(--proto-tcp)',
  udp: 'var(--proto-udp)',
  icmp: 'var(--proto-icmp)',
  http: 'var(--proto-http)',
  https: 'var(--proto-http)',
  dns: 'var(--proto-dns)',
};

export const protocolHue = (protocol: string) => PROTOCOL_HUES[protocol.toLowerCase()] || 'var(--proto-other)';

/* -------------------------------------------------------------------------- */

export interface NocRailProps {
  view: ConsoleView;
  onView: (view: ConsoleView) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onUtility: (key: 'legend' | 'debug' | 'perf') => void;
  legendOpen: boolean;
  debugOpen: boolean;
  perfOpen: boolean;
}

export const NocRail = memo(({ view, onView, sidebarOpen, onToggleSidebar, onUtility, legendOpen, debugOpen, perfOpen }: NocRailProps) => (
  <nav
    aria-label="Console surfaces"
    style={{
      gridArea: 'rail',
      width: 'var(--vibes-rail-w)',
      background: 'var(--surface-chrome)',
      borderRight: '1px solid var(--line-hairline)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 'var(--spacing-2)',
      gap: 'var(--spacing-1-5)',
      zIndex: 30,
    }}
  >
    {VIEWS.map((v) => (
      <Tooltip key={v.key} side="right" label={v.hint}>
        <button
          type="button"
          onClick={() => onView(v.key)}
          aria-label={v.label}
          aria-current={view === v.key ? 'page' : undefined}
          style={{
            all: 'unset',
            boxSizing: 'border-box',
            cursor: 'pointer',
            width: 44,
            height: 44,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 'var(--radius-md)',
            color: view === v.key ? 'var(--background)' : 'var(--text-muted)',
            background: view === v.key ? 'var(--foreground)' : 'var(--surface-raised)',
            border: `1px solid ${view === v.key ? 'var(--foreground)' : 'var(--line-soft)'}`,
            transition: 'var(--transition-control)',
          }}
        >
          <Icon name={v.icon} size={20} />
        </button>
      </Tooltip>
    ))}

    <div style={{ marginTop: 'auto', paddingBottom: 'var(--spacing-3)', display: 'grid', gap: 'var(--spacing-1)', justifyItems: 'center' }}>
      <IconButton icon="Palette" label="Theme legend" size="sm" active={legendOpen} onClick={() => onUtility('legend')} />
      <IconButton icon="Activity" label="Performance test" size="sm" active={perfOpen} onClick={() => onUtility('perf')} />
      <IconButton icon="Terminal" label="Diagnostics" size="sm" active={debugOpen} onClick={() => onUtility('debug')} />
      <IconButton icon="PanelLeft" label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} size="sm" onClick={onToggleSidebar} />
    </div>
  </nav>
));

/* -------------------------------------------------------------------------- */

export interface NocSidebarProps {
  view: ConsoleView;
  onView: (view: ConsoleView) => void;
  query: string;
  onQuery: (q: string) => void;
  captureLabel: string;
  captureStatus: 'ok' | 'warning' | 'critical';
}

export const NocSidebar = memo(({ view, onView, query, onQuery, captureLabel, captureStatus }: NocSidebarProps) => {
  const t = useTelemetry();
  const openAlerts = t.alerts.filter((a) => !a.acknowledged).length;
  const criticals = t.alerts.filter((a) => !a.acknowledged && (a.level === 'critical' || a.level === 'high')).length;

  const counts: Record<ConsoleView, { value: string | number; tone: 'critical' | 'warn' | 'ok' | 'neutral' } | null> = {
    map: null,
    flows: { value: formatCount(t.flows), tone: 'neutral' },
    hosts: { value: formatCount(t.hosts), tone: 'neutral' },
    alerts: openAlerts ? { value: openAlerts, tone: criticals ? 'critical' : 'warn' } : null,
    inspector: null,
  };

  return (
    <aside
      aria-label="Operations"
      style={{
        gridArea: 'sidebar',
        width: 'var(--vibes-sidebar-w)',
        background: 'var(--surface-card)',
        borderRight: '1px solid var(--line-hairline)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        zIndex: 20,
      }}
    >
      <div style={{ padding: 'var(--spacing-3) var(--spacing-3) var(--spacing-2)' }}>
        <Input
          size="sm"
          mono
          icon="Search"
          placeholder="Filter by IP or port"
          ariaLabel="Filter hosts and flows"
          value={query}
          onChange={onQuery}
          suffix={query ? '×' : undefined}
        />
      </div>

      <div style={{ padding: '0 var(--spacing-3) var(--spacing-1-5)' }}>
        <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
          Surfaces
        </span>
      </div>
      <div style={{ padding: '0 var(--spacing-2)', display: 'grid', gap: 2 }}>
        {VIEWS.map((v) => {
          const c = counts[v.key];
          return <NavItem key={v.key} icon={v.icon} label={v.label} count={c?.value} tone={c?.tone} active={view === v.key} onClick={() => onView(v.key)} />;
        })}
      </div>

      <div style={{ padding: 'var(--spacing-4) var(--spacing-3) var(--spacing-2)' }}>
        <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
          Protocol mix
        </span>
      </div>

      {/* The legend and the map read the same tokens, so a hue means one thing
          in both places. Empty stays empty rather than showing a zeroed list. */}
      <div style={{ padding: '0 var(--spacing-3)', display: 'grid', gap: 'var(--spacing-1-5)', minHeight: 0, overflowY: 'auto' }}>
        {t.protocols.length === 0 ? (
          <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>No traffic in the last 2 min.</span>
        ) : (
          t.protocols.slice(0, 6).map((p) => (
            <div key={p.protocol} style={{ display: 'grid', gridTemplateColumns: '10px minmax(0,1fr) 40px', gap: 'var(--spacing-2)', alignItems: 'center', height: 20 }}>
              <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: protocolHue(p.protocol) }} />
              <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-body)', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'uppercase' }}>
                {p.protocol}
              </span>
              <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-faint)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {p.pct.toFixed(0)}%
              </span>
            </div>
          ))
        )}
      </div>

      <div
        style={{
          marginTop: 'auto',
          borderTop: '1px solid var(--line-hairline)',
          padding: 'var(--spacing-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-2)',
          minWidth: 0,
        }}
      >
        <StatusDot status={captureStatus} size={8} pulse={captureStatus === 'ok' && t.live} ariaLabel={`Capture ${captureStatus}`} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', font: 'var(--type-ui-sm)', color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {captureLabel}
          </span>
          <span style={{ display: 'block', font: 'var(--type-data-sm)', color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
            {formatCount(t.totalPackets)} packets seen
          </span>
        </span>
      </div>
    </aside>
  );
});
