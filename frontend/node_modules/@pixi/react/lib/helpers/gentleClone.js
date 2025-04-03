'use strict';

"use strict";
function gentleClone(object, ignoredKeys = []) {
  const cloneBase = {};
  return Object.entries(object).reduce((accumulator, [key, value]) => {
    if (!ignoredKeys.includes(key)) {
      accumulator[key] = value;
    }
    return accumulator;
  }, cloneBase);
}

exports.gentleClone = gentleClone;
//# sourceMappingURL=gentleClone.js.map
