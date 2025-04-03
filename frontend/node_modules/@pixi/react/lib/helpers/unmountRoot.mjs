import { reconciler } from '../core/reconciler.mjs';
import { roots } from '../core/roots.mjs';
import { store } from '../store.mjs';

"use strict";
function unmountRoot(root) {
  store.unmountQueue.delete(root);
  const fiber = root.fiber;
  if (fiber) {
    reconciler.updateContainer(null, fiber, null, () => {
      if (root.applicationState.app) {
        root.applicationState.app.destroy();
      }
      roots.delete(root.internalState.canvas);
    });
  }
}

export { unmountRoot };
//# sourceMappingURL=unmountRoot.mjs.map
