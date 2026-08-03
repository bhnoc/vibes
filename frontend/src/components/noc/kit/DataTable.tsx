import React from 'react';

/**
 * shadcn/ui Table primitives plus the NOC's column-config wrapper.
 *
 * The 3px left edge in the severity hue is the one accent-edge pattern the
 * system allows, and it belongs to tabular rows only — never to a card or chip.
 *
 * Rows that open something are keyboard-operable: Tab reaches the row, Enter or
 * Space opens it, and each row carries a specific accessible name. Colour never
 * carries severity on its own; the badge in the cell says the word.
 */

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'ok';

const EDGE_HUES: Record<SeverityLevel, string> = {
  critical: 'var(--status-critical)',
  high: 'var(--status-high)',
  medium: 'var(--status-medium)',
  low: 'var(--status-low)',
  info: 'var(--status-idle)',
  ok: 'var(--status-ok)',
};

export interface Column<Row> {
  key: string;
  label: string;
  width?: string;
  mono?: boolean;
  align?: 'left' | 'right';
  tone?: 'hi' | 'muted' | 'faint';
  render?: (row: Row) => React.ReactNode;
  /** Dropped below 1200px, where the shell switches to its compact contract. */
  compactHidden?: boolean;
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowId?: keyof Row | string;
  /** Field holding the row's severity. Drives the 3px left edge. */
  severityKey?: string;
  selectedId?: string | number | null;
  rowLabel?: (row: Row, index: number) => string;
  onRowClick?: (row: Row) => void;
  dense?: boolean;
  /** States the fact, then the reason. No mascots. */
  empty?: React.ReactNode;
  maxHeight?: number | string;
  style?: React.CSSProperties;
}

const CELL_TONES: Record<string, string> = {
  hi: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  faint: 'var(--text-faint)',
};

function Row<T>({
  row,
  index,
  id,
  columns,
  severity,
  selected,
  label,
  dense,
  onRowClick,
}: {
  row: T;
  index: number;
  id: string | number;
  columns: Column<T>[];
  severity?: SeverityLevel;
  selected: boolean;
  label: string;
  dense: boolean;
  onRowClick?: (row: T) => void;
}) {
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const edge = severity ? EDGE_HUES[severity] : undefined;

  return (
    <tr
      data-state={selected ? 'selected' : undefined}
      onClick={onRowClick ? () => onRowClick(row) : undefined}
      onKeyDown={
        onRowClick
          ? (e) => {
              if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
              e.preventDefault();
              onRowClick(row);
            }
          : undefined
      }
      tabIndex={onRowClick ? 0 : undefined}
      aria-label={onRowClick ? label : undefined}
      aria-selected={onRowClick ? selected : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={(e) => {
        if (e.target === e.currentTarget) setFocus(true);
      }}
      onBlur={(e) => {
        if (e.target === e.currentTarget) setFocus(false);
      }}
      style={{
        height: dense ? 'var(--row-h)' : 'var(--row-h-comfy)',
        borderBottom: '1px solid var(--border)',
        borderLeft: edge ? `var(--bw-accent) solid ${edge}` : undefined,
        background: selected ? 'var(--muted)' : hover ? 'color-mix(in oklab,var(--muted) 50%,transparent)' : 'transparent',
        boxShadow: focus
          ? 'inset 0 0 0 2px var(--ring)'
          : selected
            ? 'inset 0 0 0 1px color-mix(in oklab,var(--ring) 35%,transparent)'
            : 'none',
        cursor: onRowClick ? 'pointer' : 'default',
        transition: 'var(--transition-surface)',
        outline: 'none',
      }}
    >
      {columns.map((c) => (
        <td
          key={c.key}
          data-compact-hidden={c.compactHidden ? 'true' : undefined}
          style={{
            padding: 'var(--spacing-2)',
            verticalAlign: 'middle',
            whiteSpace: 'nowrap',
            textAlign: c.align || 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: c.width,
            font: c.mono ? 'var(--type-data-sm)' : 'var(--type-ui)',
            fontVariantNumeric: c.mono ? 'tabular-nums' : undefined,
            color: c.tone ? CELL_TONES[c.tone] : 'var(--text-body)',
          }}
        >
          {c.render ? c.render(row) : ((row as Record<string, unknown>)[c.key] as React.ReactNode)}
        </td>
      ))}
    </tr>
  );
}

export function DataTable<Row extends Record<string, any>>({
  columns,
  rows,
  rowId = 'id',
  severityKey,
  selectedId,
  rowLabel,
  onRowClick,
  dense = true,
  empty = 'No rows in this window.',
  maxHeight,
  style,
}: DataTableProps<Row>) {
  return (
    <div style={{ minWidth: 0, maxHeight, overflow: maxHeight ? 'auto' : undefined, ...style }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', font: 'var(--type-body)' }}>
        <thead style={maxHeight ? { position: 'sticky', top: 0, zIndex: 1, background: 'var(--card)' } : undefined}>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                data-compact-hidden={c.compactHidden ? 'true' : undefined}
                style={{
                  width: c.width,
                  height: dense ? 32 : 40,
                  padding: 'var(--spacing-2)',
                  textAlign: c.align || 'left',
                  verticalAlign: 'middle',
                  whiteSpace: 'nowrap',
                  font: 'var(--font-weight-semibold) var(--text-xs)/1.1 var(--font-mono)',
                  letterSpacing: 'var(--tracking-label)',
                  textTransform: 'uppercase',
                  color: 'var(--muted-foreground)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: 'var(--spacing-8) var(--spacing-2)',
                  whiteSpace: 'normal',
                  font: 'var(--type-body)',
                  color: 'var(--muted-foreground)',
                  textAlign: 'center',
                }}
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => {
              const id = (r[rowId as string] ?? i) as string | number;
              return (
                <Row
                  key={id}
                  row={r}
                  index={i}
                  id={id}
                  columns={columns}
                  severity={severityKey ? (r[severityKey] as SeverityLevel) : undefined}
                  selected={selectedId != null && selectedId === id}
                  label={rowLabel ? rowLabel(r, i) : String(id)}
                  dense={dense}
                  onRowClick={onRowClick}
                />
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
