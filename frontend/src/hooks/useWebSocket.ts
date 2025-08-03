import { useEffect, useState, useRef } from 'react';
import { usePacketStore } from '../stores/packetStore';
import { useNetworkStore } from '../stores/networkStore';
import { getWebSocketUrl } from '../utils/websocketUtils';
import { logger } from '../utils/logger';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'waiting';
type CaptureMode = 'real' | 'simulated' | 'unknown' | 'waiting';

interface WebSocketState {
  status: ConnectionStatus;
  error: string | null;
  captureMode: CaptureMode;
  deviceName: string;
}

export const useWebSocket = (url: string | null): WebSocketState => {
  const [state, setState] = useState<WebSocketState>({
    status: url ? 'connecting' : 'waiting',
    error: null,
    captureMode: 'unknown',
    deviceName: ''
  });
  
  // Track connection attempts to avoid infinite retry loops
  const retryCount = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<number | null>(null);
  
  // Track if we've fallen back to simulation mode
  const simulationFallbackRef = useRef<boolean>(false);
  
  // Maximum retry count to prevent excessive attempts
  const MAX_RETRIES = 3;
  
  // Common errors that indicate we should degrade to simulation mode
  const PERMISSION_ERRORS = [
    'permission denied',
    'requires root',
    'requires administrator',
    'access denied',
    'no such device'
  ];
  
  const { addPacket, clearPackets, trimPackets } = usePacketStore();
  const { clearNetwork } = useNetworkStore();
  const previousUrlRef = useRef<string | null>('');
  
  // Memory management
  const lastMemoryCheckRef = useRef<number>(Date.now());
  
  // Throttle logs and processing
  const lastLogTimeRef = useRef<number>(0);
  const packetBufferRef = useRef<any[]>([]);
  const processingRef = useRef<boolean>(false);
  const memoryWarningShownRef = useRef<boolean>(false);
  
  // Debugging
  const debugLoggedRef = useRef<boolean>(false);
  const packetCountRef = useRef<number>(0);

  useEffect(() => {
    // Reset connection state when URL changes
    setState({
      status: url ? 'connecting' : 'waiting',
      error: null,
      captureMode: 'unknown',
      deviceName: ''
    });
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Don't connect if URL is null (waiting for configuration)
    if (!url) {
      return;
    }
    
    // Reset retry count on URL change
    retryCount.current = 0;
    
    const connectWebSocket = () => {
      if (retryCount.current >= MAX_RETRIES) {
        // Too many retries, degrade to simulation mode
        logger.warn(`⚠️ Failed to connect after ${MAX_RETRIES} attempts. Switching to simulation mode.`);
        
        setState({
          status: 'error',
          error: `Failed to connect after ${MAX_RETRIES} attempts.`,
          captureMode: 'simulated',
          deviceName: ''
        });
        
        // Attempt to connect to simulation mode
        if (!simulationFallbackRef.current && !url.includes('simulation')) {
          simulationFallbackRef.current = true;
          
          // Try to connect to simulation WebSocket after a delay
          timeoutRef.current = setTimeout(() => {
            logger.log('Attempting to connect to simulation websocket...');
            const simulationWsUrl = getWebSocketUrl();
            const simulationWs = new WebSocket(simulationWsUrl);
            
            simulationWs.onopen = () => {
              logger.log('Connected to simulation websocket');
              wsRef.current = simulationWs;
              setState({
                status: 'connected',
                error: null,
                captureMode: 'simulated',
                deviceName: ''
              });
            };
            
            simulationWs.onerror = (error) => {
              logger.error('Failed to connect to simulation websocket:', error);
              setState({
                status: 'error',
                error: 'Failed to connect to simulation websocket.',
                captureMode: 'unknown',
                deviceName: ''
              });
            };
            
            // Handle simulation messages
            // (rest of simulation websocket handlers)
          }, 1000);
        }
        
        return;
      }
      
      logger.log(`Connecting to WebSocket at ${url} (attempt ${retryCount.current + 1}/${MAX_RETRIES})...`);
      
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;
        
        ws.onopen = () => {
          logger.log('WebSocket connected successfully!');
          setState({
            status: 'connected',
            error: null,
            captureMode: url.includes('simulation') ? 'simulated' : 'real',
            deviceName: getDeviceFromUrl(url)
          });
          
          // Reset retry count on successful connection
          retryCount.current = 0;
        };
        
        ws.onclose = () => {
          logger.log('WebSocket connection closed');
          
          if (wsRef.current === ws) {
            setState(prev => ({
              ...prev,
              status: 'disconnected',
            }));
            
            wsRef.current = null;
            
            // Only attempt reconnect if not at max retries
            if (retryCount.current < MAX_RETRIES) {
              const delay = Math.pow(2, retryCount.current) * 1000; // Exponential backoff
              logger.log(`Will attempt to reconnect in ${delay/1000} seconds`);
              
              timeoutRef.current = setTimeout(() => {
                retryCount.current += 1;
                connectWebSocket();
              }, delay);
            }
          }
        };
        
        ws.onerror = (error) => {
          logger.error('WebSocket error:', error);
          
          // WebSocket error events don't provide a message, but we'll get a close event next
          setState(prev => ({
            ...prev,
            status: 'error',
            error: 'Connection error'
          }));
        };
        
                ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Debug first few packets to confirm data flow
            if (!debugLoggedRef.current) {
              logger.log('FIRST PACKET RECEIVED:', data);
              debugLoggedRef.current = true;
            }
            
            // Check for error messages
            if (data.error) {
              logger.warn('Error message from server:', data);
              
              // Check if this is a permission-related error
              let errorMsg = '';
              
              // Handle both boolean error flag and string error messages
              if (typeof data.error === 'string') {
                errorMsg = data.error.toLowerCase();
              } else if (data.errorMsg) {
                // In mode messages, the error is in errorMsg
                errorMsg = data.errorMsg.toLowerCase();
              }
              
              const isPermissionError = PERMISSION_ERRORS.some(err => 
                errorMsg.includes(err) || (data.errorMsg && data.errorMsg.toLowerCase().includes(err))
              );
              
              if (isPermissionError) {
                logger.warn(`⚠️ Real capture failed and fell back to simulation: ${data.errorMsg || 'Permission denied'}`);
                
                // Force simulation mode with clear visibility
                logger.log('CRITICAL: Forcing simulation mode for reliable operation');
                
                // Close current connection
                ws.close();
                
                // Update state to indicate error
                setState({
                  status: 'error',
                  error: `Permission error: ${data.errorMsg || 'Permission denied'}`,
                  captureMode: 'simulated', // Fall back to simulation
                  deviceName: ''
                });
                
                // Try to connect to simulation WebSocket immediately
                timeoutRef.current = setTimeout(() => {
                  logger.log('Connecting to simulation websocket...');
                  const simulationWsUrl = getWebSocketUrl();
                  const simulationWs = new WebSocket(simulationWsUrl);
                  
                  simulationWs.onopen = () => {
                    logger.log('Connected to simulation websocket!');
                    wsRef.current = simulationWs;
                    setState({
                      status: 'connected',
                      error: null,
                      captureMode: 'simulated',
                      deviceName: 'simulation'
                    });
                  };
                  
                  // Setup same error handlers
                  simulationWs.onerror = (err) => {
                    logger.error('Simulation WebSocket error:', err);
                  };
                  
                  // Set up same message handler
                  simulationWs.onmessage = ws.onmessage;
                }, 500);
                
                return;
              }
            }
            
            // Process different message types
            if (data.type === 'mode') {
              logger.log('Received mode message:', data);
              
              // Update state with actual capture mode
              setState(prev => ({
                ...prev,
                captureMode: data.mode || 'unknown',
                deviceName: data.interface || prev.deviceName
              }));
              
              // If there was an error, log it
              if (data.error) {
                logger.warn(`Mode error: ${data.errorMsg}`);
                setState(prev => ({
                  ...prev,
                  error: data.errorMsg
                }));
              }
            }
            else if (data.src && data.dst) {
              // This looks like a packet - debug the first 3 to ensure data flow
              if (packetCountRef.current < 3) {
                logger.log(`DEBUG PACKET #${packetCountRef.current + 1}:`, data);
              }
              
              // Count packets for debugging
              packetCountRef.current++;
              
              // Every 500 packets, log a summary for debugging  
              if (packetCountRef.current % 500 === 0) {
                logger.log(`Received ${packetCountRef.current} total packets`);
              }
              
              // CRITICAL FIX: Use the new batched addPacket to prevent infinite loops
              // This will batch packets and flush them every 50ms instead of immediate processing
              addPacket(data);
            }
            else {
              logger.log('Unknown message type:', data);
            }
            
          } catch (err) {
            logger.error('Error parsing WebSocket message:', err, event.data);
          }
        };
      } catch (err) {
        logger.error('Error creating WebSocket:', err);
        setState({
          status: 'error',
          error: `Failed to create WebSocket: ${(err as Error).message}`,
          captureMode: 'unknown',
          deviceName: ''
        });
        
        // Still attempt retry
        retryCount.current += 1;
        
        const delay = Math.pow(2, retryCount.current) * 1000; // Exponential backoff
        timeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, delay);
      }
    };
    
    // Start the connection process
    connectWebSocket();
    
    // Cleanup on unmount or URL change
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [url]);
  
  return state;
};

// Helper to extract device name from URL
function getDeviceFromUrl(url: string): string {
  try {
    const interfaceMatch = url.match(/interface=([^&]+)/);
    return interfaceMatch ? interfaceMatch[1] : '';
  } catch (e) {
    return '';
  }
}
