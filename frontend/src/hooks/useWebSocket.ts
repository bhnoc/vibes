import { useEffect, useState, useRef, useCallback } from 'react';
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
  sendMessage: (message: string) => void;
}

const wsRef = { current: null as WebSocket | null };

export const useWebSocket = (url: string | null): WebSocketState => {
  const [state, setState] = useState<Omit<WebSocketState, 'sendMessage'>>({
    status: url ? 'connecting' : 'waiting',
    error: null,
    captureMode: 'unknown',
    deviceName: ''
  });
  
  const retryCount = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);
  const simulationFallbackRef = useRef<boolean>(false);
  const MAX_RETRIES = 3;
  
  const PERMISSION_ERRORS = [
    'permission denied',
    'requires root',
    'requires administrator',
    'access denied',
    'no such device'
  ];
  
  const { addPacket } = usePacketStore();

  const sendMessage = useCallback((message: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    } else {
      logger.warn('WebSocket not connected. Message not sent:', message);
    }
  }, []);

  useEffect(() => {
    setState({
      status: url ? 'connecting' : 'waiting',
      error: null,
      captureMode: 'unknown',
      deviceName: ''
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
        setState({
          status: 'error',
          error: `Failed to connect after ${MAX_RETRIES} attempts.`,
          captureMode: 'simulated',
          deviceName: ''
        });
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
          retryCount.current = 0;
        };
        
        ws.onclose = () => {
          logger.log('WebSocket connection closed');
          if (wsRef.current === ws) {
            setState(prev => ({ ...prev, status: 'disconnected' }));
            wsRef.current = null;
            if (retryCount.current < MAX_RETRIES) {
              const delay = Math.pow(2, retryCount.current) * 1000;
              timeoutRef.current = setTimeout(() => {
                retryCount.current += 1;
                connectWebSocket();
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
              setState(prev => ({ ...prev, captureMode: data.mode || 'unknown', deviceName: data.interface || prev.deviceName }));
              if (data.error) {
                setState(prev => ({ ...prev, error: data.errorMsg }));
              }
            } else if (data.src && data.dst) {
              addPacket(data);
            }
          } catch (err) {
            logger.error('Error parsing WebSocket message:', err, event.data);
          }
        };
      } catch (err) {
        logger.error('Error creating WebSocket:', err);
        setState({ status: 'error', error: `Failed to create WebSocket: ${(err as Error).message}`, captureMode: 'unknown', deviceName: '' });
      }
    };
    
    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [url, addPacket]);
  
  return { ...state, sendMessage };
};

function getDeviceFromUrl(url: string): string {
  try {
    const interfaceMatch = url.match(/interface=([^&]+)/);
    return interfaceMatch ? interfaceMatch[1] : '';
  } catch (e) {
    return '';
  }
}
