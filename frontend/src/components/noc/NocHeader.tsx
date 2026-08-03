import React, { useState, useEffect } from 'react';
import { StatusDot, StatusLevel } from './StatusDot';
import { SeverityBadge } from './SeverityBadge';

export interface NocHeaderProps {
  currentRoute: string;
  status: string;
  error: string | null;
  captureMode: 'simulated' | 'real' | 'zeek' | 'waiting';
  showSettings: boolean;
  onToggleSettings: () => void;
}

const MODE_LABELS: Record<string, { label: string; level: 'ok' | 'info' | 'waiting' | 'critical' }> = {
  real: { label: 'LIVE CAPTURE', level: 'ok' },
  simulated: { label: 'SIMULATED TRAFFIC', level: 'info' },
  zeek: { label: 'ZEEK SENSOR', level: 'info' },
  waiting: { label: 'WAITING FOR STREAM', level: 'waiting' },
};

export const NocHeader: React.FC<NocHeaderProps> = ({
  currentRoute,
  status,
  error,
  captureMode,
  showSettings,
  onToggleSettings,
}) => {
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('en-US', { hour12: false }));
    };
    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, []);

  const modeInfo = MODE_LABELS[captureMode] || { label: captureMode.toUpperCase(), level: 'info' };

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '56px',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '0 18px',
        borderBottom: 'var(--border-inset, 1px solid rgba(255,255,255,0.1))',
        background: 'var(--surface-chrome, #0e0e0e)',
        color: 'var(--text-hi, #fff)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Wordmark and Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          style={{
            font: 'var(--type-label)',
            letterSpacing: 'var(--tracking-wide, 0.14em)',
            textTransform: 'uppercase',
            color: 'var(--text-hi, #fff)',
            fontWeight: 700,
          }}
        >
          VIBES
        </span>
        <div style={{ width: '1px', height: '24px', background: 'var(--line-strong, rgba(255,255,255,0.2))' }} />
        <span
          style={{
            font: 'var(--type-label)',
            letterSpacing: 'var(--tracking-wide, 0.14em)',
            textTransform: 'uppercase',
            color: 'var(--text-faint, rgba(255,255,255,0.6))',
          }}
        >
          Network Operations Center
        </span>
      </div>

      {/* Mode / Sensor Chip */}
      <SeverityBadge level={modeInfo.level} label={modeInfo.label} />

      {/* Navigation Tabs */}
      <nav
        aria-label="Surface navigation"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginLeft: '24px',
        }}
      >
        <a
          href="#main"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minHeight: '34px',
            padding: '0 14px',
            borderRadius: 'var(--radius-md, 8px)',
            background: currentRoute === 'main' ? 'var(--sidebar-accent, rgba(255,255,255,0.1))' : 'transparent',
            color: currentRoute === 'main' ? 'var(--text-hi, #fff)' : 'var(--text-muted, rgba(255,255,255,0.65))',
            font: 'var(--type-ui)',
            textDecoration: 'none',
            border: currentRoute === 'main' ? 'var(--border-control, 1px solid rgba(255,255,255,0.15))' : '1px solid transparent',
            transition: 'all 0.15s ease',
          }}
        >
          {currentRoute === 'main' && (
            <span
              style={{
                width: '3px',
                height: '14px',
                borderRadius: '2px',
                background: 'var(--signal-teal, #00d2aa)',
              }}
            />
          )}
          Overview
        </a>
        <a
          href="#debug"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minHeight: '34px',
            padding: '0 14px',
            borderRadius: 'var(--radius-md, 8px)',
            background: currentRoute === 'debug' ? 'var(--sidebar-accent, rgba(255,255,255,0.1))' : 'transparent',
            color: currentRoute === 'debug' ? 'var(--text-hi, #fff)' : 'var(--text-muted, rgba(255,255,255,0.65))',
            font: 'var(--type-ui)',
            textDecoration: 'none',
            border: currentRoute === 'debug' ? 'var(--border-control, 1px solid rgba(255,255,255,0.15))' : '1px solid transparent',
            transition: 'all 0.15s ease',
          }}
        >
          {currentRoute === 'debug' && (
            <span
              style={{
                width: '3px',
                height: '14px',
                borderRadius: '2px',
                background: 'var(--signal-teal, #00d2aa)',
              }}
            />
          )}
          IP Debug
        </a>
      </nav>

      {/* Right side operational controls & metrics */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Settings Button */}
        <button
          onClick={onToggleSettings}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            minHeight: '34px',
            padding: '0 14px',
            borderRadius: 'var(--radius-md, 8px)',
            border: 'var(--border-control, 1px solid rgba(255,255,255,0.15))',
            background: showSettings ? 'var(--wash-ok, rgba(0, 210, 170, 0.14))' : 'var(--card, #141414)',
            color: showSettings ? 'var(--signal-teal, #00d2aa)' : 'var(--text-hi, #fff)',
            font: 'var(--type-ui-sm)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <span>Operations Console</span>
        </button>

        {/* Connection status dot */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '5px 12px',
            border: `1px solid ${status === 'connected' ? 'var(--signal-teal)' : status === 'connecting' ? 'var(--signal-amber)' : 'var(--signal-red)'}`,
            borderRadius: '999px',
            background: status === 'connected' ? 'var(--wash-ok)' : status === 'connecting' ? 'var(--wash-medium)' : 'var(--wash-critical)',
          }}
          title={error || undefined}
        >
          <StatusDot
            status={
              status === 'connected'
                ? 'ok'
                : status === 'connecting'
                ? 'warning'
                : 'critical'
            }
            size={7}
            pulse={status === 'connected'}
          />
          <span
            style={{
              font: 'var(--type-data-sm)',
              color: status === 'connected' ? 'var(--signal-teal)' : status === 'connecting' ? 'var(--signal-amber)' : 'var(--signal-red)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-label, 0.08em)',
            }}
          >
            {status}
          </span>
        </div>

        {/* Local/UTC timestamp in monospace tabular numerals */}
        <span
          style={{
            font: 'var(--type-data-sm)',
            color: 'var(--text-muted, rgba(255,255,255,0.65))',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {timeStr || '00:00:00'}
        </span>
      </div>
    </header>
  );
};
