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

/**
 * Calculates a node size based on traffic volume
 * Uses logarithmic scale to prevent huge nodes
 */
export const calculateNodeSize = (trafficVolume: number): number => {
  // Base size is 10, max size is 50
  const minSize = 10
  const maxSize = 50
  
  if (trafficVolume <= 0) {
    return minSize
  }
  
  // Logarithmic scaling
  const size = minSize + (Math.log10(trafficVolume) * 5)
  
  return Math.min(size, maxSize)
} 