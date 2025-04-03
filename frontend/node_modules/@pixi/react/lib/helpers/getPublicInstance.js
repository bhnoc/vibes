'use strict';

var log = require('./log.js');

"use strict";
function getPublicInstance(instance) {
  log.log("info", "lifecycle::getPublicInstance");
  return instance;
}

exports.getPublicInstance = getPublicInstance;
//# sourceMappingURL=getPublicInstance.js.map
