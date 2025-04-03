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

export { prepareInstance };
//# sourceMappingURL=prepareInstance.mjs.map
