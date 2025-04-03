import { Filter } from 'pixi.js';

"use strict";
function detach(childInstance) {
  if (childInstance instanceof Filter) {
    const parentInstance = childInstance.__pixireact.parent;
    if (parentInstance) {
      const filterIndex = parentInstance.__pixireact.filters.indexOf(childInstance);
      parentInstance.__pixireact.filters.splice(filterIndex, 1);
      parentInstance.filters = parentInstance.__pixireact.filters;
    }
    childInstance.__pixireact.parent = null;
  }
}

export { detach };
//# sourceMappingURL=detach.mjs.map
