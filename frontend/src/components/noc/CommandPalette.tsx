import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, IconName, Badge } from './kit';

/**
 * Command palette.
 *
 * A NOC console is a keyboard surface: the operator's hands are on the keys and
 * the mouse is across the desk. This is the one overlay that blurs what is
 * behind it, because the map underneath is still moving and the operator needs
 * to keep seeing it while they pick an action.
 */

export interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: IconName;
  group: string;
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      // The dialog owns focus the moment it opens, or the first keystroke is lost.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.hint ?? ''} ${c.group}`.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, results.length - 1)));
  }, [results.length]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => (i + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => (i - 1 + Math.max(1, results.length)) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = results[index];
      if (cmd) {
        cmd.run();
        onClose();
      }
    }
  };

  let lastGroup = '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'var(--surface-scrim)',
        display: 'grid',
        justifyItems: 'center',
        alignItems: 'start',
        paddingTop: '14vh',
        animation: 'bh-fade-in var(--duration-fast) var(--ease-out)',
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: 'min(620px, calc(100vw - 2rem))',
          background: 'var(--surface-overlay)',
          backdropFilter: 'var(--blur-overlay)',
          WebkitBackdropFilter: 'var(--blur-overlay)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', padding: '0 var(--spacing-4)', height: 52, borderBottom: '1px solid var(--line-hairline)' }}>
          <Icon name="Search" size={18} style={{ color: 'var(--muted-foreground)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command"
            aria-label="Search commands"
            style={{
              all: 'unset',
              flex: 1,
              minWidth: 0,
              color: 'var(--foreground)',
              font: 'var(--font-weight-normal) var(--text-base)/1 var(--font-sans)',
            }}
          />
          <Badge tone="neutral" mono>
            ESC
          </Badge>
        </div>

        <div style={{ maxHeight: 400, overflowY: 'auto', padding: 'var(--spacing-2)' }}>
          {results.length === 0 ? (
            <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', font: 'var(--type-body)', color: 'var(--muted-foreground)' }}>
              No command matches "{query}".
            </div>
          ) : (
            results.map((c, i) => {
              const showGroup = c.group !== lastGroup;
              lastGroup = c.group;
              const active = i === index;
              return (
                <React.Fragment key={c.id}>
                  {showGroup ? (
                    <div style={{ padding: 'var(--spacing-3) var(--spacing-2) var(--spacing-1-5)', font: 'var(--type-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
                      {c.group}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => {
                      c.run();
                      onClose();
                    }}
                    style={{
                      all: 'unset',
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--spacing-3)',
                      width: '100%',
                      height: 40,
                      padding: '0 var(--spacing-2)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      color: active ? 'var(--foreground)' : 'var(--text-body)',
                      background: active ? 'var(--muted)' : 'transparent',
                      transition: 'var(--transition-surface)',
                    }}
                  >
                    <Icon name={c.icon} size={16} style={{ color: active ? 'var(--signal-teal)' : 'var(--muted-foreground)' }} />
                    <span style={{ font: 'var(--type-ui)' }}>{c.label}</span>
                    {c.hint ? <span style={{ marginLeft: 'auto', font: 'var(--type-data-sm)', color: 'var(--text-faint)' }}>{c.hint}</span> : null}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
