import React, { memo, useState } from 'react';
import { useNetworkStore } from '../../stores/networkStore';
import { usePacketStore } from '../../stores/packetStore';
import { CommandBar } from '../CommandBar';
import { SeverityBadge } from './SeverityBadge';

export interface NocStatusBarProps {
  status: string;
  error: string | null;
}

const CAPTURE_SOURCE_LABELS: Record<string, { label: string; level: 'ok' | 'info' | 'waiting' | 'critical' }> = {
  dumpcap: { label: 'DUMPCAP CAPTURE', level: 'ok' },
  real: { label: 'LIVE INTERFACE', level: 'ok' },
  simulated: { label: 'SIMULATION GENERATOR', level: 'info' },
  zeek: { label: 'ZEEK SENSOR STREAM', level: 'info' },
  netflow: { label: 'NETFLOW V9 COLLECTOR', level: 'info' },
  pcap_replay: { label: 'PCAP REPLAY', level: 'info' },
};

/**
 * Bottom instrumentation strip following Black Hat NOC Console design.
 */
export const NocStatusBar = memo(({ error }: NocStatusBarProps) => {
  const { nodes, connections } = useNetworkStore();
  const { packets } = usePacketStore();
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);

  const latestSource = packets.length ? packets[packets.length - 1].source : undefined;
  const sourceInfo = latestSource
    ? (CAPTURE_SOURCE_LABELS[latestSource] || { label: latestSource.toUpperCase(), level: 'info' as const })
    : { label: '— NO SOURCE DATA', level: 'waiting' as const };

  return (
    <footer
      className="noc-status-bar"
      style={{
        position: 'fixed',
        bottom: isConsoleOpen ? '150px' : '0px',
        left: 0,
        right: 0,
        height: '36px',
        zIndex: 1000,
        transition: 'bottom 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        gap: '12px',
        padding: '0 14px',
        background: 'var(--surface-chrome, #0e0e0e)',
        borderTop: 'var(--border-inset, 1px solid rgba(255, 255, 255, 0.1))',
        borderBottom: isConsoleOpen ? 'none' : undefined,
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-hi)',
      }}
    >
      {/* Left side: Command bar console trigger */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 auto', minWidth: '140px', maxWidth: '360px' }}>
        <CommandBar onConsoleToggle={setIsConsoleOpen} />
      </div>

      {/* Center/Right side: Real-time telemetry counters */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        <SeverityBadge level={sourceInfo.level} label={sourceInfo.label} />

        <span style={{ display: 'flex', alignItems: 'baseline', gap: '5px', color: 'var(--text-muted)' }}>
          PACKETS:
          <strong
            style={{
              color: 'var(--signal-cyan, #00b4d8)',
              font: 'var(--type-data-sm)',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 700,
            }}
          >
            {packets.length.toLocaleString()}
          </strong>
        </span>

        <span style={{ display: 'flex', alignItems: 'baseline', gap: '5px', color: 'var(--text-muted)' }}>
          NODES:
          <strong
            style={{
              color: 'var(--signal-teal, #00d2aa)',
              font: 'var(--type-data-sm)',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 700,
            }}
          >
            {nodes.length.toLocaleString()}
          </strong>
        </span>

        <span style={{ display: 'flex', alignItems: 'baseline', gap: '5px', color: 'var(--text-muted)' }}>
          CONNECTIONS:
          <strong
            style={{
              color: 'var(--signal-violet, #a855f7)',
              font: 'var(--type-data-sm)',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 700,
            }}
          >
            {connections.length.toLocaleString()}
          </strong>
        </span>

        {error ? (
          <SeverityBadge level="critical" label={error} />
        ) : nodes.length > 0 ? (
          <SeverityBadge level="ok" label="ACTIVE STREAM" />
        ) : (
          <SeverityBadge level="waiting" label="WAITING" />
        )}
      </div>
    </footer>
  );
});
