'use strict';

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

exports.isDiffSet = isDiffSet;
//# sourceMappingURL=isDiffSet.js.map
