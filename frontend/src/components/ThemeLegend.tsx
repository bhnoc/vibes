import React from 'react';
import { useThemeStore, THEMES, Theme } from '../stores/themeStore';
import { Button, FloatingPanel } from './noc/kit';

/**
 * Map legend.
 *
 * The canvas encodes protocol as hue, and this is where that mapping is stated
 * and, if a show needs it, changed. Edits are session-scoped by the theme store,
 * so an operator can tune a hue for a projector without it following them to the
 * next show.
 */

export interface ThemeLegendProps {
  isOpen?: boolean;
  onMinimize?: () => void;
}

const ROWS: { field: keyof Theme; label: string }[] = [
  { field: 'edgeTcp', label: 'TCP' },
  { field: 'edgeUdp', label: 'UDP' },
  { field: 'edgeHttp', label: 'HTTP / TLS' },
  { field: 'edgeIcmp', label: 'ICMP' },
  { field: 'edgeDefault', label: 'Other' },
  { field: 'groupHalo', label: 'Group halo' },
];

export const ThemeLegend: React.FC<ThemeLegendProps> = ({ isOpen = true, onMinimize }) => {
  const { theme, updateThemeColor, resetThemeColors } = useThemeStore();
  const currentTheme = theme || THEMES['blackhat-noc'];

  return (
    <FloatingPanel
      open={isOpen}
      title="Legend"
      icon="Palette"
      onClose={onMinimize ?? (() => undefined)}
      initial={{ x: 76, y: typeof window !== 'undefined' ? Math.max(76, window.innerHeight - 340) : 400 }}
      width={258}
      actions={
        <Button size="xs" variant="ghost" onClick={resetThemeColors} title="Reset to the skin's defaults">
          Reset
        </Button>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--spacing-1-5)' }}>
        {ROWS.map(({ field, label }) => {
          const value = currentTheme[field] as string;
          return (
            <label
              key={field}
              title={`Change the ${label} hue for this session`}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 22px 68px', gap: 'var(--spacing-2)', alignItems: 'center', height: 22, cursor: 'pointer' }}
            >
              <span style={{ font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
                {label}
              </span>
              <input type="color" value={value} aria-label={`${label} colour`} onChange={(e) => updateThemeColor(field, e.target.value)} />
              <span style={{ font: 'var(--type-data-sm)', color: value, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </label>
          );
        })}
      </div>

      <p style={{ margin: 'var(--spacing-3) 0 0', font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>
        Changes apply to this session only and are cleared when the tab closes.
      </p>
    </FloatingPanel>
  );
};
