import React from 'react';

/**
 * Append-only mono event feed.
 *
 * The caret is not decoration: it renders only while `live` is true, meaning
 * lines are actually arriving. A caret blinking over a frozen transcript tells
 * the operator something untrue, which is the one thing an instrument may not do.
 */

export type LogTone = 'critical' | 'warn' | 'ok' | 'info' | 'rf' | 'debug';

export interface LogLine {
  id?: string | number;
  time: string;
  tag?: string;
  text: string;
  tone?: LogTone;
}

const TAG_HUES: Record<LogTone, string> = {
  critical: 'var(--destructive)',
  warn: 'var(--signal-amber)',
  ok: 'var(--signal-teal)',
  info: 'var(--signal-cyan)',
  rf: 'var(--signal-violet)',
  debug: 'var(--muted-foreground)',
};

export interface LogStreamProps {
  lines: LogLine[];
  height?: number | string;
  follow?: boolean;
  live?: boolean;
  showTime?: boolean;
  empty?: React.ReactNode;
  style?: React.CSSProperties;
}

export const LogStream: React.FC<LogStreamProps> = ({
  lines,
  height = 220,
  follow = true,
  live = false,
  showTime = true,
  empty = 'No events in this window.',
  style,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [lines, follow]);

  return (
    <div
      ref={ref}
      role="log"
      aria-live="off"
      style={{
        height,
        overflow: 'auto',
        overflowAnchor: 'none',
        background: 'var(--background)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--spacing-3)',
        font: 'var(--type-data-sm)',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.65,
        ...style,
      }}
    >
      {lines.length === 0 ? (
        <span style={{ color: 'var(--muted-foreground)' }}>{empty}</span>
      ) : (
        lines.map((l, i) => (
          <div key={l.id ?? i} style={{ display: 'flex', gap: 'var(--spacing-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {showTime ? <span style={{ color: 'var(--muted-foreground)', flex: '0 0 auto' }}>{l.time}</span> : null}
            {l.tag ? <span style={{ color: TAG_HUES[l.tone || 'debug'], flex: '0 0 auto' }}>{l.tag}</span> : null}
            <span
              style={{
                color: l.tone === 'critical' ? 'var(--destructive)' : l.tone === 'debug' ? 'var(--muted-foreground)' : 'var(--text-body)',
                minWidth: 0,
              }}
            >
              {l.text}
            </span>
          </div>
        ))
      )}
      {live && follow ? (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 7,
            height: 13,
            background: 'var(--signal-teal)',
            animation: 'bh-blink 1s steps(1) infinite',
            verticalAlign: 'text-bottom',
          }}
        />
      ) : null}
    </div>
  );
};
