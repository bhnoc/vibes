import { Filter } from 'pixi.js';

"use strict";
function attach(parentInstance, childInstance, targetIndex) {
  if (childInstance instanceof Filter) {
    childInstance.__pixireact.parent = parentInstance;
    if (typeof targetIndex === "number") {
      parentInstance.__pixireact.filters.splice(targetIndex, 0, childInstance);
    } else {
      parentInstance.__pixireact.filters.push(childInstance);
    }
    parentInstance.filters = parentInstance.__pixireact.filters;
  }
}

export { attach };
//# sourceMappingURL=attach.mjs.map
