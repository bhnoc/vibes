'use strict';

var roots = require('../core/roots.js');
var store = require('../store.js');
var unmountRoot = require('./unmountRoot.js');

"use strict";
function queueForUnmount(canvas) {
  const root = roots.roots.get(canvas);
  if (root) {
    if (root.applicationState.isInitialised) {
      unmountRoot.unmountRoot(root);
    } else {
      store.store.unmountQueue.add(root);
    }
  }
}

exports.queueForUnmount = queueForUnmount;
//# sourceMappingURL=queueForUnmount.js.map
