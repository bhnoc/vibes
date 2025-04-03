'use strict';

var log = require('./log.js');

"use strict";
function prepareForCommit() {
  log.log("info", "lifecycle::prepareForCommit");
  return null;
}

exports.prepareForCommit = prepareForCommit;
//# sourceMappingURL=prepareForCommit.js.map
