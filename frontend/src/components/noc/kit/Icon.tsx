import React from 'react';
import {
  Activity,
  Bug,
  Check,
  Command,
  Download,
  Eraser,
  FlaskConical,
  Network,
  Palette,
  PanelLeft,
  PanelRight,
  Radar,
  Radio,
  RotateCcw,
  Search,
  Server,
  Settings,
  Siren,
  Terminal,
  Trash2,
  Waypoints,
  X,
} from 'lucide-react';

/**
 * Line icons.
 *
 * Registered explicitly rather than pulled from lucide's `icons` barrel. The
 * barrel is a single object referencing all ~1,500 glyphs, which defeats tree
 * shaking and puts the entire set in the bundle to draw the two dozen the
 * console actually uses. Adding an icon means adding it here, and `IconName`
 * makes the compiler point at any call site that asks for one that is missing.
 *
 * Every glyph inherits `currentColor` and takes its stroke weight from its size,
 * so a 14px icon in a chip reads at the same optical weight as a 24px icon in an
 * empty state.
 */
const REGISTRY = {
  Activity,
  Bug,
  Check,
  Command,
  Download,
  Eraser,
  FlaskConical,
  Network,
  Palette,
  PanelLeft,
  PanelRight,
  Radar,
  Radio,
  RotateCcw,
  Search,
  Server,
  Settings,
  Siren,
  Terminal,
  Trash2,
  Waypoints,
  X,
} as const;

export type IconName = keyof typeof REGISTRY;

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Supply this when the icon is the only thing carrying the meaning. */
  title?: string;
  style?: React.CSSProperties;
  className?: string;
}

export const Icon: React.FC<IconProps> = ({ name, size = 16, strokeWidth, title, style, className }) => {
  const Glyph = REGISTRY[name];
  if (!Glyph) return null;

  return (
    <Glyph
      className={className}
      width={size}
      height={size}
      strokeWidth={strokeWidth ?? (size <= 16 ? 1.75 : 1.5)}
      color="currentColor"
      aria-label={title}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : 'presentation'}
      style={{ display: 'block', flex: '0 0 auto', ...style }}
    />
  );
};
