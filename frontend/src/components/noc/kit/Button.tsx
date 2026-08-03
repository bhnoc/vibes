import React from 'react';
import { Icon, IconName } from './Icon';

/**
 * shadcn/ui button, new-york style. Sizes and variants match the registry 1:1;
 * `signal` is the NOC addition used for affirmative operator actions.
 *
 * Press is a dim to 85%, never a scale: an instrument does not squish.
 */

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'signal';
type ButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg';

const SIZES: Record<ButtonSize, { height: string; width?: string; padding: string; font: string; icon: number; gap: string }> = {
  default: { height: 'var(--control-h)', padding: '0 var(--spacing-4)', font: 'var(--type-ui)', icon: 16, gap: 'var(--spacing-2)' },
  xs: { height: 'var(--control-h-xs)', padding: '0 var(--spacing-2)', font: 'var(--type-ui-sm)', icon: 12, gap: 'var(--spacing-1)' },
  sm: { height: 'var(--control-h-sm)', padding: '0 var(--spacing-3)', font: 'var(--type-ui)', icon: 16, gap: 'var(--spacing-1-5)' },
  lg: { height: 'var(--control-h-lg)', padding: '0 var(--spacing-6)', font: 'var(--type-ui)', icon: 16, gap: 'var(--spacing-2)' },
  icon: { height: 'var(--control-h)', width: 'var(--control-h)', padding: '0', font: 'var(--type-ui)', icon: 16, gap: '0' },
  'icon-sm': { height: 'var(--control-h-sm)', width: 'var(--control-h-sm)', padding: '0', font: 'var(--type-ui)', icon: 16, gap: '0' },
  'icon-lg': { height: 'var(--control-h-lg)', width: 'var(--control-h-lg)', padding: '0', font: 'var(--type-ui)', icon: 18, gap: '0' },
};

/**
 * Every variant states `borderColor` and never the `border` shorthand. Hover and
 * active override the colour alone, and React warns when a shorthand and its
 * longhand both appear across renders of the same element. Width and style are
 * set once on the base style below.
 */
const VARIANTS: Record<ButtonVariant, { rest: React.CSSProperties; hover: React.CSSProperties }> = {
  default: {
    rest: { background: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'transparent' },
    hover: { background: 'color-mix(in oklab,var(--primary) 90%,transparent)' },
  },
  destructive: {
    rest: { background: 'var(--destructive)', color: 'var(--bh-white)', borderColor: 'transparent', boxShadow: 'var(--shadow-xs)' },
    hover: { background: 'color-mix(in oklab,var(--destructive) 88%,transparent)' },
  },
  outline: {
    rest: { background: 'color-mix(in oklab,var(--input) 30%,transparent)', color: 'var(--foreground)', borderColor: 'var(--input)', boxShadow: 'var(--shadow-xs)' },
    hover: { background: 'color-mix(in oklab,var(--input) 50%,transparent)', color: 'var(--accent-foreground)' },
  },
  secondary: {
    rest: { background: 'var(--secondary)', color: 'var(--secondary-foreground)', borderColor: 'transparent', boxShadow: 'var(--shadow-xs)' },
    hover: { background: 'color-mix(in oklab,var(--secondary) 80%,transparent)' },
  },
  ghost: {
    rest: { background: 'transparent', color: 'var(--muted-foreground)', borderColor: 'transparent' },
    hover: { background: 'color-mix(in oklab,var(--accent) 50%,transparent)', color: 'var(--accent-foreground)' },
  },
  link: {
    rest: { background: 'transparent', color: 'var(--primary)', borderColor: 'transparent' },
    hover: { textDecoration: 'underline' },
  },
  signal: {
    rest: { background: 'var(--wash-ok)', color: 'var(--signal-teal)', borderColor: 'color-mix(in oklab,var(--signal-teal) 35%,transparent)' },
    hover: { background: 'color-mix(in oklab,var(--signal-teal) 22%,transparent)', borderColor: 'var(--signal-teal)' },
  },
};

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  full?: boolean;
  active?: boolean;
  style?: React.CSSProperties;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'default',
  size = 'default',
  icon,
  iconRight,
  disabled,
  full,
  active,
  type = 'button',
  style,
  ...rest
}) => {
  const [hover, setHover] = React.useState(false);
  const [down, setDown] = React.useState(false);

  const s = SIZES[size];
  const v = VARIANTS[variant];

  return (
    <button
      type={type}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      aria-pressed={active}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setDown(false);
      }}
      onMouseDown={() => setDown(true)}
      onMouseUp={() => setDown(false)}
      style={{
        display: full ? 'flex' : 'inline-flex',
        width: full ? '100%' : s.width,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        height: s.height,
        padding: s.padding,
        font: s.font,
        letterSpacing: 'var(--tracking-tight)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: 'var(--radius-md)',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : down ? 0.85 : 1,
        transition: 'var(--transition-control)',
        outline: 'none',
        ...v.rest,
        ...(active ? { background: 'var(--wash-ok)', color: 'var(--signal-teal)', borderColor: 'color-mix(in oklab,var(--signal-teal) 35%,transparent)' } : null),
        ...(!disabled && hover ? v.hover : null),
        ...style,
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={s.icon} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={s.icon} /> : null}
    </button>
  );
};

export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'size' | 'children'> {
  icon: IconName;
  /** Mandatory: an icon-only control without a name is invisible to a screen reader. */
  label: string;
  size?: 'sm' | 'default' | 'lg';
}

export const IconButton: React.FC<IconButtonProps> = ({ icon, label, size = 'default', variant = 'ghost', ...rest }) => {
  const map = { sm: 'icon-sm', default: 'icon', lg: 'icon-lg' } as const;
  return <Button variant={variant} size={map[size]} icon={icon} aria-label={label} title={label} {...rest} />;
};
