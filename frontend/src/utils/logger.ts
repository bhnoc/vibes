import { useSettingsStore } from '../stores/settingsStore';

/**
 * A logger that only outputs messages when verbose logging is enabled.
 */
export const logger = {
  log: (...args: any[]) => {
    if (useSettingsStore.getState().verboseLogging) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (useSettingsStore.getState().verboseLogging) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    if (useSettingsStore.getState().verboseLogging) {
      console.error(...args);
    }
  },
};
