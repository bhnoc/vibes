/**
 * WebSocket utility functions for dynamic URL generation
 * Supports different environments (development, production, custom servers)
 */

interface WebSocketConfig {
  protocol?: 'ws' | 'wss';
  host?: string;
  port?: number;
  path?: string;
}

/**
 * Get the appropriate WebSocket URL based on current environment
 * @param config Optional configuration to override defaults
 * @returns WebSocket URL string
 */
export function getWebSocketUrl(config: WebSocketConfig = {}): string {
  // Get current location info
  const currentHost = window.location.hostname;
  const currentProtocol = window.location.protocol;
  const currentPort = window.location.port;
  
  // Determine WebSocket protocol based on HTTP protocol
  const wsProtocol = config.protocol || (currentProtocol === 'https:' ? 'wss' : 'ws');
  
  // Determine host (default to current host, fallback to localhost for development)
  let host = config.host || currentHost;
  if (!host || host === '' || host === '0.0.0.0') {
    host = 'localhost';
  }
  
  // Determine port
  let port: number | undefined = config.port;
  
  if (!port) {
    // If we're in development mode (Vite dev server), assume backend is on 8080
    if (currentPort === '5173' || currentPort === '3000' || process.env.NODE_ENV === 'development') {
      port = 8080;
    } else {
      // In production, try to use the same port as the current page
      // unless explicitly configured otherwise
      port = currentPort ? parseInt(currentPort) : undefined;
    }
  }
  
  // Build the URL
  const portSuffix = port ? `:${port}` : '';
  const path = config.path || '/ws';
  
  return `${wsProtocol}://${host}${portSuffix}${path}`;
}

/**
 * Get the base HTTP URL for API calls
 * @param config Optional configuration to override defaults
 * @returns HTTP URL string
 */
export function getApiBaseUrl(config: Partial<WebSocketConfig> = {}): string {
  const currentHost = window.location.hostname;
  const currentProtocol = window.location.protocol;
  const currentPort = window.location.port;
  
  // Determine HTTP protocol
  const httpProtocol = currentProtocol === 'https:' ? 'https' : 'http';
  
  // Determine host
  let host = config.host || currentHost;
  if (!host || host === '' || host === '0.0.0.0') {
    host = 'localhost';
  }
  
  // Determine port
  let port: number | undefined = config.port;
  
  if (!port) {
    // If we're in development mode, assume backend is on 8080
    if (currentPort === '5173' || currentPort === '3000' || process.env.NODE_ENV === 'development') {
      port = 8080;
    } else {
      port = currentPort ? parseInt(currentPort) : undefined;
    }
  }
  
  const portSuffix = port ? `:${port}` : '';
  
  return `${httpProtocol}://${host}${portSuffix}`;
}

/**
 * Check if we're running in development mode
 */
export function isDevelopmentMode(): boolean {
  return process.env.NODE_ENV === 'development' || 
         window.location.port === '5173' || 
         window.location.port === '3000';
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(): { websocketUrl: string; apiBaseUrl: string } {
  // Check for environment variables (for production builds)
  const envBackendHost = import.meta.env.VITE_BACKEND_HOST;
  const envBackendPort = import.meta.env.VITE_BACKEND_PORT;
  
  const config: WebSocketConfig = {};
  
  if (envBackendHost) {
    config.host = envBackendHost;
  }
  
  if (envBackendPort) {
    config.port = parseInt(envBackendPort);
  }
  
  return {
    websocketUrl: getWebSocketUrl(config),
    apiBaseUrl: getApiBaseUrl(config)
  };
}