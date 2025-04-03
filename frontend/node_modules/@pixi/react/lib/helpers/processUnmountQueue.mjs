import { store } from '../store.mjs';
import { unmountRoot } from './unmountRoot.mjs';

"use strict";
function processUnmountQueue() {
  for (const root of store.unmountQueue) {
    unmountRoot(root);
  }
}

export { processUnmountQueue };
//# sourceMappingURL=processUnmountQueue.mjs.map
