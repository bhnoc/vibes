import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, IconName } from './Icon';
import { IconButton } from './Button';

/**
 * Floating panels.
 *
 * The console keeps its utility surfaces — settings, theme legend, diagnostics,
 * the load generator — above the live capture rather than stealing layout from
 * it, so each one is a draggable card the operator can park wherever the map is
 * quiet. Three of them had grown their own copy of the same drag maths and their
 * own hand-rolled header; this is that logic stated once.
 *
 * Dragging is deliberately pointer-events based rather than mouse-only, and the
 * panel is clamped so a drag can never post it off-screen where it cannot be
 * recovered without clearing storage.
 */

export interface Point {
  x: number;
  y: number;
}

/** Keeps a panel fully reachable: never past the right/bottom edge, never above the top bar. */
function clamp(p: Point, el: HTMLElement | null): Point {
  const w = el?.offsetWidth ?? 320;
  const h = el?.offsetHeight ?? 120;
  const minY = 0;
  // A panel taller than the viewport still needs its header grabbable, so the
  // bottom clamp keeps a header's worth of panel on screen rather than all of it.
  const maxY = Math.max(minY, window.innerHeight - Math.min(h, 56));
  const maxX = Math.max(0, window.innerWidth - Math.min(w, 160));
  return {
    x: Math.min(Math.max(0, p.x), maxX),
    y: Math.min(Math.max(minY, p.y), maxY),
  };
}

export function useDraggable(initial: Point) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<Point>(initial);
  const origin = useRef({ pointer: { x: 0, y: 0 }, panel: { x: 0, y: 0 }, id: -1 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Anything interactive inside the header keeps its own click.
      if ((e.target as HTMLElement).closest('button, input, select, a')) return;
      origin.current = { pointer: { x: e.clientX, y: e.clientY }, panel: position, id: e.pointerId };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [position],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (origin.current.id !== e.pointerId) return;
    const { pointer, panel } = origin.current;
    setPosition(clamp({ x: panel.x + (e.clientX - pointer.x), y: panel.y + (e.clientY - pointer.y) }, ref.current));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (origin.current.id !== e.pointerId) return;
    origin.current.id = -1;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // A window that shrinks below a parked panel would otherwise strand it.
  useEffect(() => {
    const onResize = () => setPosition((p) => clamp(p, ref.current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return {
    ref,
    position,
    setPosition,
    /** Spread onto whatever element should be the drag handle. */
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}

export interface FloatingPanelProps {
  open: boolean;
  title: string;
  icon: IconName;
  onClose: () => void;
  initial?: Point;
  width?: number | string;
  /** Rendered in the header between the title and the close button. */
  actions?: React.ReactNode;
  /** Caps the body and lets it scroll; the header stays pinned. */
  maxBodyHeight?: string;
  /** Set false when the body owns its own padding, as tab strips do. */
  padded?: boolean;
  children: React.ReactNode;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  open,
  title,
  icon,
  onClose,
  initial = { x: 96, y: 76 },
  width = 380,
  actions,
  maxBodyHeight = '70vh',
  padded = true,
  children,
}) => {
  const { ref, position, handleProps } = useDraggable(initial);

  // Escape closes whichever panel the operator is pointing at, matching the
  // dismissal contract the palette and dialogs already use.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="noc-floating"
      role="dialog"
      aria-label={title}
      data-animate
      style={{ top: position.y, left: position.x, width }}
      // The capture canvas pans on drag and zooms on wheel. Without this a
      // gesture that starts in a panel also moves the map underneath it.
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <header className="noc-floating__bar" {...handleProps}>
        <Icon name={icon} size={14} style={{ color: 'var(--muted-foreground)' }} />
        <span className="noc-floating__title">{title}</span>
        <div className="noc-floating__actions">
          {actions}
          <IconButton icon="X" label={`Close ${title.toLowerCase()}`} size="sm" onClick={onClose} />
        </div>
      </header>
      <div
        className="noc-floating__body"
        style={{ maxHeight: maxBodyHeight, padding: padded ? 'var(--spacing-4)' : 0 }}
      >
        {children}
      </div>
    </div>
  );
};
