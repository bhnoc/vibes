import React from 'react';

/**
 * shadcn/ui Badge: pill, 12px, medium weight. `tone` is the NOC extension that
 * colours a badge from the signal palette using a 14% wash behind the hue.
 */

export type SignalTone = 'ok' | 'critical' | 'warn' | 'info' | 'rf' | 'neutral';
type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const TONES: Record<SignalTone, [string, string]> = {
  ok: ['var(--wash-ok)', 'var(--signal-teal)'],
  critical: ['var(--wash-critical)', 'var(--signal-red)'],
  warn: ['var(--wash-medium)', 'var(--signal-amber)'],
  info: ['var(--wash-info)', 'var(--signal-cyan)'],
  rf: ['var(--wash-violet)', 'var(--signal-violet)'],
  neutral: ['var(--wash-neutral)', 'var(--muted-foreground)'],
};

const VARIANTS: Record<BadgeVariant, React.CSSProperties> = {
  default: { background: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'transparent' },
  secondary: { background: 'var(--secondary)', color: 'var(--secondary-foreground)', borderColor: 'transparent' },
  destructive: { background: 'var(--destructive)', color: 'var(--bh-white)', borderColor: 'transparent' },
  outline: { background: 'transparent', color: 'var(--foreground)', borderColor: 'var(--border)' },
};

export interface BadgeProps {
  children?: React.ReactNode;
  variant?: BadgeVariant;
  tone?: SignalTone;
  /** Machine register: mono, uppercase, label tracking. Use for LIVE, BLOCKED, ACK. */
  mono?: boolean;
  dot?: boolean;
  /** Marks an unacknowledged critical. The blink stops the moment it is acknowledged. */
  blink?: boolean;
  count?: number;
  title?: string;
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'secondary', tone, mono, dot, blink, count, title, style }) => {
  const css = tone
    ? (() => {
        const [bg, fg] = TONES[tone];
        return { background: bg, color: fg, borderColor: `color-mix(in oklab,${fg} 32%,transparent)` };
      })()
    : VARIANTS[variant];

  return (
    <span
      data-slot="badge"
      data-variant={variant}
      title={title}
      style={{
        display: 'inline-flex',
        width: 'fit-content',
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--spacing-1)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        padding: '2px var(--spacing-2)',
        borderRadius: 'var(--radius-full)',
        borderWidth: 1,
        borderStyle: 'solid',
        font: mono ? 'var(--type-data-sm)' : 'var(--type-ui-sm)',
        letterSpacing: mono ? 'var(--tracking-label)' : 'var(--tracking-normal)',
        textTransform: mono ? 'uppercase' : 'none',
        fontVariantNumeric: 'tabular-nums',
        transition: 'var(--transition-control)',
        ...css,
        ...style,
      }}
    >
      {dot ? (
        <span
          style={{
            width: 6,
            height: 6,
            flex: '0 0 auto',
            borderRadius: 'var(--radius-full)',
            background: 'currentColor',
            animation: blink ? 'bh-blink 1s steps(1) infinite' : undefined,
          }}
        />
      ) : null}
      {children}
      {count != null ? <span style={{ opacity: 0.7 }}>{count}</span> : null}
    </span>
  );
};
