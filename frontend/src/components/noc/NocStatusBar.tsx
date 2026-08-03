import React, { memo, useState } from 'react';
import { Separator, StatusDot } from './kit';
import { CommandBar } from '../CommandBar';
import { ConsoleView } from './NocSidebar';
import { useTelemetry, formatBitrate, formatBytes, formatCount, formatRelative } from '../../telemetry/nocTelemetry';

/**
 * The 28px status bar: the console's machine register.
 *
 * Everything here is UPPERCASE mono meta labels with tabular values beside them,
 * which is the one place the system allows uppercase. Read left to right it is
 * the whole health of the capture in a single line, so an operator glancing down
 * never has to open a panel to know whether the show is fine.
 *
 * Shortcut hints appear only for the view that actually handles them.
 */

const Item: React.FC<{ label: string; value: React.ReactNode; tone?: string; title?: string }> = ({ label, value, tone, title }) => (
  <span
    title={title}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--spacing-1-5)',
      // The bar is exactly one line tall. A value that wraps rather than clips
      // pushes its own text out of the bar and out of sight.
      flex: '0 0 auto',
      whiteSpace: 'nowrap',
      font: 'var(--type-data-sm)',
      color: 'var(--text-faint)',
    }}
  >
    <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>{label}</span>
    <span style={{ color: tone || 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
  </span>
);

export interface NocStatusBarProps {
  error: string | null;
  sourceLabel: string;
  view: ConsoleView;
}

export const NocStatusBar = memo(({ error, sourceLabel, view }: NocStatusBarProps) => {
  const t = useTelemetry();
  const [consoleOpen, setConsoleOpen] = useState(false);

  const open = t.alerts.filter((a) => !a.acknowledged).length;
  const critical = t.alerts.filter((a) => !a.acknowledged && (a.level === 'critical' || a.level === 'high')).length;

  return (
    <footer
      aria-label="Capture status"
      style={{
        gridArea: 'statusbar',
        height: 'var(--vibes-statusbar-h)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-5)',
        padding: '0 var(--spacing-4)',
        background: 'var(--surface-chrome)',
        borderTop: '1px solid var(--line-hairline)',
        zIndex: 40,
      }}
    >
      {/* Metrics take whatever width is left and clip from the right, so the
          least important reading is the first to go rather than the layout. */}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-5)',
          flex: '1 1 auto',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-1-5)', flex: '0 0 auto', whiteSpace: 'nowrap' }}>
          <StatusDot status={error ? 'critical' : t.live ? 'ok' : 'warning'} size={7} pulse={t.live && !error} ariaLabel={error ? 'Capture error' : t.live ? 'Capture live' : 'Capture idle'} />
          <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>SOURCE</span>
          <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-body)' }}>{sourceLabel}</span>
        </span>

        <Separator vertical style={{ height: 14 }} />

        <Item label="PPS" value={formatCount(t.packetsPerSecond)} tone="var(--signal-teal)" title="Packets per second, sampled once per second" />
        <Item label="RATE" value={formatBitrate(t.bytesPerSecond)} />
        <Item label="HOSTS" value={formatCount(t.hosts)} />
        <Item label="FLOWS" value={formatCount(t.flows)} tone="var(--signal-violet)" />
        <Item label="SEEN" value={`${formatCount(t.totalPackets)} · ${formatBytes(t.totalBytes)}`} />
        <Item
          label="OPEN"
          value={open ? `${open} detection${open === 1 ? '' : 's'}` : 'none'}
          tone={critical ? 'var(--signal-red)' : open ? 'var(--signal-amber)' : undefined}
        />

        {error ? (
          <span
            title={error}
            style={{ font: 'var(--type-data-sm)', color: 'var(--signal-red)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {error}
          </span>
        ) : null}
      </span>

      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)', flex: '0 0 auto' }}>
        <span style={{ display: 'flex', gap: 'var(--spacing-3)', font: 'var(--type-data-sm)', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
          <span>Ctrl K palette</span>
          <span style={consoleOpen ? { color: 'var(--signal-teal)' } : undefined}>~ console</span>
          {view === 'alerts' ? <span>A acknowledge all</span> : null}
          <span>sync {formatRelative(t.secondsSincePacket)}</span>
        </span>
        <span style={{ display: 'flex', minWidth: 190, maxWidth: 320 }}>
          <CommandBar onConsoleToggle={setConsoleOpen} />
        </span>
      </span>
    </footer>
  );
});
