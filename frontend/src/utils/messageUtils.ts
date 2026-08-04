/**
 * Formats IP address with proper spacing and coloring for display
 */
export const formatIP = (ip: string): string => {
  return ip.replace(/\./g, '<span class="text-purple-400">.</span>')
}

/**
 * Returns a color hex value for a protocol
 */
export const getProtocolColor = (protocol: string): number => {
  switch (protocol.toUpperCase()) {
    case 'TCP':
      return 0x00ff41 // Green
    case 'UDP':
      return 0xff0000 // Red
    case 'ICMP':
      return 0x10f0f0 // Blue
    default:
      return 0xffffff // White
  }
}

/**
 * Formats a data size into human readable format
 */
export const formatDataSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}

/** Visual node radius range in world units (Canvas layout). */
export const NODE_RADIUS_MIN = 6;
export const NODE_RADIUS_MAX = 26;

/** Stroke width range for connections (throughput driven). */
export const EDGE_WIDTH_MIN = 1;
export const EDGE_WIDTH_MAX = 9;

/**
 * Calculates a node size based on traffic volume.
 * Uses logarithmic scale to prevent huge nodes.
 */
export const calculateNodeSize = (trafficVolume: number): number => {
  const minSize = NODE_RADIUS_MIN;
  const maxSize = NODE_RADIUS_MAX;

  if (trafficVolume <= 0) {
    return minSize;
  }

  const size = minSize + (Math.log10(trafficVolume) * 5);
  return Math.min(size, maxSize);
};

/**
 * Node radius relative to the busiest visible peer (live connection count or relative load).
 * Supports both signatures:
 * - calculateRelativeNodeRadius(connectionCount, maxConnectionCount, intensity)
 * - calculateRelativeNodeRadius(relativeLoad, minRadius, maxRadius)
 */
export const calculateRelativeNodeRadius = (
  val: number,
  maxValOrMinRadius: number = NODE_RADIUS_MIN,
  intensityOrMaxRadius: number = NODE_RADIUS_MAX,
): number => {
  if (intensityOrMaxRadius <= 1) {
    const intensity = Math.max(0, Math.min(1, intensityOrMaxRadius));
    if (intensity <= 0 || val <= 0 || maxValOrMinRadius <= 0) return NODE_RADIUS_MIN;
    const t = Math.sqrt(Math.min(1, val / maxValOrMinRadius));
    const span = (NODE_RADIUS_MAX - NODE_RADIUS_MIN) * intensity;
    return NODE_RADIUS_MIN + t * span;
  }
  const minRadius = maxValOrMinRadius;
  const maxRadius = intensityOrMaxRadius;
  const t = Math.max(0, Math.min(1, val));
  return minRadius + (maxRadius - minRadius) * Math.sqrt(t);
};

/**
 * Edge stroke width relative to the heaviest visible flow (byte throughput or relative weight).
 * Supports both signatures:
 * - calculateRelativeEdgeWidth(throughput, maxThroughput, intensity)
 * - calculateRelativeEdgeWidth(relativeWeight, minWidth, maxWidth)
 */
export const calculateRelativeEdgeWidth = (
  val: number,
  maxValOrMinWidth: number = EDGE_WIDTH_MIN,
  intensityOrMaxWidth: number = EDGE_WIDTH_MAX,
): number => {
  if (intensityOrMaxWidth <= 1) {
    const intensity = Math.max(0, Math.min(1, intensityOrMaxWidth));
    if (intensity <= 0 || val <= 0 || maxValOrMinWidth <= 0) return EDGE_WIDTH_MIN;
    const t = Math.sqrt(Math.min(1, val / maxValOrMinWidth));
    const span = (EDGE_WIDTH_MAX - EDGE_WIDTH_MIN) * intensity;
    return EDGE_WIDTH_MIN + t * span;
  }
  const minWidth = maxValOrMinWidth;
  const maxWidth = intensityOrMaxWidth;
  const t = Math.max(0, Math.min(1, val));
  return minWidth + (maxWidth - minWidth) * Math.pow(t, 0.65);
};
