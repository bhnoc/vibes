import { describe, it, expect } from 'vitest';
import {
  calculateRelativeNodeRadius,
  calculateRelativeEdgeWidth,
  calculateNodeSize,
  formatIP,
  getProtocolColor,
  formatDataSize,
  NODE_RADIUS_MIN,
  NODE_RADIUS_MAX,
  EDGE_WIDTH_MIN,
  EDGE_WIDTH_MAX,
} from './messageUtils';

describe('messageUtils - Node and Edge Sizing Capabilities', () => {
  describe('calculateRelativeNodeRadius', () => {
    it('returns NODE_RADIUS_MIN when intensity is 0', () => {
      expect(calculateRelativeNodeRadius(10, 50, 0)).toBe(NODE_RADIUS_MIN);
    });

    it('grows ball size with connection count share', () => {
      const radiusHalf = calculateRelativeNodeRadius(25, 100, 1);
      const radiusFull = calculateRelativeNodeRadius(100, 100, 1);
      expect(radiusFull).toBe(NODE_RADIUS_MAX);
      expect(radiusHalf).toBeGreaterThan(NODE_RADIUS_MIN);
      expect(radiusHalf).toBeLessThan(NODE_RADIUS_MAX);
    });

    it('supports legacy relativeLoad signature', () => {
      const radius = calculateRelativeNodeRadius(0.25, 10, 30);
      expect(radius).toBe(20); // 10 + 20 * sqrt(0.25)
    });

    it('handles zero and negative connection counts gracefully', () => {
      expect(calculateRelativeNodeRadius(0, 100, 1)).toBe(NODE_RADIUS_MIN);
      expect(calculateRelativeNodeRadius(-5, 100, 1)).toBe(NODE_RADIUS_MIN);
    });
  });

  describe('calculateRelativeEdgeWidth', () => {
    it('returns EDGE_WIDTH_MIN when intensity is 0', () => {
      expect(calculateRelativeEdgeWidth(500, 1000, 0)).toBe(EDGE_WIDTH_MIN);
    });

    it('scales stroke width by relative throughput', () => {
      const widthMax = calculateRelativeEdgeWidth(1000, 1000, 1);
      const widthMid = calculateRelativeEdgeWidth(250, 1000, 1);
      expect(widthMax).toBe(EDGE_WIDTH_MAX);
      expect(widthMid).toBeGreaterThan(EDGE_WIDTH_MIN);
      expect(widthMid).toBeLessThan(EDGE_WIDTH_MAX);
    });

    it('supports legacy relativeWeight signature', () => {
      const w = calculateRelativeEdgeWidth(1.0, 2, 10);
      expect(w).toBe(10);
    });
  });

  describe('calculateNodeSize legacy helper', () => {
    it('applies logarithmic scale to traffic volume', () => {
      expect(calculateNodeSize(100)).toBe(NODE_RADIUS_MIN + 10);
      expect(calculateNodeSize(0)).toBe(NODE_RADIUS_MIN);
    });
  });

  describe('formatting utilities', () => {
    it('formats protocol colors correctly', () => {
      expect(getProtocolColor('TCP')).toBe(0x00ff41);
      expect(getProtocolColor('UDP')).toBe(0xff0000);
      expect(getProtocolColor('ICMP')).toBe(0x10f0f0);
    });

    it('formats data size correctly across units', () => {
      expect(formatDataSize(500)).toBe('500 B');
      expect(formatDataSize(2048)).toBe('2.0 KB');
      expect(formatDataSize(5 * 1024 * 1024)).toBe('5.0 MB');
      expect(formatDataSize(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
      expect(formatDataSize(2 * 1024 * 1024 * 1024 * 1024)).toBe('2.0 TB');
    });
  });

  describe('sizing calculation edge cases', () => {
    it('handles maxConns === 0 without divide-by-zero or NaN', () => {
      expect(calculateRelativeNodeRadius(10, 0, 1)).toBe(NODE_RADIUS_MIN);
      expect(calculateRelativeNodeRadius(10, -5, 1)).toBe(NODE_RADIUS_MIN);
    });

    it('handles maxThroughput === 0 without divide-by-zero or NaN', () => {
      expect(calculateRelativeEdgeWidth(500, 0, 1)).toBe(EDGE_WIDTH_MIN);
      expect(calculateRelativeEdgeWidth(-100, 100, 1)).toBe(EDGE_WIDTH_MIN);
    });
  });
});

