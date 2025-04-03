'use strict';

var store = require('../store.js');
var unmountRoot = require('./unmountRoot.js');

"use strict";
function processUnmountQueue() {
  for (const root of store.store.unmountQueue) {
    unmountRoot.unmountRoot(root);
  }
}

exports.processUnmountQueue = processUnmountQueue;
//# sourceMappingURL=processUnmountQueue.js.map
