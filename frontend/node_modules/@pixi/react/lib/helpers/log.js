'use strict';

var store = require('../store.js');

"use strict";
function log(logType, ...args) {
  if (!store.store.debug) {
    return;
  }
  const logMethod = console[logType];
  if (!(logMethod instanceof Function)) {
    console.warn(`Attempted to create an invalid log type: "${logType}"`);
    return;
  }
  logMethod("@pixi/react", ...args);
}

exports.log = log;
//# sourceMappingURL=log.js.map
