import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// A theme defines the whole visual identity: UI chrome (driven into CSS
// variables) and the canvas palette (node hues + edge protocol colors read
// per-frame by the renderer/layout). Node fill draws a per-subnet hue from
// the theme's hue band so blobs read as groups; brightness rises with traffic.
export interface Theme {
  key: string;
  label: string;
  // ── UI chrome (mapped to CSS custom properties on :root) ──
  primary: string;        // main accent (borders, text, glow)
  primaryRgb: string;     // "r, g, b" for rgba() usage
  background: string;     // page background
  // ── Canvas node palette ──
  nodeHueMin: number;     // subnet hue band, degrees
  nodeHueMax: number;
  nodeSat: number;        // 0-100
  nodeLightMin: number;   // quiet talkers (dim)
  nodeLightMax: number;   // heavy talkers (bright)
  // ── Canvas edge palette (protocol → hex) ──
  edgeTcp: string;
  edgeUdp: string;
  edgeIcmp: string;
  edgeHttp: string;
  edgeDefault: string;
  // ── Accents reserved to pop against the field ──
  groupHalo: string;      // promoted long-lived conversation groups
  labelColor: string;
}

const classic: Theme = {
  key: 'classic',
  label: 'Classic Green',
  primary: '#00ff00',
  primaryRgb: '0, 255, 0',
  background: '#000000',
  nodeHueMin: 90,
  nodeHueMax: 160,
  nodeSat: 85,
  nodeLightMin: 42,
  nodeLightMax: 62,
  edgeTcp: '#00ff00',
  edgeUdp: '#ff00ff',
  edgeIcmp: '#ffff00',
  edgeHttp: '#ffa500',
  edgeDefault: '#00ffff',
  groupHalo: '#ffaa00',
  labelColor: '#00ffcc',
}

const retroBlue: Theme = {
  key: 'retro-blue',
  label: 'Retro Blue',
  primary: '#33ccff',
  primaryRgb: '51, 204, 255',
  background: '#04101f',       // deep navy
  // subnet hues live in the cyan → blue → violet band so blobs read as groups
  nodeHueMin: 185,
  nodeHueMax: 265,
  nodeSat: 88,
  nodeLightMin: 45,
  nodeLightMax: 68,
  // edges keep protocol meaning but shift into the blue field's complement set;
  // amber/magenta stay as high-contrast accents that pop against navy
  edgeTcp: '#38bdf8',
  edgeUdp: '#c084fc',
  edgeIcmp: '#fbbf24',
  edgeHttp: '#f472b6',
  edgeDefault: '#22d3ee',
  groupHalo: '#fbbf24',
  labelColor: '#7dd3fc',
}

const blackhatNoc: Theme = {
  key: 'blackhat-noc',
  label: 'Black Hat NOC',
  primary: '#00d2aa',
  primaryRgb: '0, 210, 170',
  background: '#0e0e0e',
  nodeHueMin: 160,
  nodeHueMax: 200,
  nodeSat: 85,
  nodeLightMin: 45,
  nodeLightMax: 65,
  edgeTcp: '#00d2aa',
  edgeUdp: '#a855f7',
  edgeIcmp: '#ef4444',
  edgeHttp: '#f59e0b',
  edgeDefault: '#00b4d8',
  groupHalo: '#f59e0b',
  labelColor: '#00d2aa',
}

export const THEMES: Record<string, Theme> = {
  'blackhat-noc': blackhatNoc,
  'retro-blue': retroBlue,
  classic,
}

// Stable hash so a given subnet key always maps to the same hue.
function hashStr(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// Node fill: a per-subnet hue drawn from the theme's band, with lightness
// scaled by `bright` (0 = quiet talker, 1 = heavy talker). Same subnet ⇒ same
// hue in every theme, so blobs read as coherent groups.
export function subnetNodeColor(clusterKey: string, bright: number, theme: Theme): string {
  const span = theme.nodeHueMax - theme.nodeHueMin;
  const hue = theme.nodeHueMin + (hashStr(clusterKey) % 1000) / 1000 * span;
  const light = theme.nodeLightMin + (theme.nodeLightMax - theme.nodeLightMin) * Math.max(0, Math.min(1, bright));
  return `hsl(${hue.toFixed(0)}, ${theme.nodeSat}%, ${light.toFixed(0)}%)`;
}

// Edge stroke color for a protocol, as an rgba() string at the given alpha.
export function edgeColor(protocol: string | undefined, alpha: number, theme: Theme): string {
  const hex = ((): string => {
    switch (protocol?.toLowerCase()) {
      case 'tcp': return theme.edgeTcp;
      case 'udp': return theme.edgeUdp;
      case 'icmp': return theme.edgeIcmp;
      case 'http':
      case 'https': return theme.edgeHttp;
      default: return theme.edgeDefault;
    }
  })();
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface ThemeState {
  themeKey: string;
  theme: Theme;
  setTheme: (key: string) => void;
}

const THEME_VERSION = 1;

// Push the active theme's chrome colors into CSS custom properties so the
// hardcoded-green UI (index.css) recolors without per-element JS.
export function applyThemeVars(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--vibes-primary', theme.primary);
  root.style.setProperty('--vibes-primary-rgb', theme.primaryRgb);
  root.style.setProperty('--vibes-bg', theme.background);
  root.style.setProperty('--vibes-label', theme.labelColor);
  // legacy variable names referenced by index.css scrollbar rules
  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--color-bg', theme.background);
  root.style.setProperty('--color-secondary', theme.edgeDefault);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeKey: 'retro-blue',
      theme: retroBlue,
      setTheme: (key: string) => {
        const theme = THEMES[key] ?? retroBlue;
        applyThemeVars(theme);
        set({ themeKey: theme.key, theme });
      },
    }),
    {
      name: 'vibes-theme-storage',
      version: THEME_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: () => ({ themeKey: 'retro-blue', theme: retroBlue } as ThemeState),
      onRehydrateStorage: () => (state) => {
        // Rebuild the theme object from its key (defends against a persisted
        // null/stale theme) and apply CSS vars as soon as it loads.
        if (state) {
          const theme = THEMES[state.themeKey] ?? retroBlue;
          state.theme = theme;
          state.themeKey = theme.key;
          applyThemeVars(theme);
        }
      },
    }
  )
)

// Apply immediately on module load so first paint is themed (avoids a
// green flash before React mounts).
applyThemeVars(useThemeStore.getState().theme)
