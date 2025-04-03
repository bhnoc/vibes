import { roots } from '../core/roots.mjs';
import { store } from '../store.mjs';

"use strict";
function unqueueForUnmount(canvas) {
  const root = roots.get(canvas);
  if (root) {
    store.unmountQueue.delete(root);
  }
}

export { unqueueForUnmount };
//# sourceMappingURL=unqueueForUnmount.mjs.map
