'use strict';

var log = require('./log.js');

"use strict";
function finalizeInitialChildren() {
  log.log("info", "lifecycle::finalizeInitialChildren");
  return false;
}

exports.finalizeInitialChildren = finalizeInitialChildren;
//# sourceMappingURL=finalizeInitialChildren.js.map
