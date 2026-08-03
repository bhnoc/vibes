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

/** World-space radius range for host nodes (packet-volume driven). */
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
 * Node radius relative to the busiest visible peer (live connection count).
 * sqrt scale keeps hubs readable without swallowing quiet hosts.
 * `intensity` scales the effect: 0 = off (uniform min size), 1 = full span.
 */
export const calculateRelativeNodeRadius = (
  connectionCount: number,
  maxConnectionCount: number,
  intensity = 1,
): number => {
  const amount = Math.max(0, Math.min(1, intensity));
  if (amount <= 0 || connectionCount <= 0 || maxConnectionCount <= 0) return NODE_RADIUS_MIN;
  const t = Math.sqrt(Math.min(1, connectionCount / maxConnectionCount));
  const span = (NODE_RADIUS_MAX - NODE_RADIUS_MIN) * amount;
  return NODE_RADIUS_MIN + t * span;
};

/**
 * Edge stroke width relative to the heaviest visible flow (byte throughput).
 * `intensity` scales the effect: 0 = off (uniform min width), 1 = full span.
 */
export const calculateRelativeEdgeWidth = (
  throughput: number,
  maxThroughput: number,
  intensity = 1,
): number => {
  const amount = Math.max(0, Math.min(1, intensity));
  if (amount <= 0 || throughput <= 0 || maxThroughput <= 0) return EDGE_WIDTH_MIN;
  const t = Math.sqrt(Math.min(1, throughput / maxThroughput));
  const span = (EDGE_WIDTH_MAX - EDGE_WIDTH_MIN) * amount;
  return EDGE_WIDTH_MIN + t * span;
}; 