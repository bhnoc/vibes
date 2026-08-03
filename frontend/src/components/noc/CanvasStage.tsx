import React, { memo, useEffect, useRef } from 'react';
import { StatTile, Badge, Icon, Separator } from './kit';
import { protocolHue } from './NocSidebar';
import { useSizeStore } from '../../stores/sizeStore';
import { useTelemetry, formatCount, formatBitrate, formatRelative } from '../../telemetry/nocTelemetry';

/**
 * The capture canvas and everything that floats over it.
 *
 * The map is the one full-bleed surface in the product, so the rules that
 * govern cards do not apply: no border, no radius, no panel chrome. Text placed
 * on top of it is made legible by the scrims rather than by a background, which
 * is the only use of a gradient the system permits.
 *
 * The renderer sizes itself from the size store, which used to track the window.
 * It now tracks this element, because the map no longer owns the whole viewport.
 */

export interface CanvasStageProps {
  children: React.ReactNode;
  captureLabel: string;
  paused?: boolean;
}

export const CanvasStage = memo(({ children, captureLabel, paused }: CanvasStageProps) => {
  const t = useTelemetry();
  const ref = useRef<HTMLDivElement>(null);
  const setSize = useSizeStore((s) => s.setSize);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize(Math.round(rect.width), Math.round(rect.height));
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [setSize]);

  const empty = t.hosts === 0;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
      <div ref={ref} className="canvas-container">
        {children}
      </div>

      <div className="canvas-vignette" />
      <div className="canvas-scrim-top" />
      <div className="canvas-scrim-bottom" />

      {/* Glance strip. Four numbers, no chrome: on a map, a card border would
          read as a region of the network rather than as an overlay. */}
      <div
        style={{
          position: 'absolute',
          top: 'var(--spacing-4)',
          left: 'var(--spacing-5)',
          right: 'var(--spacing-5)',
          zIndex: 2,
          display: 'grid',
          gridTemplateColumns: 'repeat(4,minmax(0,max-content))',
          gap: 'var(--spacing-8)',
          pointerEvents: 'none',
        }}
      >
        <StatTile bare label="Hosts" value={formatCount(t.hosts)} tone="ok" sub={`${formatCount(t.talkers.length)} talking now`} />
        <StatTile bare label="Active flows" value={formatCount(t.flows)} tone="info" sub={`${formatCount(t.totalPackets)} packets seen`} />
        <StatTile bare label="Packets / sec" value={formatCount(t.packetsPerSecond)} tone="neutral" sub={formatBitrate(t.bytesPerSecond)} />
        <StatTile
          bare
          label="Open detections"
          value={formatCount(t.alerts.filter((a) => !a.acknowledged).length)}
          tone={t.alerts.some((a) => !a.acknowledged && (a.level === 'critical' || a.level === 'high')) ? 'critical' : 'neutral'}
          sub={t.scanSuspects ? `${t.scanSuspects} scanning hosts` : 'no scanning hosts'}
        />
      </div>

      {/* Bottom-left legend. The map's hues are the panels' hues; saying so once
          here saves the operator from guessing. */}
      <div
        style={{
          position: 'absolute',
          bottom: 'var(--spacing-4)',
          left: 'var(--spacing-5)',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-3)',
          pointerEvents: 'none',
        }}
      >
        {t.protocols.slice(0, 5).map((p) => (
          <span key={p.protocol} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-1-5)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: protocolHue(p.protocol) }} />
            <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {p.protocol}
            </span>
            <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>{p.pct.toFixed(0)}%</span>
          </span>
        ))}
      </div>

      {/* Bottom-right: how to drive the map, plus how old the picture is. */}
      <div
        style={{
          position: 'absolute',
          bottom: 'var(--spacing-4)',
          right: 'var(--spacing-5)',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-3)',
          font: 'var(--type-data-sm)',
          color: 'var(--text-faint)',
          pointerEvents: 'none',
        }}
      >
        <span>drag to pan</span>
        <Separator vertical style={{ height: 12 }} />
        <span>scroll to zoom</span>
        <Separator vertical style={{ height: 12 }} />
        <span style={{ color: t.live ? 'var(--signal-teal)' : 'var(--signal-amber)' }}>{formatRelative(t.secondsSincePacket)}</span>
      </div>

      {paused ? (
        <div style={{ position: 'absolute', top: 'var(--spacing-4)', right: 'var(--spacing-5)', zIndex: 3 }}>
          <Badge tone="warn" mono dot>
            Paused
          </Badge>
        </div>
      ) : null}

      {/* Empty state: the fact, then the reason. No mascot, no spinner over a
          canvas that is working perfectly well and simply has nothing to draw. */}
      {empty ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'grid', gap: 'var(--spacing-3)', justifyItems: 'center', maxWidth: 420, textAlign: 'center' }}>
            <Icon name="Radar" size={24} style={{ color: 'var(--muted-foreground)' }} />
            <span style={{ font: 'var(--type-h3)', color: 'var(--text-body)' }}>No traffic on this source yet</span>
            <span style={{ font: 'var(--type-body)', color: 'var(--muted-foreground)' }}>
              Source: {captureLabel}. Hosts appear as soon as the first packet arrives; nothing is drawn from cache.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
});
