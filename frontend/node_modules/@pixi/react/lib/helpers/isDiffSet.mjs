"use strict";
function isDiffSet(input) {
  const inputAsDiffSet = input;
  if (!inputAsDiffSet) {
    return false;
  }
  if (!inputAsDiffSet.changes) {
    return false;
  }
  return true;
}

export { isDiffSet };
//# sourceMappingURL=isDiffSet.mjs.map
