import React from 'react';
import { Icon, IconName } from './Icon';

/**
 * The remaining shadcn controls the console needs: sidebar nav rows, tabs,
 * switches, inputs and tooltips. Geometry is the registry's; the severity-toned
 * count on NavItem and the leading icon on Input are the NOC's additions.
 */

/* -------------------------------------------------------------------------- */

export interface NavItemProps {
  icon?: IconName;
  label: string;
  count?: number | string;
  tone?: 'critical' | 'warn' | 'ok' | 'neutral';
  active?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

const COUNT_HUES = {
  critical: 'var(--signal-red)',
  warn: 'var(--signal-amber)',
  ok: 'var(--signal-teal)',
  neutral: 'var(--muted-foreground)',
};

export const NavItem: React.FC<NavItemProps> = ({ icon, label, count, tone = 'neutral', active, collapsed, onClick, style }) => {
  const [hover, setHover] = React.useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 'var(--spacing-2)',
        justifyContent: collapsed ? 'center' : 'flex-start',
        width: collapsed ? 32 : '100%',
        height: 32,
        padding: collapsed ? 0 : '0 var(--spacing-2)',
        cursor: 'pointer',
        borderRadius: 'var(--radius-md)',
        color: active || hover ? 'var(--sidebar-accent-foreground)' : 'var(--muted-foreground)',
        background: active ? 'var(--sidebar-accent)' : hover ? 'color-mix(in oklab,var(--sidebar-accent) 60%,transparent)' : 'transparent',
        font: 'var(--type-ui)',
        transition: 'var(--transition-control)',
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {collapsed ? null : <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
      {!collapsed && count != null ? (
        <span style={{ font: 'var(--type-data-sm)', color: COUNT_HUES[tone], fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      ) : null}
    </button>
  );
};

/* -------------------------------------------------------------------------- */

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  variant?: 'default' | 'line';
  style?: React.CSSProperties;
}

/** One roving tab stop; Left/Right move, Home/End jump to the ends. */
export const Tabs: React.FC<TabsProps> = ({ items, value, onChange, variant = 'default', style }) => {
  const line = variant === 'line';

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
    if (!tabs.length) return;
    const current = tabs.indexOf((e.target as HTMLElement).closest('[role="tab"]') as HTMLButtonElement);
    if (current < 0) return;
    e.preventDefault();
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    tabs[next].click();
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      style={{
        display: 'inline-flex',
        width: 'fit-content',
        alignItems: 'center',
        height: 'var(--control-h)',
        padding: line ? 0 : 3,
        gap: line ? 'var(--spacing-1)' : 0,
        background: line ? 'transparent' : 'var(--muted)',
        borderRadius: line ? 0 : 'var(--radius-lg)',
        color: 'var(--muted-foreground)',
        ...style,
      }}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.value)}
            style={{
              all: 'unset',
              boxSizing: 'border-box',
              position: 'relative',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--spacing-1-5)',
              height: line ? '100%' : 'calc(100% - 1px)',
              padding: '0 var(--spacing-3)',
              borderRadius: line ? 0 : 'var(--radius-md)',
              borderWidth: line ? '0 0 2px' : 1,
              borderStyle: 'solid',
              // Underline tabs mark the selection on the bottom edge only; pill
              // tabs ring the whole control. Longhand throughout, so a selection
              // change never mixes shorthand and longhand on the same element.
              borderColor: line
                ? `transparent transparent ${active ? 'var(--foreground)' : 'transparent'}`
                : active
                  ? 'var(--input)'
                  : 'transparent',
              font: 'var(--type-ui)',
              whiteSpace: 'nowrap',
              color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
              background: !line && active ? 'color-mix(in oklab,var(--input) 30%,transparent)' : 'transparent',
              transition: 'var(--transition-control)',
            }}
          >
            {it.label}
            {it.count != null ? (
              <span style={{ font: 'var(--type-data-sm)', color: active ? 'var(--signal-teal)' : 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
                {it.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------------------- */

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  /** Secondary line under the label, for stating what the toggle actually does. */
  hint?: string;
  ariaLabel?: string;
  disabled?: boolean;
  size?: 'sm' | 'default';
  style?: React.CSSProperties;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, hint, ariaLabel, disabled, size = 'default', style }) => {
  const [focus, setFocus] = React.useState(false);
  const w = size === 'sm' ? 24 : 32;
  const h = size === 'sm' ? 14 : 18.4;
  const k = size === 'sm' ? 12 : 16;

  return (
    <label
      style={{
        display: 'inline-flex',
        // With a hint the label block is two lines tall, so the track sits on the
        // first line rather than floating in the middle of the pair.
        alignItems: hint ? 'flex-start' : 'center',
        gap: 'var(--spacing-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel || label}
        onChange={(e) => onChange(e.target.checked)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <span
        data-state={checked ? 'checked' : 'unchecked'}
        style={{
          width: w,
          height: h,
          flex: '0 0 auto',
          borderRadius: 'var(--radius-full)',
          position: 'relative',
          background: checked ? 'var(--primary)' : 'color-mix(in oklab,var(--input) 80%,transparent)',
          border: '1px solid transparent',
          boxShadow: focus ? 'var(--focus-ring)' : 'var(--shadow-xs)',
          transition: 'var(--transition-control)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: (h - k) / 2 - 1,
            left: 1,
            width: k,
            height: k,
            borderRadius: 'var(--radius-full)',
            background: checked ? 'var(--primary-foreground)' : 'var(--foreground)',
            transform: checked ? `translateX(${w - k - 2}px)` : 'translateX(0)',
            transition: 'transform var(--duration-fast) var(--ease-out)',
          }}
        />
      </span>
      {label ? (
        <span style={{ display: 'grid', gap: 'var(--spacing-0-5)' }}>
          <span style={{ font: 'var(--type-ui)', color: 'var(--foreground)' }}>{label}</span>
          {hint ? <span style={{ font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>{hint}</span> : null}
        </span>
      ) : null}
    </label>
  );
};

/* -------------------------------------------------------------------------- */

export interface InputProps {
  value?: string;
  placeholder?: string;
  label?: string;
  hint?: string;
  error?: string;
  icon?: IconName;
  suffix?: React.ReactNode;
  mono?: boolean;
  size?: 'sm' | 'default' | 'lg';
  disabled?: boolean;
  ariaLabel?: string;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  style?: React.CSSProperties;
}

export const Input: React.FC<InputProps> = ({
  value,
  placeholder,
  label,
  hint,
  error,
  icon,
  suffix,
  mono,
  size = 'default',
  disabled,
  ariaLabel,
  onChange,
  onKeyDown,
  style,
}) => {
  const [focus, setFocus] = React.useState(false);
  const h = size === 'sm' ? 'var(--control-h-sm)' : size === 'lg' ? 'var(--control-h-lg)' : 'var(--control-h)';
  const border = error ? 'var(--destructive)' : focus ? 'var(--ring)' : 'var(--input)';
  const id = React.useId();

  return (
    <div style={{ width: '100%', ...style }}>
      {label ? (
        <label
          htmlFor={id}
          style={{
            display: 'block',
            font: 'var(--type-label)',
            letterSpacing: 'var(--tracking-label)',
            textTransform: 'uppercase',
            color: 'var(--muted-foreground)',
            marginBottom: 'var(--spacing-1-5)',
          }}
        >
          {label}
        </label>
      ) : null}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-2)',
          height: h,
          padding: '0 var(--spacing-3)',
          background: 'color-mix(in oklab,var(--input) 30%,transparent)',
          border: `1px solid ${border}`,
          borderRadius: 'var(--radius-md)',
          boxShadow: focus ? 'var(--focus-ring)' : 'var(--shadow-xs)',
          opacity: disabled ? 0.5 : 1,
          transition: 'var(--transition-control)',
        }}
      >
        {icon ? <Icon name={icon} size={16} style={{ color: 'var(--muted-foreground)' }} /> : null}
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel || label}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            all: 'unset',
            flex: 1,
            minWidth: 0,
            color: 'var(--foreground)',
            font: mono ? 'var(--type-data)' : size === 'sm' ? 'var(--type-ui-sm)' : 'var(--font-weight-normal) var(--text-sm)/1 var(--font-sans)',
            fontVariantNumeric: mono ? 'tabular-nums' : undefined,
          }}
        />
        {suffix ? <span style={{ font: 'var(--type-data-sm)', color: 'var(--muted-foreground)' }}>{suffix}</span> : null}
      </div>
      {hint || error ? (
        <div style={{ font: 'var(--type-data-sm)', color: error ? 'var(--destructive)' : 'var(--muted-foreground)', marginTop: 'var(--spacing-1-5)' }}>
          {error || hint}
        </div>
      ) : null}
    </div>
  );
};

/* -------------------------------------------------------------------------- */

export const Tooltip: React.FC<{ children: React.ReactNode; label: string; side?: 'top' | 'bottom' | 'left' | 'right'; mono?: boolean; style?: React.CSSProperties }> = ({
  children,
  label,
  side = 'top',
  mono,
  style,
}) => {
  const [open, setOpen] = React.useState(false);

  const pos: Record<string, React.CSSProperties> = {
    top: { bottom: '100%', left: '50%', transform: 'translate(-50%,-4px)' },
    bottom: { top: '100%', left: '50%', transform: 'translate(-50%,4px)' },
    left: { right: '100%', top: '50%', transform: 'translate(-4px,-50%)' },
    right: { left: '100%', top: '50%', transform: 'translate(4px,-50%)' },
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', ...style }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <span
        role="tooltip"
        style={{
          position: 'absolute',
          ...pos[side],
          zIndex: 2000,
          pointerEvents: 'none',
          width: 'fit-content',
          opacity: open ? 1 : 0,
          transition: 'opacity var(--duration-fast) var(--ease-out)',
          background: 'var(--foreground)',
          color: 'var(--background)',
          borderRadius: 'var(--radius-md)',
          padding: '6px var(--spacing-3)',
          whiteSpace: 'nowrap',
          font: mono ? 'var(--type-data-sm)' : 'var(--type-ui-sm)',
        }}
      >
        {label}
      </span>
    </span>
  );
};
