import { roots } from '../core/roots.mjs';
import { store } from '../store.mjs';
import { unmountRoot } from './unmountRoot.mjs';

"use strict";
function queueForUnmount(canvas) {
  const root = roots.get(canvas);
  if (root) {
    if (root.applicationState.isInitialised) {
      unmountRoot(root);
    } else {
      store.unmountQueue.add(root);
    }
  }
}

export { queueForUnmount };
//# sourceMappingURL=queueForUnmount.mjs.map
