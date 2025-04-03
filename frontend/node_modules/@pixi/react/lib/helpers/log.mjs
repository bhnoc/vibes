import { store } from '../store.mjs';

"use strict";
function log(logType, ...args) {
  if (!store.debug) {
    return;
  }
  const logMethod = console[logType];
  if (!(logMethod instanceof Function)) {
    console.warn(`Attempted to create an invalid log type: "${logType}"`);
    return;
  }
  logMethod("@pixi/react", ...args);
}

export { log };
//# sourceMappingURL=log.mjs.map
