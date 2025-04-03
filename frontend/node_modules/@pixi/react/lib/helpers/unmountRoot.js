'use strict';

var reconciler = require('../core/reconciler.js');
var roots = require('../core/roots.js');
var store = require('../store.js');

"use strict";
function unmountRoot(root) {
  store.store.unmountQueue.delete(root);
  const fiber = root.fiber;
  if (fiber) {
    reconciler.reconciler.updateContainer(null, fiber, null, () => {
      if (root.applicationState.app) {
        root.applicationState.app.destroy();
      }
      roots.roots.delete(root.internalState.canvas);
    });
  }
}

exports.unmountRoot = unmountRoot;
//# sourceMappingURL=unmountRoot.js.map
