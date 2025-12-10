import { useEffect, useRef } from 'react';
import { useNetworkStore } from '../stores/networkStore';
import { usePhysicsStore } from '../stores/physicsStore';
import { logger } from '../utils/logger';

/**
 * Hook to periodically clean up expired network elements
 * This removes nodes and connections that have exceeded their connectionLifetime
 */
export const useNetworkCleanup = () => {
  const lastCleanupTime = useRef<number>(0);
  const { removeInactiveElements } = useNetworkStore();
  const { connectionLifetime } = usePhysicsStore();

  useEffect(() => {
    // Clean up expired elements every 1 second
    // This is lightweight because removeInactiveElements() only updates if something changed
    const CLEANUP_INTERVAL = 1000; // 1 second

    const intervalId = setInterval(() => {
      const now = Date.now();

      // Log cleanup timing occasionally (every 10 seconds)
      if (now - lastCleanupTime.current > 10000) {
        logger.log(`🧹 Running periodic cleanup (connectionLifetime: ${connectionLifetime}ms)`);
        lastCleanupTime.current = now;
      }

      // Remove nodes/connections that have exceeded their lifetime
      removeInactiveElements();
    }, CLEANUP_INTERVAL);

    logger.log('✅ Network cleanup system started (runs every 1s)');

    return () => {
      clearInterval(intervalId);
      logger.log('🛑 Network cleanup system stopped');
    };
  }, [removeInactiveElements, connectionLifetime]);
};
