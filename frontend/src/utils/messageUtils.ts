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
export const NODE_RADIUS_MIN = 6
export const NODE_RADIUS_MAX = 26

/**
 * Maps absolute traffic volume → radius (legacy absolute scale).
 * Prefer calculateRelativeNodeRadius for peer-relative sizing.
 */
export const calculateNodeSize = (trafficVolume: number): number => {
  const minSize = NODE_RADIUS_MIN
  const maxSize = NODE_RADIUS_MAX

  if (trafficVolume <= 0) {
    return minSize
  }

  const size = minSize + (Math.log10(trafficVolume) * 5)
  return Math.min(size, maxSize)
}

/**
 * Peer-relative node radius: `relativeLoad` is this node's share of the
 * heaviest visible talker (0..1). Sqrt softens winner-take-all spikes.
 */
export const calculateRelativeNodeRadius = (
  relativeLoad: number,
  minRadius = NODE_RADIUS_MIN,
  maxRadius = NODE_RADIUS_MAX,
): number => {
  const t = Math.max(0, Math.min(1, relativeLoad))
  return minRadius + (maxRadius - minRadius) * Math.sqrt(t)
}

/**
 * Peer-relative edge stroke width from this edge's share of the heaviest
 * visible flow (0..1). Quiet links stay thin; hot links read as pipes.
 */
export const calculateRelativeEdgeWidth = (
  relativeWeight: number,
  minWidth = 1,
  maxWidth = 9,
): number => {
  const t = Math.max(0, Math.min(1, relativeWeight))
  return minWidth + (maxWidth - minWidth) * Math.pow(t, 0.65)
} 