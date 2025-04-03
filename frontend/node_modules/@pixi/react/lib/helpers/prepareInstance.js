'use strict';

"use strict";
function prepareInstance(component, state = {}) {
  const instance = component;
  instance.__pixireact = Object.assign({
    filters: [],
    parent: null,
    root: null,
    type: ""
  }, state);
  return instance;
}

exports.prepareInstance = prepareInstance;
//# sourceMappingURL=prepareInstance.js.map
