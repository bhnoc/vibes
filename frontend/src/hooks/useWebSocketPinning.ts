import { useEffect, useRef } from 'react';
import { usePinStore } from '../stores/pinStore';
import { useWebSocket } from './useWebSocket'; // Assuming you have this hook

export const useWebSocketPinning = () => {
  const { pinningRules } = usePinStore();
  const { sendMessage } = useWebSocket();
  const previousRules = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentRules = new Set(pinningRules);
    
    // Find new rules to pin
    const rulesToPin = new Set([...currentRules].filter(x => !previousRules.current.has(x)));
    rulesToPin.forEach(rule => {
      sendMessage(JSON.stringify({ type: 'pinRule', rule: rule }));
    });

    // Find rules to unpin
    const rulesToUnpin = new Set([...previousRules.current].filter(x => !currentRules.has(x)));
    rulesToUnpin.forEach(rule => {
      sendMessage(JSON.stringify({ type: 'unpinRule', rule: rule }));
    });

    // Check for clear all
    if (previousRules.current.size > 0 && currentRules.size === 0) {
      sendMessage(JSON.stringify({ type: 'clearAllPins' }));
    }

    previousRules.current = currentRules;
  }, [pinningRules, sendMessage]);
};
