import { useEffect, useState, useRef } from 'react';
import { usePacketStore } from '../stores/packetStore';
import { useNetworkStore } from '../stores/networkStore';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
type CaptureMode = 'real' | 'simulated' | 'unknown';

export const useWebSocket = (url: string | null) => {
  // Add a socket reference that persists between renders
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('unknown');
  const [captureInterface, setCaptureInterface] = useState<string>('');
  const { addPacket, clearPackets } = usePacketStore();
  const { clearNetwork } = useNetworkStore();
  const previousUrlRef = useRef<string | null>('');
  
  // Throttle logs and processing
  const lastLogTimeRef = useRef<number>(0);
  const packetBufferRef = useRef<any[]>([]);
  const processingRef = useRef<boolean>(false);
  const memoryWarningShownRef = useRef<boolean>(false);

  useEffect(() => {
    // If no URL is provided, don't connect
    if (!url) {
      console.log('No WebSocket URL provided, not connecting');
      
      // If we had a previous connection, clean it up
      if (socketRef.current) {
        console.log('Closing existing connection due to empty URL');
        socketRef.current.close();
        socketRef.current = null;
      }
      
      return;
    }
    
    // Log clear information about the URL we're connecting to
    console.log(`🔌 WebSocket connecting to: ${url}`);
    console.log(`🔍 Real capture mode requested: ${url.includes('interface=')}`);
    if (url.includes('interface=')) {
      console.log(`📡 Using interface: ${url.split('interface=')[1]}`);
    }
    
    // Store URL in data attribute for other components to access
    document.documentElement.setAttribute('data-ws-url', url);
    
    // Check if URL has changed - log that we're reconnecting
    if (previousUrlRef.current && previousUrlRef.current !== url) {
      console.log(`🔄 WebSocket URL changed from ${previousUrlRef.current} to ${url}, reconnecting...`);
      
      // Clear all previous packet data and network state when URL changes
      clearPackets();
      clearNetwork();
      
      // Important: Close any existing socket first
      if (socketRef.current && socketRef.current.readyState < 2) {
        console.log(`Closing previous WebSocket connection to ${previousUrlRef.current}`);
        socketRef.current.close();
        socketRef.current = null;
      }
    }
    previousUrlRef.current = url;
    
    let processInterval: number;

    // Process packets from buffer at a controlled rate
    const processPackets = () => {
      if (processingRef.current || packetBufferRef.current.length === 0) return;
      
      // Check memory usage if available in the browser
      if (window.performance && (window.performance as any).memory) {
        const memInfo = (window.performance as any).memory;
        const heapLimit = memInfo.jsHeapSizeLimit;
        const usedHeap = memInfo.usedJSHeapSize;
        const heapThreshold = heapLimit * 0.8; // 80% of max
        
        // If memory usage is high
        if (usedHeap > heapThreshold && !memoryWarningShownRef.current) {
          console.warn(`Memory usage high: ${Math.round(usedHeap/1024/1024)}MB / ${Math.round(heapLimit/1024/1024)}MB`);
          memoryWarningShownRef.current = true;
          
          // Emergency buffer clear
          if (usedHeap > heapLimit * 0.9) {
            console.error('Critical memory usage. Clearing packet buffer.');
            packetBufferRef.current = packetBufferRef.current.slice(-50); // Keep only most recent
            clearPackets();
            setError('Memory usage too high. Some data has been cleared.');
          }
        } else if (usedHeap < heapThreshold * 0.7) {
          // Reset warning flag when memory usage goes back down
          memoryWarningShownRef.current = false;
        }
      }
      
      processingRef.current = true;
      
      // Check performance mode
      const highPerformanceMode = (window as any).highPerformanceMode !== false;
      
      // Process a batch of packets (limits depend on performance mode)
      // Even smaller batches to prevent memory buildup
      const batchSize = highPerformanceMode 
        ? Math.min(3, packetBufferRef.current.length) // Process fewer packets in high performance mode
        : Math.min(10, packetBufferRef.current.length); // Process more packets in standard mode
      
      // Take from the start of the buffer (oldest messages first)
      const batch = packetBufferRef.current.splice(0, batchSize);
      
      try {
        batch.forEach(packet => {
          addPacket(packet);
        });
      } catch (e) {
        console.error('Error processing packets:', e);
      }
      
      // Limit buffer size to prevent memory issues
      if (packetBufferRef.current.length > 500) {
        // Keep only most recent packets
        packetBufferRef.current = packetBufferRef.current.slice(-300);
        console.warn(`Packet buffer too large, truncated to 300 most recent packets`);
      }
      
      // Log once every second at most
      const now = Date.now();
      if (now - lastLogTimeRef.current > 1000) {
        console.log(`Processed ${batchSize} packets, ${packetBufferRef.current.length} remaining in buffer (Performance: ${highPerformanceMode ? 'HIGH' : 'STANDARD'})`);
        lastLogTimeRef.current = now;
      }
      
      processingRef.current = false;
    };

    const connect = () => {
      // Don't reconnect if we already have a valid connection to this URL
      if (socketRef.current && socketRef.current.readyState < 2 && previousUrlRef.current === url) {
        console.log(`Already connected to ${url}, skipping reconnection`);
        return;
      }
      
      setStatus('connecting');
      setError(null);
      
      try {
        console.log(`Creating new WebSocket connection to ${url}`);
        const ws = new WebSocket(url);
        socketRef.current = ws;

        ws.onopen = () => {
          console.log(`✅ WebSocket connected successfully to ${url}`);
          setStatus('connected');
          
          // Start processing packets at a controlled rate (60fps = ~16ms)
          // Slower rate to reduce memory pressure (33ms = 30fps)
          processInterval = window.setInterval(processPackets, 33);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle special message types
            if (data.type === 'mode') {
              // This is a mode notification from the server
              console.log(`📣 Server reports capture mode: ${data.mode} on interface: ${data.interface || 'none'}`);
              setCaptureMode(data.mode as CaptureMode);
              setCaptureInterface(data.interface || '');
              
              // Check if this is a fallback from real to simulated due to error
              if (data.error && data.requestedMode === 'real' && data.mode === 'simulated') {
                console.error(`⚠️ Real capture failed and fell back to simulation: ${data.errorMsg}`);
                setError(`Real capture failed: ${data.errorMsg}. Using simulation instead.`);
                
                // If this looks like a permission error, provide more specific guidance
                if (data.errorMsg.includes('Permission') || data.errorMsg.includes('permission')) {
                  setError('Permission denied: Real capture requires administrator/root privileges. Using simulation instead.');
                }
              }
              return;
            }
            
            // Regular packet data
            // Instead of processing immediately, add to buffer
            packetBufferRef.current.push(data);
          } catch (err) {
            console.error('Failed to parse packet:', err);
            setError('Failed to parse packet data');
          }
        };

        ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          setStatus('error');
          setError('Connection error');
        };

        ws.onclose = (event) => {
          console.log(`WebSocket disconnected with code ${event.code}`);
          
          if (event.code === 1006 && url.includes('interface=')) {
            // Abnormal closure - might be permission issue
            setError('Failed to capture: Permission denied. Try running as administrator/root.');
          }
          
          setStatus('disconnected');
          socketRef.current = null;
          
          // Clear processing interval
          if (processInterval) {
            window.clearInterval(processInterval);
          }
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        setStatus('error');
        setError('Failed to create connection');
      }
    };

    connect();

    return () => {
      console.log('🔌 Cleaning up WebSocket connection');
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (processInterval) {
        window.clearInterval(processInterval);
      }
      
      // Clear packet buffer
      packetBufferRef.current = [];
    };
  }, [url, addPacket, clearPackets, clearNetwork]);

  return { status, error, captureMode, captureInterface };
}; 