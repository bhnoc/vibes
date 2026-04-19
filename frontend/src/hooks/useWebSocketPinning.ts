import { useEffect, useRef } from 'react';
import { usePinStore } from '../stores/pinStore';

/** Pass `sendMessage` from the same `useWebSocket` instance that owns the connection (do not open a second socket). */
export const useWebSocketPinning = (sendMessage: (message: string) => void) => {
  const { pinningRules } = usePinStore();
  const previousRules = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentRules = new Set(pinningRules);
    
    const rulesToPin = new Set([...currentRules].filter(x => !previousRules.current.has(x)));
    rulesToPin.forEach(rule => {
      sendMessage(JSON.stringify({ type: 'pinRule', rule: rule }));
    });

    const rulesToUnpin = new Set([...previousRules.current].filter(x => !currentRules.has(x)));
    rulesToUnpin.forEach(rule => {
      sendMessage(JSON.stringify({ type: 'unpinRule', rule: rule }));
    });

    if (previousRules.current.size > 0 && currentRules.size === 0) {
      sendMessage(JSON.stringify({ type: 'clearAllPins' }));
    }

    previousRules.current = currentRules;
  }, [pinningRules, sendMessage]);
};
