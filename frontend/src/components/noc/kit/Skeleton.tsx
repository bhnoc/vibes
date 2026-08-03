import React from 'react';

/** shadcn/ui Skeleton: the accent surface, pulsing only while data is in flight. */
export const Skeleton: React.FC<{ width?: number | string; height?: number | string; radius?: string; style?: React.CSSProperties }> = ({
  width = '100%',
  height = 12,
  radius = 'var(--radius-md)',
  style,
}) => (
  <span
    aria-hidden="true"
    style={{
      display: 'block',
      width,
      height,
      borderRadius: radius,
      background: 'var(--accent)',
      animation: 'bh-pulse var(--duration-pulse) var(--ease-in-out) infinite',
      ...style,
    }}
  />
);

/** shadcn/ui Separator. A hairline, never a shadow. */
export const Separator: React.FC<{ vertical?: boolean; style?: React.CSSProperties }> = ({ vertical, style }) => (
  <span
    role="separator"
    aria-orientation={vertical ? 'vertical' : 'horizontal'}
    style={{
      display: 'block',
      flex: '0 0 auto',
      width: vertical ? 1 : '100%',
      height: vertical ? '100%' : 1,
      background: 'var(--line-soft)',
      ...style,
    }}
  />
);
