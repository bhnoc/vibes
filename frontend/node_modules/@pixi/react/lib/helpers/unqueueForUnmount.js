'use strict';

var roots = require('../core/roots.js');
var store = require('../store.js');

"use strict";
function unqueueForUnmount(canvas) {
  const root = roots.roots.get(canvas);
  if (root) {
    store.store.unmountQueue.delete(root);
  }
}

exports.unqueueForUnmount = unqueueForUnmount;
//# sourceMappingURL=unqueueForUnmount.js.map
