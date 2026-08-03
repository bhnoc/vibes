import React, { memo, useEffect, useState } from 'react';
import { Badge, IconButton, StatusDot, Separator, Sparkline } from './kit';
import { useTelemetry, formatBitrate, formatCount } from '../../telemetry/nocTelemetry';

/**
 * The 56px console top bar.
 *
 * Left is identity: the supplied Black Hat lockup (artwork only, never re-typed),
 * the product mark, and what this console is currently watching. Right is the
 * machine register: throughput, the two clocks, and the link state. Nothing in
 * between, because the middle of a top bar is where an operator's eye rests and
 * it should stay quiet.
 */

export type CaptureMode = 'simulated' | 'real' | 'zeek' | 'waiting';

const MODE: Record<CaptureMode, { label: string; tone: 'ok' | 'info' | 'warn' }> = {
  real: { label: 'Live capture', tone: 'ok' },
  simulated: { label: 'Simulated traffic', tone: 'info' },
  zeek: { label: 'Zeek sensor', tone: 'info' },
  waiting: { label: 'No source selected', tone: 'warn' },
};

const LINK: Record<string, { label: string; status: 'ok' | 'warning' | 'critical' }> = {
  connected: { label: 'Connected', status: 'ok' },
  connecting: { label: 'Connecting', status: 'warning' },
  disconnected: { label: 'Disconnected', status: 'critical' },
  error: { label: 'Link error', status: 'critical' },
  waiting: { label: 'Waiting', status: 'warning' },
};

export interface NocTopBarProps {
  captureMode: CaptureMode;
  captureInterface?: string;
  status: string;
  error: string | null;
  onOpenPalette: () => void;
  onToggleSettings: () => void;
  settingsOpen: boolean;
  onToggleDock: () => void;
  dockOpen: boolean;
}

export const NocTopBar = memo(
  ({ captureMode, captureInterface, status, error, onOpenPalette, onToggleSettings, settingsOpen, onToggleDock, dockOpen }: NocTopBarProps) => {
    const t = useTelemetry();
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
      const id = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(id);
    }, []);

    const mode = MODE[captureMode] ?? MODE.waiting;
    const link = LINK[status] ?? LINK.disconnected;

    const utc = now.toISOString().slice(11, 19);
    const local = now.toLocaleTimeString('en-GB', { hour12: false });
    const tz = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? '';

    return (
      <header
        style={{
          gridArea: 'topbar',
          height: 'var(--vibes-topbar-h)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-4)',
          padding: '0 var(--spacing-4)',
          background: 'var(--surface-chrome)',
          borderBottom: '1px solid var(--line-hairline)',
          boxShadow: 'var(--inset-top)',
          zIndex: 40,
        }}
      >
        <img src="/brand/blackhat-logo-white.png" alt="Black Hat" style={{ height: 22, display: 'block' }} />
        <Separator vertical style={{ height: 22, background: 'var(--line-strong)' }} />

        <span style={{ font: 'var(--font-weight-bold) var(--text-sm) var(--font-display)', letterSpacing: 'var(--tracking-wide)', color: 'var(--foreground)' }}>
          VIBES
        </span>
        <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
          Network operations center
        </span>

        <Badge tone={mode.tone} mono dot>
          {mode.label}
        </Badge>
        {captureMode === 'real' && captureInterface ? (
          <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>{captureInterface}</span>
        ) : null}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}>
          {/* Throughput read-out. The sparkline is the same series the dock charts,
              so the glance value and the panel value can never disagree. */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-2)' }} title="Packets per second over the last two minutes">
            <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--muted-foreground)' }}>PPS</span>
            <span style={{ font: 'var(--type-data)', color: 'var(--signal-teal)', fontVariantNumeric: 'tabular-nums', minWidth: 46, textAlign: 'right' }}>
              {formatCount(t.packetsPerSecond)}
            </span>
            <Sparkline data={t.ppsSeries} tone="ok" width={72} height={18} />
          </span>

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
            <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--muted-foreground)' }}>RATE</span>
            <span style={{ font: 'var(--type-data)', color: 'var(--text-body)', fontVariantNumeric: 'tabular-nums' }}>{formatBitrate(t.bytesPerSecond)}</span>
          </span>

          <Separator vertical style={{ height: 20 }} />

          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--spacing-2)' }}>
            <span style={{ font: 'var(--type-data)', color: 'var(--text-body)', fontVariantNumeric: 'tabular-nums' }}>{utc} UTC</span>
            <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
              {local} {tz}
            </span>
          </span>

          <span
            title={error || link.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--spacing-1-5)',
              padding: '3px var(--spacing-2-5)',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--line-soft)',
              background: 'var(--wash-neutral)',
            }}
          >
            <StatusDot status={link.status} size={7} pulse={link.status === 'ok' && t.live} ariaLabel={link.label} />
            <span style={{ font: 'var(--type-data-sm)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-body)' }}>
              {link.label}
            </span>
          </span>

          <span style={{ display: 'flex', gap: 'var(--spacing-1)' }}>
            <IconButton icon="Command" label="Command palette (Ctrl K)" onClick={onOpenPalette} />
            <IconButton icon="PanelRight" label={dockOpen ? 'Hide telemetry dock' : 'Show telemetry dock'} active={dockOpen} onClick={onToggleDock} />
            <IconButton icon="Settings" label="Capture settings" active={settingsOpen} onClick={onToggleSettings} />
          </span>
        </div>
      </header>
    );
  },
);
