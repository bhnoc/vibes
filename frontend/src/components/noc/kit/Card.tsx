import React from 'react';
import { Skeleton } from './Skeleton';

/**
 * shadcn/ui Card with the NOC's panel data states layered on.
 *
 * Two rules from the system are load-bearing here and easy to undo by accident:
 * a bordered card never also carries a shadow, and a card never clips its
 * contents, so a tooltip opened inside a panel is not cut off at the edge.
 *
 * Every live panel must declare one of four states. `stale` and `unreachable`
 * matter more than `ready`: the worst moment in a NOC is the one where a sensor
 * quietly stopped answering and the panel kept showing the last good number.
 */

export type CardState = 'ready' | 'loading' | 'stale' | 'unreachable';

const STATE_FLAGS: Partial<Record<CardState, [string, string, string]>> = {
  stale: ['Stale', 'var(--signal-amber)', 'var(--wash-medium)'],
  unreachable: ['No data', 'var(--destructive)', 'var(--wash-critical)'],
};

export interface CardProps {
  children?: React.ReactNode;
  title?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Freshness string, shown right-aligned in the header. Say "live" only when values are arriving. */
  updated?: React.ReactNode;
  state?: CardState;
  dense?: boolean;
  /** Removes body padding, for tables and streams that own their own edges. */
  flush?: boolean;
  clip?: boolean;
  retry?: React.ReactNode;
  unreachableText?: string;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  meta,
  actions,
  updated,
  state = 'ready',
  dense,
  flush,
  clip,
  retry,
  unreachableText,
  style,
  bodyStyle,
}) => {
  const shorthand = title != null || actions != null || meta != null;
  const flag = STATE_FLAGS[state];

  return (
    <div
      data-slot="card"
      data-state={state}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: shorthand ? 0 : 'var(--spacing-6)',
        background: 'var(--card)',
        color: 'var(--card-foreground)',
        border: 'var(--border-card)',
        borderRadius: 'var(--radius-xl)',
        padding: shorthand || flush ? 0 : 'var(--spacing-6) 0',
        minWidth: 0,
        overflow: clip ? 'hidden' : 'visible',
        ...style,
      }}
    >
      {shorthand ? (
        <div
          data-slot="card-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-3)',
            minHeight: 40,
            padding: '0 var(--pad-card-tight)',
            borderBottom: 'var(--border-inset)',
            whiteSpace: 'nowrap',
            background: flag ? flag[2] : 'transparent',
            borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
          }}
        >
          <h2 style={{ margin: 0, font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--muted-foreground)', flex: '0 0 auto' }}>
            {title}
          </h2>
          {meta ? (
            <span style={{ font: 'var(--type-data-sm)', color: 'var(--muted-foreground)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</span>
          ) : null}
          {flag ? (
            <span style={{ font: 'var(--type-data-sm)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: flag[1], flex: '0 0 auto' }}>
              {flag[0]}
              {updated ? <> · {updated}</> : null}
            </span>
          ) : updated ? (
            <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-faint)', flex: '0 0 auto' }}>{updated}</span>
          ) : null}
          {actions ? (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--spacing-1)', alignItems: 'center' }}>{actions}</div>
          ) : null}
        </div>
      ) : null}

      {shorthand ? (
        <div
          data-slot="card-content"
          style={{
            padding: flush && state === 'ready' ? 0 : dense || state !== 'ready' ? 'var(--pad-card-tight)' : 'var(--pad-card)',
            flex: 1,
            minHeight: 0,
            opacity: state === 'stale' ? 0.72 : 1,
            ...bodyStyle,
          }}
        >
          {state === 'loading' ? (
            <div style={{ display: 'grid', gap: 'var(--spacing-3)' }}>
              <Skeleton width="45%" height={14} />
              <Skeleton height={14} />
              <Skeleton width="70%" height={14} />
            </div>
          ) : state === 'unreachable' ? (
            <div style={{ display: 'grid', gap: 'var(--spacing-3)', justifyItems: 'start' }}>
              <span style={{ font: 'var(--type-body)', color: 'var(--text-body)' }}>
                {unreachableText || 'No data from this source. The last value is older than the window, so nothing is shown.'}
              </span>
              {retry}
            </div>
          ) : (
            children
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
};
