import { Container, Filter } from 'pixi.js';
import { attach } from './attach.mjs';
import { detach } from './detach.mjs';
import { invariant } from './invariant.mjs';
import { log } from './log.mjs';

"use strict";
function insertBefore(parentInstance, childInstance, beforeChildInstance) {
  log("info", "lifecycle::insertBefore");
  invariant(childInstance !== beforeChildInstance, "Cannot insert node before itself");
  if (childInstance instanceof Container) {
    const childContainerInstance = childInstance;
    const childContainer = childInstance;
    const beforeChildContainer = beforeChildInstance;
    if (childContainerInstance.parent === parentInstance) {
      parentInstance.removeChild(childContainer);
    }
    const index = parentInstance.getChildIndex(beforeChildContainer);
    parentInstance.addChildAt(childContainer, index);
  } else if (childInstance instanceof Filter) {
    const childFilterInstance = childInstance;
    const instanceState = childFilterInstance.__pixireact;
    const targetIndex = instanceState.filters.indexOf(beforeChildInstance);
    detach(childInstance);
    attach(parentInstance, childInstance, targetIndex);
  }
}

export { insertBefore };
//# sourceMappingURL=insertBefore.mjs.map
