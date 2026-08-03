import { useEffect, useState, useRef, useCallback } from 'react';
import { usePacketStore } from '../stores/packetStore';
import { useNetworkStore } from '../stores/networkStore';
import { getWebSocketUrl } from '../utils/websocketUtils';
import { logger } from '../utils/logger';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'waiting';
type CaptureMode = 'real' | 'simulated' | 'zeek_conn' | 'unknown' | 'waiting';

/**
 * A capture the backend could not start.
 *
 * The server does not refuse the connection when a live interface fails to open:
 * it falls back to synthetic traffic and says so in the mode frame. Without
 * carrying that admission up to the UI the operator watches fabricated packets
 * believing they are their own wire, which is the worst failure this tool has.
 */
export interface CaptureFailure {
  /** The backend's own words, e.g. the libpcap error. */
  message: string;
  /** What the operator asked for before the fallback, e.g. "real". */
  requestedMode: string;
  /** The interface the backend tried to open. */
  device: string;
  /** True when the message reads as a privileges problem, which is the usual cause. */
  permissions: boolean;
}

interface WebSocketState {
  status: ConnectionStatus;
  error: string | null;
  captureMode: CaptureMode;
  deviceName: string;
  /** Set when the backend fell back to simulation instead of the requested capture. */
  captureFailure: CaptureFailure | null;
  sendMessage: (message: string) => void;
}

export const useWebSocket = (url: string | null): WebSocketState => {
  const wsRef = useRef<WebSocket | null>(null);
  const isMounted = useRef<boolean>(true);

  const [state, setState] = useState<Omit<WebSocketState, 'sendMessage'>>({
    status: url ? 'connecting' : 'waiting',
    error: null,
    captureMode: 'unknown',
    deviceName: '',
    captureFailure: null
  });
  
  const retryCount = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);
  const MAX_RETRIES = 3;
  
  const { addPacket } = usePacketStore();

  const sendMessage = useCallback((message: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    } else {
      logger.warn('WebSocket not connected. Message not sent:', message);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    setState({
      status: url ? 'connecting' : 'waiting',
      error: null,
      captureMode: 'unknown',
      deviceName: '',
      captureFailure: null
    });
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    if (!url) {
      return;
    }
    
    retryCount.current = 0;
    
    const connectWebSocket = () => {
      if (retryCount.current >= MAX_RETRIES) {
        logger.warn(`⚠️ Failed to connect after ${MAX_RETRIES} attempts. Switching to simulation mode.`);
        setState(prev => ({
          ...prev,
          status: 'error',
          error: `Failed to connect after ${MAX_RETRIES} attempts.`,
          captureMode: 'simulated',
          deviceName: ''
        }));
        return;
      }
      
      logger.log(`Connecting to WebSocket at ${url} (attempt ${retryCount.current + 1}/${MAX_RETRIES})...`);
      
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;
        
        ws.onopen = () => {
          logger.log('WebSocket connected successfully!');
          let guess: CaptureMode = 'simulated';
          if (url.includes('zeek_tcp')) {
            guess = 'zeek_conn';
          } else if (url.includes('interface=')) {
            guess = 'real';
          }
          setState({
            status: 'connected',
            error: null,
            captureMode: guess,
            deviceName: getDeviceFromUrl(url),
            captureFailure: null
          });
          retryCount.current = 0;
        };
        
        ws.onclose = () => {
          logger.log('WebSocket connection closed');
          if (wsRef.current === ws) {
            wsRef.current = null;
            if (!isMounted.current) {
              return;
            }
            setState(prev => ({ ...prev, status: 'disconnected' }));
            if (retryCount.current < MAX_RETRIES) {
              const delay = Math.pow(2, retryCount.current) * 1000;
              timeoutRef.current = setTimeout(() => {
                if (isMounted.current) {
                  retryCount.current += 1;
                  connectWebSocket();
                }
              }, delay);
            }
          }
        };
        
        ws.onerror = (error) => {
          logger.error('WebSocket error:', error);
          setState(prev => ({ ...prev, status: 'error', error: 'Connection error' }));
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'mode') {
              const device = data.interface || '';
              // `error` means the requested capture would not start and the
              // backend substituted simulation. Keep the reason, the request and
              // the device together: on its own "Permission denied" does not tell
              // the operator which interface refused them.
              const failure: CaptureFailure | null = data.error
                ? {
                    message: String(data.errorMsg || 'The backend could not start this capture.'),
                    requestedMode: String(data.requestedMode || 'real'),
                    device,
                    permissions: isPermissionError(String(data.errorMsg || '')),
                  }
                : null;

              setState(prev => ({
                ...prev,
                captureMode: data.mode || 'unknown',
                deviceName: device || prev.deviceName,
                captureFailure: failure,
                error: failure ? describeFailure(failure) : prev.error,
              }));
            } else if (data.src && data.dst) {
              addPacket(data);
            }
          } catch (err) {
            logger.error('Error parsing WebSocket message:', err, event.data);
          }
        };
      } catch (err) {
        logger.error('Error creating WebSocket:', err);
        setState(prev => ({ ...prev, status: 'error', error: `Failed to create WebSocket: ${(err as Error).message}`, captureMode: 'unknown', deviceName: '' }));
      }
    };
    
    connectWebSocket();
    
    return () => {
      isMounted.current = false;
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        ws.close();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [url, addPacket]);
  
  return { ...state, sendMessage };
};

// Opening a live interface is a privileged operation on every platform this runs
// on, and that is by far the most common reason a capture will not start. The
// backend passes libpcap's wording straight through, so match on it.
const PERMISSION_ERRORS = [
  'permission denied',
  'requires root',
  'requires administrator',
  'access denied',
  'operation not permitted',
];

function isPermissionError(message: string): boolean {
  const m = message.toLowerCase();
  return PERMISSION_ERRORS.some(p => m.includes(p));
}

/** One sentence an operator can act on, for the status bar and the settings panel. */
export function describeFailure(f: CaptureFailure): string {
  const where = f.device ? ` on ${f.device}` : '';
  if (f.permissions) {
    return `Live capture${where} was refused: the backend needs administrator/root privileges. Showing simulated traffic.`;
  }
  return `Live capture${where} failed: ${f.message}. Showing simulated traffic.`;
}

function getDeviceFromUrl(url: string): string {
  try {
    const interfaceMatch = url.match(/interface=([^&]+)/);
    return interfaceMatch ? interfaceMatch[1] : '';
  } catch (e) {
    return '';
  }
}
